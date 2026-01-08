import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../config/database.js';
import { logger, log } from '../config/logger.js';
import { generateToken, hashToken } from '../utils/helpers.js';
import { generateToken as generateJWT } from '../middleware/auth.js';
import { sendMagicLinkEmail } from '../services/resendService.js';
import { logAdminLogin, logAdminLogout } from '../services/auditService.js';
import { AppError, errors, asyncHandler } from '../middleware/errorHandler.js';
import type { ApiResponse, UserRole } from '../types/index.js';

const MAGIC_LINK_EXPIRY_HOURS = 24;
const BCRYPT_ROUNDS = 10;

/**
 * Request magic link for login
 * POST /api/auth/magic-link/request
 */
export const requestMagicLink = asyncHandler(async (
  req: Request<object, ApiResponse, { email: string }>,
  res: Response<ApiResponse>
) => {
  const { email } = req.body;

  // Check if user exists and is active
  const adminUser = await prisma.adminUser.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!adminUser || !adminUser.isActive) {
    // Don't reveal if user exists
    logger.warn('Magic link requested for unknown/inactive email', { email });
    res.json({
      success: true,
      message: 'If your email is registered, you will receive a login link.',
    });
    return;
  }

  // Check rate limit (max 5 magic links per 24 hours)
  const recentLinks = await prisma.magicLink.count({
    where: {
      email: email.toLowerCase(),
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    },
  });

  if (recentLinks >= 5) {
    logger.warn('Magic link rate limit exceeded', { email });
    throw new AppError(
      'Too many login requests. Please try again later.',
      429,
      'RATE_LIMIT_EXCEEDED'
    );
  }

  // Generate token
  const token = generateToken(32);
  const hashedToken = await bcrypt.hash(token, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_HOURS * 60 * 60 * 1000);

  // Store magic link in database
  await prisma.magicLink.create({
    data: {
      email: email.toLowerCase(),
      token: hashedToken,
      expiresAt,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    },
  });

  // Send email
  const emailResult = await sendMagicLinkEmail(email, token, expiresAt);

  if (!emailResult.success) {
    logger.error('Failed to send magic link email', { email, error: emailResult.error });
    throw new AppError(
      'Failed to send login email. Please try again.',
      500,
      'EMAIL_SEND_FAILED'
    );
  }

  log.auth.magicLinkSent(email);

  res.json({
    success: true,
    message: 'If your email is registered, you will receive a login link.',
  });
});

/**
 * Verify magic link and create session
 * GET /api/auth/magic-link/verify
 */
export const verifyMagicLink = asyncHandler(async (
  req: Request<object, ApiResponse, object, { token: string }>,
  res: Response<ApiResponse>
) => {
  const { token } = req.query;

  if (!token) {
    throw errors.magicLinkInvalid();
  }

  // Find all unused, non-expired magic links
  const magicLinks = await prisma.magicLink.findMany({
    where: {
      used: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    take: 100, // Limit for performance
  });

  // Find matching token
  let matchedLink = null;
  for (const link of magicLinks) {
    const isMatch = await bcrypt.compare(token, link.token);
    if (isMatch) {
      matchedLink = link;
      break;
    }
  }

  if (!matchedLink) {
    logger.warn('Invalid or expired magic link used', { ip: req.ip });
    throw errors.magicLinkInvalid();
  }

  // Mark as used
  await prisma.magicLink.update({
    where: { id: matchedLink.id },
    data: {
      used: true,
      usedAt: new Date(),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    },
  });

  // Get admin user
  const adminUser = await prisma.adminUser.findUnique({
    where: { email: matchedLink.email },
  });

  if (!adminUser || !adminUser.isActive) {
    throw errors.unauthorized();
  }

  // Update last login
  await prisma.adminUser.update({
    where: { id: adminUser.id },
    data: { lastLoginAt: new Date() },
  });

  // Generate JWT
  const jwtToken = generateJWT({
    sub: adminUser.id,
    email: adminUser.email,
    role: adminUser.role as UserRole,
  });

  // Create session record
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      email: adminUser.email,
      token: hashToken(jwtToken),
      role: adminUser.role,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      expiresAt,
    },
  });

  log.auth.loginSuccess(adminUser.email);
  await logAdminLogin(adminUser.email, req.ip, req.get('user-agent'));

  // Set cookie and return token
  res.cookie('session', jwtToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  });

  res.json({
    success: true,
    data: {
      token: jwtToken,
      user: {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role,
      },
      expiresAt: expiresAt.toISOString(),
    },
  });
});

/**
 * Logout and invalidate session
 * POST /api/auth/logout
 */
export const logout = asyncHandler(async (
  req: Request,
  res: Response<ApiResponse>
) => {
  const session = req.session;

  if (session) {
    // Delete session from database
    await prisma.session.deleteMany({
      where: { email: session.email },
    });

    log.auth.logout(session.email);
    await logAdminLogout(session.email, req.ip);
  }

  // Clear cookie
  res.clearCookie('session');

  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

/**
 * Get current user info
 * GET /api/auth/me
 */
export const getCurrentUser = asyncHandler(async (
  req: Request,
  res: Response<ApiResponse>
) => {
  const session = req.session;

  if (!session) {
    throw errors.unauthorized();
  }

  const adminUser = await prisma.adminUser.findUnique({
    where: { email: session.email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  if (!adminUser) {
    throw errors.unauthorized();
  }

  res.json({
    success: true,
    data: adminUser,
  });
});

/**
 * Refresh session token
 * POST /api/auth/refresh
 */
export const refreshToken = asyncHandler(async (
  req: Request,
  res: Response<ApiResponse>
) => {
  const session = req.session;

  if (!session) {
    throw errors.unauthorized();
  }

  // Generate new JWT
  const newToken = generateJWT({
    sub: session.id,
    email: session.email,
    role: session.role,
  });

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Update session
  await prisma.session.updateMany({
    where: { email: session.email },
    data: {
      token: hashToken(newToken),
      expiresAt,
    },
  });

  // Set new cookie
  res.cookie('session', newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
  });

  res.json({
    success: true,
    data: {
      token: newToken,
      expiresAt: expiresAt.toISOString(),
    },
  });
});

export default {
  requestMagicLink,
  verifyMagicLink,
  logout,
  getCurrentUser,
  refreshToken,
};
