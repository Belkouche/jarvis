import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { validate, schemas } from '../middleware/validation';
import * as complaintController from '../controllers/complaintController';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get complaint statistics (admin/bo_team only)
router.get(
  '/stats',
  requireRole(['admin', 'bo_team']),
  complaintController.getStats
);

// Get complaints needing escalation (admin only)
router.get(
  '/needs-escalation',
  requireRole(['admin']),
  complaintController.getNeedingEscalation
);

// SECURITY: All complaint access requires admin/bo_team role to prevent IDOR
// Get all complaints with filters
router.get(
  '/',
  requireRole(['admin', 'bo_team']),
  complaintController.getComplaints
);

// SECURITY: Add UUID validation to prevent injection
// Get single complaint (admin/bo_team only)
router.get(
  '/:id',
  requireRole(['admin', 'bo_team']),
  validate(schemas.uuidParam, 'params'),
  complaintController.getComplaint
);

// Update complaint status (admin/bo_team only)
router.patch(
  '/:id/status',
  requireRole(['admin', 'bo_team']),
  complaintController.updateStatus
);

// Assign complaint to user (admin only)
router.post(
  '/:id/assign',
  requireRole(['admin']),
  complaintController.assignComplaint
);

// Add notes to complaint
router.post(
  '/:id/notes',
  requireRole(['admin', 'bo_team']),
  complaintController.addNotes
);

// Escalate complaint to Orange (admin only)
router.post(
  '/:id/escalate',
  requireRole(['admin']),
  complaintController.escalateToOrange
);

// Resolve complaint (admin/bo_team only)
router.post(
  '/:id/resolve',
  requireRole(['admin', 'bo_team']),
  complaintController.resolveComplaint
);

export default router;
