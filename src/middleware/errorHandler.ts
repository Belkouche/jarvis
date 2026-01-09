import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';
import type { ApiResponse } from '../types/index.js';

// Custom error class for application errors
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly messageFr?: string;
  public readonly messageAr?: string;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    options?: {
      messageFr?: string;
      messageAr?: string;
      isOperational?: boolean;
    }
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = options?.isOperational ?? true;
    this.messageFr = options?.messageFr;
    this.messageAr = options?.messageAr;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Predefined error types for common scenarios
export const errors = {
  invalidContractFormat: () =>
    new AppError('Invalid contract format', 400, 'INVALID_FORMAT', {
      messageFr: 'Format invalide. Ex: F0823846D',
      messageAr: 'صيغة غير صحيحة. مثال: F0823846D',
    }),

  contractNotFound: () =>
    new AppError('Contract not found', 404, 'CONTRACT_NOT_FOUND', {
      messageFr: 'Contrat non trouvé. Vérifiez le numéro',
      messageAr: 'العقد غير موجود. يرجى التحقق من الرقم',
    }),

  spamDetected: () =>
    new AppError('Invalid message detected', 400, 'SPAM_DETECTED', {
      messageFr: 'Message invalide. Envoyez numéro de contrat',
      messageAr: 'رسالة غير صحيحة. أرسل رقم العقد',
    }),

  serviceUnavailable: () =>
    new AppError('Service temporarily unavailable', 503, 'SERVICE_UNAVAILABLE', {
      messageFr: 'Serveur indisponible, réessayez dans 1 min',
      messageAr: 'الخادم غير متاح، حاول مرة أخرى بعد دقيقة',
    }),

  unsupportedLanguage: () =>
    new AppError('Unsupported language', 400, 'UNSUPPORTED_LANGUAGE', {
      messageFr: 'Langue non supportée (FR/AR)',
      messageAr: 'اللغة غير مدعومة (FR/AR)',
    }),

  unauthorized: () =>
    new AppError('Unauthorized access', 401, 'UNAUTHORIZED'),

  forbidden: () =>
    new AppError('Access forbidden', 403, 'FORBIDDEN'),

  notFound: (resource: string = 'Resource') =>
    new AppError(`${resource} not found`, 404, 'NOT_FOUND'),

  rateLimitExceeded: () =>
    new AppError('Too many requests', 429, 'RATE_LIMIT_EXCEEDED', {
      messageFr: 'Trop de requêtes. Réessayez plus tard',
      messageAr: 'طلبات كثيرة جداً. حاول لاحقاً',
    }),

  validationError: (message: string) =>
    new AppError(message, 400, 'VALIDATION_ERROR'),

  lmStudioTimeout: () =>
    new AppError('LM Studio timeout', 504, 'LM_STUDIO_TIMEOUT'),

  crmTimeout: () =>
    new AppError('CRM lookup timeout', 504, 'CRM_TIMEOUT', {
      messageFr: 'Serveur indisponible, réessayez dans 1 min',
      messageAr: 'الخادم غير متاح، حاول مرة أخرى بعد دقيقة',
    }),

  evolutionApiError: () =>
    new AppError('WhatsApp delivery failed', 500, 'EVOLUTION_API_ERROR', {
      messageFr: 'Erreur système, veuillez réessayer',
      messageAr: 'خطأ في النظام، يرجى المحاولة مرة أخرى',
    }),

  magicLinkExpired: () =>
    new AppError('Magic link has expired', 400, 'MAGIC_LINK_EXPIRED'),

  magicLinkUsed: () =>
    new AppError('Magic link has already been used', 400, 'MAGIC_LINK_USED'),

  magicLinkInvalid: () =>
    new AppError('Invalid magic link', 400, 'MAGIC_LINK_INVALID'),
};

// Format Zod validation errors
function formatZodError(error: ZodError): string {
  return error.errors
    .map((e) => `${e.path.join('.')}: ${e.message}`)
    .join(', ');
}

// SECURITY: Sanitize request body before logging to prevent credential exposure
function sanitizeBodyForLog(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;

  const sensitiveKeys = ['password', 'token', 'secret', 'apikey', 'api_key', 'authorization', 'credential', 'private'];
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeBodyForLog(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// Global error handler middleware
export function errorHandler(
  err: Error,
  req: Request,
  res: Response<ApiResponse>,
  _next: NextFunction
): void {
  // SECURITY: Log error with sanitized body to prevent credential leakage
  // Only include stack traces in development
  logger.error('Error occurred', {
    error: err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    path: req.path,
    method: req.method,
    body: sanitizeBodyForLog(req.body),
  });

  // Handle known application errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.code,
      message: err.message,
      ...(err.messageFr && { messageFr: err.messageFr }),
      ...(err.messageAr && { messageAr: err.messageAr }),
    });
    return;
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: formatZodError(err),
    });
    return;
  }

  // Handle JSON parsing errors
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      success: false,
      error: 'INVALID_JSON',
      message: 'Invalid JSON in request body',
    });
    return;
  }

  // Handle unknown errors
  res.status(500).json({
    success: false,
    error: 'INTERNAL_ERROR',
    message:
      process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message,
  });
}

// Async handler wrapper to catch errors in async routes
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Not found handler
export function notFoundHandler(req: Request, res: Response<ApiResponse>): void {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`,
  });
}
