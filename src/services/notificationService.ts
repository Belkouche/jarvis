import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { Complaint, Ticket, ComplaintPriority } from '@prisma/client';
import { sendEmail } from './resendService';

// Notification settings
const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',') || [];
const NOTIFICATION_FROM = process.env.NOTIFICATION_FROM || 'JARVIS <jarvis@tktm.ma>';

export interface NotificationResult {
  success: boolean;
  recipients: string[];
  error?: string;
}

/**
 * Send notification when a complaint is assigned to a user
 */
export async function sendAssignmentNotification(
  userId: string,
  complaint: Complaint
): Promise<NotificationResult> {
  const user = await prisma.adminUser.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });

  if (!user) {
    logger.warn('User not found for assignment notification', { userId });
    return { success: false, recipients: [], error: 'User not found' };
  }

  const subject = `[JARVIS] Réclamation assignée - ${complaint.contractNumber}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #f97316; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0;">JARVIS</h1>
        <p style="margin: 5px 0 0;">Réclamation Assignée</p>
      </div>

      <div style="padding: 20px; background: #f9fafb;">
        <p>Bonjour ${user.name || 'Admin'},</p>

        <p>Une réclamation vous a été assignée :</p>

        <div style="background: white; border-radius: 8px; padding: 15px; margin: 15px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Numéro contrat</td>
              <td style="padding: 8px 0; font-weight: bold;">${complaint.contractNumber}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Téléphone</td>
              <td style="padding: 8px 0;">${complaint.phone}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Type</td>
              <td style="padding: 8px 0;">${formatComplaintType(complaint.complaintType)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Priorité</td>
              <td style="padding: 8px 0;">
                <span style="background: ${getPriorityColor(complaint.priority)}; color: white; padding: 2px 8px; border-radius: 4px;">
                  ${complaint.priority.toUpperCase()}
                </span>
              </td>
            </tr>
          </table>
        </div>

        ${complaint.description ? `
        <div style="background: white; border-radius: 8px; padding: 15px; margin: 15px 0;">
          <p style="margin: 0 0 10px; color: #6b7280;">Description:</p>
          <p style="margin: 0;">${complaint.description}</p>
        </div>
        ` : ''}

        <a href="${process.env.DASHBOARD_URL}/complaints/${complaint.id}"
           style="display: inline-block; background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px;">
          Voir la réclamation
        </a>
      </div>

      <div style="padding: 15px; text-align: center; color: #6b7280; font-size: 12px;">
        JARVIS - Assistant WhatsApp TKTM
      </div>
    </div>
  `;

  try {
    await sendEmail(user.email, subject, html);
    logger.info('Assignment notification sent', { userId, complaintId: complaint.id });
    return { success: true, recipients: [user.email] };
  } catch (error) {
    logger.error('Failed to send assignment notification', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { success: false, recipients: [], error: 'Failed to send email' };
  }
}

/**
 * Send notification when a complaint is escalated to Orange
 */
export async function sendEscalationNotification(
  complaint: Complaint,
  ticket: Ticket
): Promise<NotificationResult> {
  const recipients = await getAdminEmails();

  if (recipients.length === 0) {
    logger.warn('No admin emails configured for escalation notification');
    return { success: false, recipients: [], error: 'No recipients' };
  }

  const subject = `[JARVIS] Escalade Orange - ${complaint.contractNumber}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #dc2626; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0;">JARVIS</h1>
        <p style="margin: 5px 0 0;">Escalade vers Orange</p>
      </div>

      <div style="padding: 20px; background: #f9fafb;">
        <p>Une réclamation a été escaladée vers Orange :</p>

        <div style="background: white; border-radius: 8px; padding: 15px; margin: 15px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Ticket Orange</td>
              <td style="padding: 8px 0; font-weight: bold;">${ticket.orangeTicketId || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Numéro contrat</td>
              <td style="padding: 8px 0;">${complaint.contractNumber}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Téléphone</td>
              <td style="padding: 8px 0;">${complaint.phone}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Type</td>
              <td style="padding: 8px 0;">${formatComplaintType(complaint.complaintType)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Priorité</td>
              <td style="padding: 8px 0;">
                <span style="background: ${getPriorityColor(complaint.priority)}; color: white; padding: 2px 8px; border-radius: 4px;">
                  ${complaint.priority.toUpperCase()}
                </span>
              </td>
            </tr>
          </table>
        </div>

        <a href="${process.env.DASHBOARD_URL}/complaints/${complaint.id}"
           style="display: inline-block; background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px;">
          Voir la réclamation
        </a>
      </div>

      <div style="padding: 15px; text-align: center; color: #6b7280; font-size: 12px;">
        JARVIS - Assistant WhatsApp TKTM
      </div>
    </div>
  `;

  const results = await Promise.all(
    recipients.map((email) => sendEmail(email, subject, html))
  );

  const successCount = results.filter((r) => r.success).length;

  logger.info('Escalation notification sent', {
    complaintId: complaint.id,
    ticketId: ticket.id,
    successCount,
    totalRecipients: recipients.length,
  });

  return {
    success: successCount > 0,
    recipients: recipients.filter((_, i) => results[i].success),
  };
}

/**
 * Send notification when complaint priority changes
 */
export async function sendPriorityChangeNotification(
  complaint: Complaint,
  oldPriority: ComplaintPriority,
  newPriority: ComplaintPriority
): Promise<NotificationResult> {
  const recipients: string[] = [];

  // Notify assigned user if exists
  if (complaint.assignedTo) {
    const user = await prisma.adminUser.findUnique({
      where: { id: complaint.assignedTo },
      select: { email: true },
    });
    if (user) recipients.push(user.email);
  }

  // Also notify admins for high priority escalations
  if (newPriority === 'high') {
    const adminEmails = await getAdminEmails();
    recipients.push(...adminEmails.filter((e) => !recipients.includes(e)));
  }

  if (recipients.length === 0) {
    return { success: false, recipients: [], error: 'No recipients' };
  }

  const subject = `[JARVIS] Priorité modifiée - ${complaint.contractNumber}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #f97316; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0;">JARVIS</h1>
        <p style="margin: 5px 0 0;">Changement de Priorité</p>
      </div>

      <div style="padding: 20px; background: #f9fafb;">
        <p>La priorité d'une réclamation a été modifiée :</p>

        <div style="background: white; border-radius: 8px; padding: 15px; margin: 15px 0; text-align: center;">
          <span style="background: ${getPriorityColor(oldPriority)}; color: white; padding: 4px 12px; border-radius: 4px;">
            ${oldPriority.toUpperCase()}
          </span>
          <span style="margin: 0 15px; font-size: 24px;">→</span>
          <span style="background: ${getPriorityColor(newPriority)}; color: white; padding: 4px 12px; border-radius: 4px;">
            ${newPriority.toUpperCase()}
          </span>
        </div>

        <div style="background: white; border-radius: 8px; padding: 15px; margin: 15px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Numéro contrat</td>
              <td style="padding: 8px 0; font-weight: bold;">${complaint.contractNumber}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Téléphone</td>
              <td style="padding: 8px 0;">${complaint.phone}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Type</td>
              <td style="padding: 8px 0;">${formatComplaintType(complaint.complaintType)}</td>
            </tr>
          </table>
        </div>

        <a href="${process.env.DASHBOARD_URL}/complaints/${complaint.id}"
           style="display: inline-block; background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px;">
          Voir la réclamation
        </a>
      </div>

      <div style="padding: 15px; text-align: center; color: #6b7280; font-size: 12px;">
        JARVIS - Assistant WhatsApp TKTM
      </div>
    </div>
  `;

  const results = await Promise.all(
    recipients.map((email) => sendEmail(email, subject, html))
  );

  const successCount = results.filter((r) => r.success).length;

  return {
    success: successCount > 0,
    recipients: recipients.filter((_, i) => results[i].success),
  };
}

/**
 * Send reminder notification for a complaint
 */
export async function sendReminderNotification(
  userId: string,
  complaint: Complaint,
  hoursSinceCreation: number
): Promise<NotificationResult> {
  const user = await prisma.adminUser.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });

  if (!user) {
    return { success: false, recipients: [], error: 'User not found' };
  }

  const subject = `[JARVIS] Rappel - Réclamation en attente depuis ${hoursSinceCreation}h`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #eab308; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0;">JARVIS</h1>
        <p style="margin: 5px 0 0;">Rappel - Réclamation en attente</p>
      </div>

      <div style="padding: 20px; background: #f9fafb;">
        <p>Bonjour ${user.name || 'Admin'},</p>

        <p>Une réclamation qui vous est assignée est en attente depuis <strong>${hoursSinceCreation} heures</strong> :</p>

        <div style="background: white; border-radius: 8px; padding: 15px; margin: 15px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Numéro contrat</td>
              <td style="padding: 8px 0; font-weight: bold;">${complaint.contractNumber}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Téléphone</td>
              <td style="padding: 8px 0;">${complaint.phone}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Priorité</td>
              <td style="padding: 8px 0;">
                <span style="background: ${getPriorityColor(complaint.priority)}; color: white; padding: 2px 8px; border-radius: 4px;">
                  ${complaint.priority.toUpperCase()}
                </span>
              </td>
            </tr>
          </table>
        </div>

        <a href="${process.env.DASHBOARD_URL}/complaints/${complaint.id}"
           style="display: inline-block; background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px;">
          Traiter la réclamation
        </a>
      </div>

      <div style="padding: 15px; text-align: center; color: #6b7280; font-size: 12px;">
        JARVIS - Assistant WhatsApp TKTM
      </div>
    </div>
  `;

  try {
    await sendEmail(user.email, subject, html);
    return { success: true, recipients: [user.email] };
  } catch {
    return { success: false, recipients: [], error: 'Failed to send email' };
  }
}

/**
 * Send reminder for unassigned complaints
 */
export async function sendUnassignedComplaintReminder(
  complaint: Complaint,
  hoursSinceCreation: number
): Promise<NotificationResult> {
  const recipients = await getAdminEmails();

  if (recipients.length === 0) {
    return { success: false, recipients: [], error: 'No admin emails' };
  }

  const subject = `[JARVIS] Réclamation non assignée depuis ${hoursSinceCreation}h`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #dc2626; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0;">JARVIS</h1>
        <p style="margin: 5px 0 0;">Réclamation Non Assignée</p>
      </div>

      <div style="padding: 20px; background: #f9fafb;">
        <p>Une réclamation est en attente d'assignation depuis <strong>${hoursSinceCreation} heures</strong> :</p>

        <div style="background: white; border-radius: 8px; padding: 15px; margin: 15px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Numéro contrat</td>
              <td style="padding: 8px 0; font-weight: bold;">${complaint.contractNumber}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Téléphone</td>
              <td style="padding: 8px 0;">${complaint.phone}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Type</td>
              <td style="padding: 8px 0;">${formatComplaintType(complaint.complaintType)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Priorité</td>
              <td style="padding: 8px 0;">
                <span style="background: ${getPriorityColor(complaint.priority)}; color: white; padding: 2px 8px; border-radius: 4px;">
                  ${complaint.priority.toUpperCase()}
                </span>
              </td>
            </tr>
          </table>
        </div>

        <a href="${process.env.DASHBOARD_URL}/complaints/${complaint.id}"
           style="display: inline-block; background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px;">
          Assigner la réclamation
        </a>
      </div>

      <div style="padding: 15px; text-align: center; color: #6b7280; font-size: 12px;">
        JARVIS - Assistant WhatsApp TKTM
      </div>
    </div>
  `;

  const results = await Promise.all(
    recipients.map((email) => sendEmail(email, subject, html))
  );

  const successCount = results.filter((r) => r.success).length;

  return {
    success: successCount > 0,
    recipients: recipients.filter((_, i) => results[i].success),
  };
}

// Helper functions

async function getAdminEmails(): Promise<string[]> {
  // First check environment variable
  if (ADMIN_EMAILS.length > 0) {
    return ADMIN_EMAILS;
  }

  // Fall back to database admin users
  const admins = await prisma.adminUser.findMany({
    where: { role: 'admin' },
    select: { email: true },
  });

  return admins.map((a) => a.email);
}

function getPriorityColor(priority: ComplaintPriority): string {
  const colors: Record<string, string> = {
    high: '#dc2626',
    medium: '#eab308',
    low: '#22c55e',
  };
  return colors[priority] || '#6b7280';
}

function formatComplaintType(type: string): string {
  const types: Record<string, string> = {
    delay: 'Retard',
    quality: 'Qualité de service',
    service: 'Service technique',
    billing: 'Facturation',
    general: 'Général',
  };
  return types[type] || type;
}

// Export the sendEmail function for direct use
export { sendEmail };
