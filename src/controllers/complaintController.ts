import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AppError } from '../middleware/errorHandler';
import * as complaintService from '../services/complaintService';
import * as orangeTicketService from '../services/orangeTicketService';
import * as notificationService from '../services/notificationService';
import * as websocketService from '../services/websocketService';
import { logAudit } from '../services/auditService';
import { ComplaintStatus, ComplaintPriority } from '@prisma/client';

/**
 * Get all complaints with filters
 */
export const getComplaints = asyncHandler(async (req: Request, res: Response) => {
  const {
    status,
    priority,
    assignedTo,
    phone,
    contractNumber,
    page = '1',
    limit = '20',
  } = req.query;

  const filters = {
    status: status as ComplaintStatus | undefined,
    priority: priority as ComplaintPriority | undefined,
    assignedTo: assignedTo as string | undefined,
    phone: phone as string | undefined,
    contractNumber: contractNumber as string | undefined,
    page: parseInt(page as string, 10),
    limit: parseInt(limit as string, 10),
  };

  const { complaints, total } = await complaintService.getComplaints(filters);

  res.json({
    success: true,
    data: {
      complaints,
      pagination: {
        total,
        page: filters.page,
        limit: filters.limit,
        totalPages: Math.ceil(total / filters.limit),
      },
    },
  });
});

/**
 * Get single complaint by ID
 */
export const getComplaint = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const complaint = await complaintService.getComplaintById(id);

  if (!complaint) {
    throw new AppError('Complaint not found', 404, 'COMPLAINT_NOT_FOUND');
  }

  res.json({
    success: true,
    data: complaint,
  });
});

/**
 * Update complaint status
 */
export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const userId = req.user!.id;

  if (!['open', 'assigned', 'escalated', 'resolved'].includes(status)) {
    throw new AppError('Invalid status', 400, 'INVALID_STATUS');
  }

  const complaint = await complaintService.updateComplaintStatus(
    id,
    status as ComplaintStatus,
    userId
  );

  await logAudit({
    userId,
    action: 'complaint.status_update',
    resourceType: 'complaint',
    resourceId: id,
    details: { newStatus: status },
  });

  res.json({
    success: true,
    data: complaint,
  });
});

/**
 * Assign complaint to a user
 */
export const assignComplaint = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { assignedTo } = req.body;
  const userId = req.user!.id;

  if (!assignedTo) {
    throw new AppError('assignedTo is required', 400, 'MISSING_ASSIGNEE');
  }

  const complaint = await complaintService.assignComplaint(id, assignedTo, userId);

  await logAudit({
    userId,
    action: 'complaint.assign',
    resourceType: 'complaint',
    resourceId: id,
    details: { assignedTo },
  });

  // Notify the assigned user
  await notificationService.sendAssignmentNotification(assignedTo, complaint);

  // WebSocket notification
  websocketService.notifyComplaintAssignment(id, assignedTo, complaint.contractNumber);

  res.json({
    success: true,
    data: complaint,
  });
});

/**
 * Add notes to a complaint
 */
export const addNotes = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { notes } = req.body;
  const userId = req.user!.id;
  const userName = req.user!.name || req.user!.email;

  if (!notes || typeof notes !== 'string') {
    throw new AppError('Notes are required', 400, 'MISSING_NOTES');
  }

  const complaint = await complaintService.addComplaintNotes(id, notes, userName);

  await logAudit({
    userId,
    action: 'complaint.add_notes',
    resourceType: 'complaint',
    resourceId: id,
    details: { notesLength: notes.length },
  });

  res.json({
    success: true,
    data: complaint,
  });
});

/**
 * Escalate complaint to Orange
 */
export const escalateToOrange = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const complaint = await complaintService.getComplaintById(id);

  if (!complaint) {
    throw new AppError('Complaint not found', 404, 'COMPLAINT_NOT_FOUND');
  }

  if (complaint.status === 'escalated') {
    throw new AppError('Complaint already escalated', 400, 'ALREADY_ESCALATED');
  }

  // Create Orange ticket
  const ticket = await orangeTicketService.createTicket({
    complaintId: id,
    contractNumber: complaint.contractNumber,
    phone: complaint.phone,
    description: complaint.message || '',
    priority: complaint.priority,
    complaintType: complaint.complaintType,
  });

  // Update complaint status
  await complaintService.updateComplaintStatus(id, 'escalated', userId);

  await logAudit({
    userId,
    action: 'complaint.escalate',
    resourceType: 'complaint',
    resourceId: id,
    details: { ticketId: ticket.id, orangeTicketId: ticket.orangeTicketId },
  });

  // Notify admins about escalation
  await notificationService.sendEscalationNotification(complaint, ticket);

  // WebSocket notification
  websocketService.notifyComplaintEscalation({
    id,
    contractNumber: complaint.contractNumber,
    orangeTicketId: ticket.orangeTicketId,
  });

  res.json({
    success: true,
    data: {
      complaint: await complaintService.getComplaintById(id),
      ticket,
    },
    message: 'Complaint escalated to Orange successfully',
  });
});

/**
 * Resolve a complaint
 */
export const resolveComplaint = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { resolution } = req.body;
  const userId = req.user!.id;
  const userName = req.user!.name || req.user!.email;

  if (resolution) {
    await complaintService.addComplaintNotes(
      id,
      `Resolution: ${resolution}`,
      userName
    );
  }

  const complaint = await complaintService.updateComplaintStatus(
    id,
    'resolved',
    userId
  );

  await logAudit({
    userId,
    action: 'complaint.resolve',
    resourceType: 'complaint',
    resourceId: id,
    details: { resolution },
  });

  // WebSocket notification
  websocketService.notifyComplaintResolution({
    id,
    contractNumber: complaint.contractNumber,
    resolution,
  });

  res.json({
    success: true,
    data: complaint,
    message: 'Complaint resolved successfully',
  });
});

/**
 * Get complaint statistics
 */
export const getStats = asyncHandler(async (_req: Request, res: Response) => {
  const stats = await complaintService.getComplaintStats();

  res.json({
    success: true,
    data: stats,
  });
});

/**
 * Get complaints needing escalation
 */
export const getNeedingEscalation = asyncHandler(
  async (_req: Request, res: Response) => {
    const complaints = await complaintService.getComplaintsNeedingEscalation();

    res.json({
      success: true,
      data: complaints,
      count: complaints.length,
    });
  }
);
