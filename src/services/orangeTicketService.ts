import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { Ticket, TicketStatus, ComplaintPriority } from '@prisma/client';

// Orange API configuration (placeholder - actual implementation depends on Orange's API)
const ORANGE_API_BASE_URL = process.env.ORANGE_API_URL || 'https://api.orange.ma/tickets';
const ORANGE_API_KEY = process.env.ORANGE_API_KEY || '';

export interface CreateTicketInput {
  complaintId: string;
  contractNumber: string;
  phone: string;
  description: string;
  priority: ComplaintPriority;
  complaintType: string;
}

export interface OrangeTicketResponse {
  ticketId: string;
  status: string;
  createdAt: string;
  estimatedResolutionDate?: string;
}

/**
 * Create a ticket in Orange's system and store locally
 */
export async function createTicket(input: CreateTicketInput): Promise<Ticket> {
  logger.info('Creating Orange ticket', {
    complaintId: input.complaintId,
    contractNumber: input.contractNumber,
  });

  let orangeTicketId: string | null = null;
  let orangeResponse: OrangeTicketResponse | null = null;

  // Try to create ticket in Orange's system
  if (ORANGE_API_KEY) {
    try {
      orangeResponse = await callOrangeApi(input);
      orangeTicketId = orangeResponse.ticketId;
      logger.info('Orange ticket created', { orangeTicketId });
    } catch (error) {
      logger.error('Failed to create Orange ticket', {
        error: error instanceof Error ? error.message : 'Unknown error',
        complaintId: input.complaintId,
      });
      // Continue with local ticket creation even if Orange API fails
    }
  } else {
    // Generate a local reference if Orange API is not configured
    orangeTicketId = `LOCAL-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    logger.warn('Orange API not configured, using local ticket reference', {
      orangeTicketId,
    });
  }

  // Create local ticket record
  const ticket = await prisma.ticket.create({
    data: {
      complaintId: input.complaintId,
      orangeTicketId,
      status: 'open',
      priority: mapPriorityToOrange(input.priority),
      description: formatTicketDescription(input),
      orangeResponse: orangeResponse ? JSON.stringify(orangeResponse) : null,
    },
  });

  // Update complaint with escalation flag
  await prisma.complaint.update({
    where: { id: input.complaintId },
    data: {
      escalatedToOrange: true,
      orangeTicketId,
    },
  });

  return ticket;
}

/**
 * Call Orange API to create a ticket
 */
async function callOrangeApi(input: CreateTicketInput): Promise<OrangeTicketResponse> {
  const payload = {
    contractNumber: input.contractNumber,
    phoneNumber: input.phone,
    category: mapComplaintTypeToOrange(input.complaintType),
    priority: mapPriorityToOrange(input.priority),
    description: formatTicketDescription(input),
    source: 'JARVIS_WHATSAPP',
  };

  const response = await fetch(`${ORANGE_API_BASE_URL}/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ORANGE_API_KEY}`,
      'X-Source-System': 'TKTM-JARVIS',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Orange API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Get ticket by ID
 */
export async function getTicketById(id: string): Promise<Ticket | null> {
  return prisma.ticket.findUnique({
    where: { id },
    include: {
      complaint: true,
    },
  });
}

/**
 * Get ticket by Orange ticket ID
 */
export async function getTicketByOrangeId(orangeTicketId: string): Promise<Ticket | null> {
  return prisma.ticket.findFirst({
    where: { orangeTicketId },
    include: {
      complaint: true,
    },
  });
}

/**
 * Update ticket status from Orange webhook or sync
 */
export async function updateTicketStatus(
  orangeTicketId: string,
  status: TicketStatus,
  orangeResponse?: Record<string, unknown>
): Promise<Ticket | null> {
  const ticket = await prisma.ticket.findFirst({
    where: { orangeTicketId },
  });

  if (!ticket) {
    logger.warn('Ticket not found for status update', { orangeTicketId });
    return null;
  }

  const updatedTicket = await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      status,
      orangeResponse: orangeResponse ? JSON.stringify(orangeResponse) : ticket.orangeResponse,
      updatedAt: new Date(),
    },
  });

  // If ticket is resolved, update complaint status
  if (status === 'resolved') {
    await prisma.complaint.update({
      where: { id: ticket.complaintId },
      data: { status: 'resolved' },
    });
  }

  logger.info('Ticket status updated', {
    ticketId: ticket.id,
    orangeTicketId,
    newStatus: status,
  });

  return updatedTicket;
}

/**
 * Sync ticket status with Orange API
 */
export async function syncTicketStatus(orangeTicketId: string): Promise<Ticket | null> {
  if (!ORANGE_API_KEY || orangeTicketId.startsWith('LOCAL-')) {
    return null;
  }

  try {
    const response = await fetch(`${ORANGE_API_BASE_URL}/${orangeTicketId}`, {
      headers: {
        'Authorization': `Bearer ${ORANGE_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Orange API error: ${response.status}`);
    }

    const data = await response.json();
    const status = mapOrangeStatusToLocal(data.status);

    return updateTicketStatus(orangeTicketId, status, data);
  } catch (error) {
    logger.error('Failed to sync ticket status', {
      orangeTicketId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Get all open tickets for sync
 */
export async function getOpenTickets(): Promise<Ticket[]> {
  return prisma.ticket.findMany({
    where: {
      status: { in: ['open', 'in_progress'] },
      orangeTicketId: { not: { startsWith: 'LOCAL-' } },
    },
  });
}

/**
 * Sync all open tickets with Orange API
 */
export async function syncAllOpenTickets(): Promise<{ synced: number; failed: number }> {
  const tickets = await getOpenTickets();
  let synced = 0;
  let failed = 0;

  for (const ticket of tickets) {
    if (ticket.orangeTicketId) {
      const result = await syncTicketStatus(ticket.orangeTicketId);
      if (result) {
        synced++;
      } else {
        failed++;
      }
    }
  }

  logger.info('Ticket sync completed', { synced, failed, total: tickets.length });

  return { synced, failed };
}

// Helper functions

function mapPriorityToOrange(priority: ComplaintPriority): string {
  const mapping: Record<string, string> = {
    high: 'P1',
    medium: 'P2',
    low: 'P3',
  };
  return mapping[priority] || 'P3';
}

function mapComplaintTypeToOrange(type: string): string {
  const mapping: Record<string, string> = {
    delay: 'INSTALLATION_DELAY',
    quality: 'SERVICE_QUALITY',
    service: 'TECHNICIAN_ISSUE',
    billing: 'BILLING',
    general: 'OTHER',
  };
  return mapping[type] || 'OTHER';
}

function mapOrangeStatusToLocal(orangeStatus: string): TicketStatus {
  const mapping: Record<string, TicketStatus> = {
    OPEN: 'open',
    IN_PROGRESS: 'in_progress',
    PENDING: 'pending',
    RESOLVED: 'resolved',
    CLOSED: 'closed',
  };
  return mapping[orangeStatus] || 'open';
}

function formatTicketDescription(input: CreateTicketInput): string {
  return `
Réclamation via WhatsApp (JARVIS)
---------------------------------
Numéro contrat: ${input.contractNumber}
Téléphone: ${input.phone}
Type: ${input.complaintType}
Priorité: ${input.priority}

Description:
${input.description}

---
Source: TKTM JARVIS WhatsApp Assistant
  `.trim();
}
