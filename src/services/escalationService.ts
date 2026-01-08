import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { Complaint, ComplaintPriority } from '@prisma/client';
import * as complaintService from './complaintService';
import * as orangeTicketService from './orangeTicketService';
import * as notificationService from './notificationService';

// Escalation thresholds (in hours)
const ESCALATION_THRESHOLDS: Record<ComplaintPriority, number> = {
  high: 4,      // 4 hours for high priority
  medium: 24,   // 24 hours for medium priority
  low: 72,      // 72 hours for low priority
};

// Auto-escalation rules
const AUTO_ESCALATION_RULES = {
  // Escalate to Orange after X hours of no resolution
  toOrangeThreshold: {
    high: 8,
    medium: 48,
    low: 168, // 1 week
  },
  // Send reminder notifications
  reminderIntervals: {
    high: [2, 4, 6],      // Hours
    medium: [12, 24, 36],
    low: [24, 48, 72],
  },
};

export interface EscalationResult {
  complaintId: string;
  action: 'escalated' | 'reminded' | 'skipped';
  reason: string;
  details?: Record<string, unknown>;
}

/**
 * Run the escalation workflow for all pending complaints
 */
export async function runEscalationWorkflow(): Promise<EscalationResult[]> {
  logger.info('Starting escalation workflow');

  const results: EscalationResult[] = [];

  // Get all non-resolved complaints
  const complaints = await prisma.complaint.findMany({
    where: {
      status: { in: ['open', 'assigned'] },
    },
    include: {
      assignedToUser: true,
      tickets: true,
    },
  });

  for (const complaint of complaints) {
    const result = await processComplaintEscalation(complaint);
    results.push(result);
  }

  const escalated = results.filter((r) => r.action === 'escalated').length;
  const reminded = results.filter((r) => r.action === 'reminded').length;

  logger.info('Escalation workflow completed', {
    total: complaints.length,
    escalated,
    reminded,
  });

  return results;
}

/**
 * Process escalation for a single complaint
 */
async function processComplaintEscalation(
  complaint: Complaint & { tickets: { id: string }[] }
): Promise<EscalationResult> {
  const ageHours = getComplaintAgeHours(complaint);
  const priority = complaint.priority;

  // Check if already escalated to Orange
  const hasOrangeTicket = complaint.escalatedToOrange || complaint.tickets.length > 0;

  // Check if should auto-escalate to Orange
  const orangeThreshold = AUTO_ESCALATION_RULES.toOrangeThreshold[priority];
  if (!hasOrangeTicket && ageHours >= orangeThreshold) {
    return await escalateToOrange(complaint, ageHours);
  }

  // Check if should send reminder
  const reminderResult = await checkAndSendReminder(complaint, ageHours);
  if (reminderResult) {
    return reminderResult;
  }

  // Check if should escalate internally (change priority)
  const internalThreshold = ESCALATION_THRESHOLDS[priority];
  if (ageHours >= internalThreshold && priority !== 'high') {
    return await escalateInternally(complaint, ageHours);
  }

  return {
    complaintId: complaint.id,
    action: 'skipped',
    reason: 'No escalation needed',
  };
}

/**
 * Escalate complaint to Orange
 */
async function escalateToOrange(
  complaint: Complaint,
  ageHours: number
): Promise<EscalationResult> {
  try {
    const ticket = await orangeTicketService.createTicket({
      complaintId: complaint.id,
      contractNumber: complaint.contractNumber,
      phone: complaint.phone,
      description: complaint.description || '',
      priority: complaint.priority,
      complaintType: complaint.complaintType,
    });

    await complaintService.updateComplaintStatus(complaint.id, 'escalated', 'SYSTEM');

    await notificationService.sendEscalationNotification(complaint, ticket);

    logger.info('Auto-escalated complaint to Orange', {
      complaintId: complaint.id,
      ticketId: ticket.id,
      ageHours,
    });

    return {
      complaintId: complaint.id,
      action: 'escalated',
      reason: `Auto-escalated to Orange after ${ageHours.toFixed(1)} hours`,
      details: { ticketId: ticket.id, orangeTicketId: ticket.orangeTicketId },
    };
  } catch (error) {
    logger.error('Failed to auto-escalate to Orange', {
      complaintId: complaint.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      complaintId: complaint.id,
      action: 'skipped',
      reason: 'Failed to escalate to Orange',
    };
  }
}

/**
 * Escalate complaint internally (increase priority)
 */
async function escalateInternally(
  complaint: Complaint,
  ageHours: number
): Promise<EscalationResult> {
  const newPriority: ComplaintPriority =
    complaint.priority === 'low' ? 'medium' : 'high';

  await prisma.complaint.update({
    where: { id: complaint.id },
    data: { priority: newPriority },
  });

  await complaintService.addComplaintNotes(
    complaint.id,
    `Priority auto-escalated from ${complaint.priority} to ${newPriority} after ${ageHours.toFixed(1)} hours`,
    'SYSTEM'
  );

  // Notify about priority change
  await notificationService.sendPriorityChangeNotification(
    complaint,
    complaint.priority,
    newPriority
  );

  logger.info('Auto-escalated complaint priority', {
    complaintId: complaint.id,
    oldPriority: complaint.priority,
    newPriority,
    ageHours,
  });

  return {
    complaintId: complaint.id,
    action: 'escalated',
    reason: `Priority escalated from ${complaint.priority} to ${newPriority}`,
    details: { oldPriority: complaint.priority, newPriority },
  };
}

/**
 * Check if reminder should be sent and send it
 */
async function checkAndSendReminder(
  complaint: Complaint,
  ageHours: number
): Promise<EscalationResult | null> {
  const intervals = AUTO_ESCALATION_RULES.reminderIntervals[complaint.priority];

  // Find the appropriate reminder interval
  for (const interval of intervals) {
    const reminderKey = `reminder_${interval}h`;
    const notes = complaint.notes || '';

    // Check if this reminder was already sent
    if (notes.includes(reminderKey)) {
      continue;
    }

    // Check if we've passed this interval
    if (ageHours >= interval) {
      await sendReminder(complaint, interval);

      return {
        complaintId: complaint.id,
        action: 'reminded',
        reason: `Sent ${interval}h reminder`,
        details: { interval, ageHours },
      };
    }
  }

  return null;
}

/**
 * Send reminder notification
 */
async function sendReminder(complaint: Complaint, intervalHours: number): Promise<void> {
  const reminderKey = `reminder_${intervalHours}h`;

  // Add note that reminder was sent
  await complaintService.addComplaintNotes(
    complaint.id,
    `[${reminderKey}] Automatic reminder sent`,
    'SYSTEM'
  );

  // Send notification to assigned user or all admins
  if (complaint.assignedTo) {
    await notificationService.sendReminderNotification(
      complaint.assignedTo,
      complaint,
      intervalHours
    );
  } else {
    await notificationService.sendUnassignedComplaintReminder(complaint, intervalHours);
  }

  logger.info('Sent complaint reminder', {
    complaintId: complaint.id,
    intervalHours,
    assignedTo: complaint.assignedTo,
  });
}

/**
 * Get complaint age in hours
 */
function getComplaintAgeHours(complaint: Complaint): number {
  return (Date.now() - complaint.createdAt.getTime()) / (1000 * 60 * 60);
}

/**
 * Schedule escalation workflow to run periodically
 */
export function scheduleEscalationWorkflow(intervalMinutes: number = 30): NodeJS.Timeout {
  logger.info(`Scheduling escalation workflow to run every ${intervalMinutes} minutes`);

  return setInterval(async () => {
    try {
      await runEscalationWorkflow();
    } catch (error) {
      logger.error('Escalation workflow failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, intervalMinutes * 60 * 1000);
}

/**
 * Get escalation status for a complaint
 */
export function getEscalationStatus(complaint: Complaint): {
  ageHours: number;
  nextEscalationIn: number | null;
  willEscalateTo: string | null;
} {
  const ageHours = getComplaintAgeHours(complaint);
  const threshold = ESCALATION_THRESHOLDS[complaint.priority];

  if (complaint.status === 'escalated' || complaint.status === 'resolved') {
    return {
      ageHours,
      nextEscalationIn: null,
      willEscalateTo: null,
    };
  }

  if (ageHours >= threshold) {
    // Already past threshold
    return {
      ageHours,
      nextEscalationIn: 0,
      willEscalateTo: complaint.escalatedToOrange ? null : 'Orange',
    };
  }

  return {
    ageHours,
    nextEscalationIn: threshold - ageHours,
    willEscalateTo:
      complaint.priority === 'high'
        ? 'Orange'
        : `Priority ${complaint.priority === 'low' ? 'medium' : 'high'}`,
  };
}
