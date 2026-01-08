import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { apiRateLimiter } from '../middleware/rateLimit.js';
import { validate, schemas } from '../middleware/validation.js';
import {
  getMessages,
  getMessageById,
  getMessageStats,
} from '../controllers/messageController.js';

const router = Router();

// All dashboard routes require authentication
router.use(authenticate);
router.use(apiRateLimiter);

/**
 * GET /api/dashboard/messages
 * Get paginated messages with filters
 */
router.get('/messages', getMessages);

/**
 * GET /api/dashboard/messages/:id
 * Get single message by ID
 */
router.get(
  '/messages/:id',
  validate(schemas.uuidParam, 'params'),
  getMessageById
);

/**
 * GET /api/dashboard/stats
 * Get message statistics
 */
router.get('/stats', getMessageStats);

/**
 * GET /api/dashboard/export
 * Export messages as CSV/Excel (admin only)
 */
router.get(
  '/export',
  requireRole('admin', 'bo_team'),
  async (req, res) => {
    // This will be implemented in Week 5 with complaint export
    res.status(501).json({
      success: false,
      message: 'Export functionality coming soon',
    });
  }
);

export default router;
