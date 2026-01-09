import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError, errors } from './errorHandler.js';
import { logger } from '../config/logger.js';
import { prisma } from '../config/database.js';
import type { JWTPayload, UserRole, SessionData } from '../types/index.js';

// Extend Express Request to include session data
declare global {
  namespace Express {
    interface Request {
      session?: SessionData;
    }
  }
}

// SECURITY: Fail-fast if JWT_SECRET is not configured
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET environment variable must be configured with at least 32 characters');
}

// SECURITY: Verify JWT token and check user is still active
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    // Get token from header or cookie
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : req.cookies?.session;

    if (!token) {
      throw errors.unauthorized();
    }

    // Verify token
    const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;

    // SECURITY: Check that user is still active in database
    // This prevents deactivated users from continuing to use valid tokens
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { isActive: true },
    });

    if (!user || !user.isActive) {
      logger.warn('Authentication failed - user deactivated or not found', {
        userId: payload.sub,
        email: payload.email,
      });
      throw new AppError('Account deactivated', 401, 'ACCOUNT_DEACTIVATED');
    }

    // Attach session data to request
    req.session = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      expiresAt: new Date(payload.exp * 1000),
    };

    next();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (error instanceof jwt.TokenExpiredError) {
      logger.warn('JWT token expired', { error: error.message });
      throw new AppError('Session expired', 401, 'SESSION_EXPIRED');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('Invalid JWT token', { error: error.message });
      throw errors.unauthorized();
    }
    throw error;
  }
}

// Role-based access control middleware
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.session) {
      throw errors.unauthorized();
    }

    if (!allowedRoles.includes(req.session.role)) {
      logger.warn('Access denied - insufficient role', {
        email: req.session.email,
        role: req.session.role,
        requiredRoles: allowedRoles,
      });
      throw errors.forbidden();
    }

    next();
  };
}

// Generate JWT token
export function generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  const expiresIn = parseInt(process.env.JWT_EXPIRY || '86400', 10);
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

// Verify JWT token
export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
}

// Optional authentication - doesn't throw if no token
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : req.cookies?.session;

    if (token) {
      const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
      req.session = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        expiresAt: new Date(payload.exp * 1000),
      };
    }
  } catch {
    // Ignore errors - session will be undefined
  }
  next();
}
