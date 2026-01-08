import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import type { AuditEventType } from '../types/index.js';

interface AuditLogEntry {
  eventType: AuditEventType;
  actor?: string;
  resourceId?: string;
  action?: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        eventType: entry.eventType,
        actor: entry.actor || 'system',
        resourceId: entry.resourceId,
        action: entry.action,
        changes: entry.changes,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      },
    });
  } catch (error) {
    // Don't throw - audit logging should not break the main flow
    logger.error('Failed to create audit log', {
      error: (error as Error).message,
      entry,
    });
  }
}

/**
 * Log admin login event
 */
export async function logAdminLogin(
  email: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await createAuditLog({
    eventType: 'admin_login',
    actor: email,
    action: 'login',
    ipAddress,
    userAgent,
  });
}

/**
 * Log admin logout event
 */
export async function logAdminLogout(
  email: string,
  ipAddress?: string
): Promise<void> {
  await createAuditLog({
    eventType: 'admin_logout',
    actor: email,
    action: 'logout',
    ipAddress,
  });
}

/**
 * Log complaint creation
 */
export async function logComplaintCreated(
  complaintId: string,
  actor: string,
  details: Record<string, unknown>
): Promise<void> {
  await createAuditLog({
    eventType: 'complaint_created',
    actor,
    resourceId: complaintId,
    action: 'create',
    changes: details,
  });
}

/**
 * Log complaint update
 */
export async function logComplaintUpdated(
  complaintId: string,
  actor: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Promise<void> {
  await createAuditLog({
    eventType: 'complaint_updated',
    actor,
    resourceId: complaintId,
    action: 'update',
    changes: { before, after },
  });
}

/**
 * Log complaint assignment
 */
export async function logComplaintAssigned(
  complaintId: string,
  actor: string,
  assignedTo: string
): Promise<void> {
  await createAuditLog({
    eventType: 'complaint_assigned',
    actor,
    resourceId: complaintId,
    action: 'assign',
    changes: { assignedTo },
  });
}

/**
 * Log ticket escalation to Orange
 */
export async function logTicketEscalated(
  ticketId: string,
  complaintId: string,
  actor: string,
  orangeTicketId: string
): Promise<void> {
  await createAuditLog({
    eventType: 'ticket_escalated',
    actor,
    resourceId: ticketId,
    action: 'escalate',
    changes: { complaintId, orangeTicketId },
  });
}

/**
 * Log ticket update
 */
export async function logTicketUpdated(
  ticketId: string,
  actor: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Promise<void> {
  await createAuditLog({
    eventType: 'ticket_updated',
    actor,
    resourceId: ticketId,
    action: 'update',
    changes: { before, after },
  });
}

/**
 * Log export generation
 */
export async function logExportGenerated(
  actor: string,
  exportType: string,
  filters: Record<string, unknown>
): Promise<void> {
  await createAuditLog({
    eventType: 'export_generated',
    actor,
    action: 'export',
    changes: { exportType, filters },
  });
}

/**
 * Log message processed
 */
export async function logMessageProcessed(
  messageId: string,
  phone: string,
  success: boolean,
  details?: Record<string, unknown>
): Promise<void> {
  await createAuditLog({
    eventType: 'message_processed',
    actor: 'system',
    resourceId: messageId,
    action: success ? 'success' : 'error',
    changes: { phone, ...details },
  });
}

/**
 * Get audit logs with filters
 */
export async function getAuditLogs(options: {
  eventType?: AuditEventType;
  actor?: string;
  resourceId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}): Promise<{ logs: Array<Record<string, unknown>>; total: number }> {
  const where: Record<string, unknown> = {};

  if (options.eventType) {
    where.eventType = options.eventType;
  }
  if (options.actor) {
    where.actor = { contains: options.actor, mode: 'insensitive' };
  }
  if (options.resourceId) {
    where.resourceId = options.resourceId;
  }
  if (options.dateFrom || options.dateTo) {
    where.createdAt = {};
    if (options.dateFrom) {
      (where.createdAt as Record<string, Date>).gte = options.dateFrom;
    }
    if (options.dateTo) {
      (where.createdAt as Record<string, Date>).lte = options.dateTo;
    }
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options.limit || 50,
      skip: options.offset || 0,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total };
}

export default {
  createAuditLog,
  logAdminLogin,
  logAdminLogout,
  logComplaintCreated,
  logComplaintUpdated,
  logComplaintAssigned,
  logTicketEscalated,
  logTicketUpdated,
  logExportGenerated,
  logMessageProcessed,
  getAuditLogs,
};
