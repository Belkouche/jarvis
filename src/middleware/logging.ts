import { Request, Response, NextFunction } from 'express';
import { logRequest, logger } from '../config/logger.js';
import { v4 as uuidv4 } from 'uuid';

// Extend Express Request to include requestId
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
    }
  }
}

// Request logging middleware
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Generate unique request ID
  req.requestId = (req.headers['x-request-id'] as string) || uuidv4();
  req.startTime = Date.now();

  // Add request ID to response headers
  res.setHeader('x-request-id', req.requestId);

  // Log request start
  logger.debug('Request started', {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    logRequest(req.method, req.path, res.statusCode, duration, {
      requestId: req.requestId,
      ip: req.ip,
    });
  });

  next();
}

// Log request body for specific routes (useful for debugging webhooks)
export function bodyLogger(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && Object.keys(req.body).length > 0) {
    logger.debug('Request body', {
      requestId: req.requestId,
      body: req.body,
    });
  }
  next();
}
