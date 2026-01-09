import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger.js';
import { webhookRateLimiter } from '../middleware/rateLimit.js';
import { verifyWebhookSignature } from '../services/evolutionApiService.js';
import { handleWebhook } from '../controllers/messageController.js';
import { AppError } from '../middleware/errorHandler.js';
import type { ApiResponse } from '../types/index.js';

const router = Router();

/**
 * Middleware to verify Evolution API webhook signature
 */
function verifySignature(req: Request, res: Response, next: NextFunction): void {
  const signature = req.headers['x-webhook-signature'] as string || '';
  const rawBody = JSON.stringify(req.body);

  // SECURITY: Always verify webhook signatures - no development bypass
  // The verifyWebhookSignature function will reject if secret is not configured (fail-closed)

  if (!verifyWebhookSignature(rawBody, signature)) {
    logger.warn('Invalid webhook signature', {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    throw new AppError('Invalid webhook signature', 401, 'INVALID_SIGNATURE');
  }

  next();
}

/**
 * Middleware to log webhook events
 */
function logWebhook(req: Request, _res: Response, next: NextFunction): void {
  const event = req.body?.event || 'unknown';
  const instance = req.body?.instance || 'unknown';

  logger.debug('Webhook received', {
    event,
    instance,
    ip: req.ip,
  });

  next();
}

/**
 * POST /api/webhook/message
 * Receives incoming WhatsApp messages from Evolution API
 */
router.post(
  '/message',
  webhookRateLimiter,
  verifySignature,
  logWebhook,
  handleWebhook
);

/**
 * POST /api/webhook/status
 * Receives message status updates from Evolution API
 */
router.post(
  '/status',
  verifySignature,
  logWebhook,
  (req: Request, res: Response<ApiResponse>) => {
    const { event, data } = req.body;

    logger.info('Message status update', {
      event,
      messageId: data?.key?.id,
      status: data?.status,
    });

    // Acknowledge the webhook
    res.json({
      success: true,
      message: 'Status update received',
    });
  }
);

/**
 * POST /api/webhook/connection
 * Receives connection status updates from Evolution API
 */
router.post(
  '/connection',
  verifySignature,
  logWebhook,
  (req: Request, res: Response<ApiResponse>) => {
    const { event, data } = req.body;

    logger.info('Connection status update', {
      event,
      state: data?.state,
      instance: data?.instance,
    });

    // Alert if disconnected
    if (data?.state === 'close' || data?.state === 'logout') {
      logger.error('WhatsApp connection lost!', {
        instance: data?.instance,
        state: data?.state,
      });
    }

    res.json({
      success: true,
      message: 'Connection update received',
    });
  }
);

/**
 * GET /api/webhook/health
 * Health check for webhook endpoint
 */
router.get('/health', (_req: Request, res: Response<ApiResponse>) => {
  res.json({
    success: true,
    data: {
      status: 'ready',
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
