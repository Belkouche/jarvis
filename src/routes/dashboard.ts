import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { apiRateLimiter } from '../middleware/rateLimit.js';
import { validate, schemas } from '../middleware/validation.js';
import {
  getMessages,
  getMessageById,
  getMessageStats,
} from '../controllers/messageController.js';
import { prisma } from '../config/database.js';

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
 * Export messages as CSV (admin only)
 */
router.get(
  '/export',
  requireRole('admin', 'bo_team'),
  async (req: Request, res: Response) => {
    try {
      const { type = 'messages', dateFrom, dateTo, format = 'csv' } = req.query;

      // Build date filter
      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom as string);
      if (dateTo) dateFilter.lte = new Date(dateTo as string);

      if (type === 'complaints') {
        // Export complaints
        const complaints = await prisma.complaint.findMany({
          where: dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {},
          include: {
            assignedToUser: { select: { name: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10000, // Max 10k records
        });

        if (format === 'csv') {
          // SECURITY: Sanitize CSV values to prevent formula injection
          // Prefix dangerous characters with single quote to neutralize formulas
          const sanitizeCsvValue = (value: string | null | undefined): string => {
            const str = String(value ?? '');
            // Escape quotes first
            const escaped = str.replace(/"/g, '""');
            // Prefix with single quote if starts with dangerous characters
            if (/^[=+\-@\t\r]/.test(escaped)) {
              return `'${escaped}`;
            }
            return escaped;
          };

          const csvHeader = 'ID,Phone,Contractor,Contract Number,Type,Status,Priority,Assigned To,Escalated,Notes,Created At\n';
          const csvRows = complaints.map(c =>
            `"${sanitizeCsvValue(c.id)}","${sanitizeCsvValue(c.phone)}","${sanitizeCsvValue(c.contractorName)}","${sanitizeCsvValue(c.contractNumber)}","${sanitizeCsvValue(c.complaintType)}","${sanitizeCsvValue(c.status)}","${sanitizeCsvValue(c.priority)}","${sanitizeCsvValue(c.assignedToUser?.name || c.assignedToUser?.email)}","${c.escalatedToOrange}","${sanitizeCsvValue(c.notes)}","${c.createdAt.toISOString()}"`
          ).join('\n');

          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="complaints-export-${new Date().toISOString().split('T')[0]}.csv"`);
          res.send(csvHeader + csvRows);
        } else {
          res.json({ success: true, data: complaints });
        }
      } else {
        // Export messages
        const messages = await prisma.message.findMany({
          where: dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {},
          orderBy: { createdAt: 'desc' },
          take: 10000, // Max 10k records
        });

        if (format === 'csv') {
          // SECURITY: Sanitize CSV values to prevent formula injection
          const sanitizeCsvValue = (value: string | number | null | undefined): string => {
            const str = String(value ?? '');
            const escaped = str.replace(/"/g, '""');
            if (/^[=+\-@\t\r]/.test(escaped)) {
              return `'${escaped}`;
            }
            return escaped;
          };

          const csvHeader = 'ID,Phone,Contractor,Message,Language,Intent,Contract Number,Valid Format,Spam,LM Latency,CRM Latency,Total Latency,Has Complaint,Complaint Type,Error,Created At\n';
          const csvRows = messages.map(m =>
            `"${sanitizeCsvValue(m.id)}","${sanitizeCsvValue(m.phone)}","${sanitizeCsvValue(m.contractorName)}","${sanitizeCsvValue(m.incomingMessage)}","${sanitizeCsvValue(m.languageDetected)}","${sanitizeCsvValue(m.intent)}","${sanitizeCsvValue(m.contractNumber)}","${m.isValidFormat}","${m.isSpam}","${sanitizeCsvValue(m.lmStudioLatency)}","${sanitizeCsvValue(m.crmLookupLatency)}","${sanitizeCsvValue(m.totalLatency)}","${m.hasComplaint}","${sanitizeCsvValue(m.complaintType)}","${sanitizeCsvValue(m.errorCode)}","${m.createdAt.toISOString()}"`
          ).join('\n');

          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="messages-export-${new Date().toISOString().split('T')[0]}.csv"`);
          res.send(csvHeader + csvRows);
        } else {
          res.json({ success: true, data: messages });
        }
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Export failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
