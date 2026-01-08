import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { logger } from '../config/logger.js';
import type { ApiResponse } from '../types/index.js';

// Default rate limit configuration
const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10', 10);

// Rate limiter for webhook endpoints (per phone number)
export const webhookRateLimiter = rateLimit({
  windowMs,
  max: maxRequests,
  keyGenerator: (req: Request): string => {
    // Use phone number as the key for webhook rate limiting
    const phone = req.body?.phone || req.ip || 'unknown';
    return `webhook_${phone}`;
  },
  handler: (req: Request, res: Response<ApiResponse>) => {
    logger.warn('Rate limit exceeded for webhook', {
      phone: req.body?.phone,
      ip: req.ip,
    });
    res.status(429).json({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for API endpoints (per IP)
export const apiRateLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 100, // 100 requests per minute
  keyGenerator: (req: Request): string => {
    return `api_${req.ip || 'unknown'}`;
  },
  handler: (req: Request, res: Response<ApiResponse>) => {
    logger.warn('Rate limit exceeded for API', { ip: req.ip });
    res.status(429).json({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for magic link requests (max 5 per email per 24 hours)
export const magicLinkRateLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 5,
  keyGenerator: (req: Request): string => {
    const email = req.body?.email || req.ip || 'unknown';
    return `magic_link_${email}`;
  },
  handler: (req: Request, res: Response<ApiResponse>) => {
    logger.warn('Magic link rate limit exceeded', {
      email: req.body?.email,
      ip: req.ip,
    });
    res.status(429).json({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many magic link requests. Please try again in 24 hours.',
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Global rate limiter for all requests
export const globalRateLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 1000, // 1000 requests per minute globally
  handler: (_req: Request, res: Response<ApiResponse>) => {
    res.status(429).json({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Server is busy. Please try again later.',
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});
