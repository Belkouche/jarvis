import { Router } from 'express';
import { magicLinkRateLimiter, apiRateLimiter } from '../middleware/rateLimit.js';
import { authenticate } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validation.js';
import {
  requestMagicLink,
  verifyMagicLink,
  logout,
  getCurrentUser,
  refreshToken,
} from '../controllers/authController.js';

const router = Router();

/**
 * POST /api/auth/magic-link/request
 * Request a magic link for passwordless login
 */
router.post(
  '/magic-link/request',
  magicLinkRateLimiter,
  validate(schemas.magicLinkRequest),
  requestMagicLink
);

/**
 * GET /api/auth/magic-link/verify
 * Verify magic link token and create session
 */
router.get('/magic-link/verify', verifyMagicLink);

/**
 * POST /api/auth/logout
 * Logout and invalidate session
 */
router.post('/logout', authenticate, logout);

/**
 * GET /api/auth/me
 * Get current authenticated user info
 */
router.get('/me', authenticate, getCurrentUser);

/**
 * POST /api/auth/refresh
 * Refresh session token
 */
router.post('/refresh', authenticate, refreshToken);

export default router;
