import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { Complaint, ComplaintStatus, ComplaintPriority } from '@prisma/client';

// Complaint type keywords for detection
const COMPLAINT_KEYWORDS = {
  fr: {
    delay: ['retard', 'attendre', 'délai', 'longtemps', 'depuis', 'jours', 'semaines'],
    quality: ['mauvais', 'qualité', 'problème', 'dysfonctionnement', 'panne', 'marche pas'],
    service: ['service', 'technicien', 'rdv', 'rendez-vous', 'absent', 'venu'],
    billing: ['facture', 'paiement', 'prix', 'cher', 'argent', 'remboursement'],
    general: ['réclamation', 'plainte', 'mécontent', 'insatisfait', 'inacceptable'],
  },
  ar: {
    delay: ['تأخير', 'انتظار', 'طويل', 'أيام', 'أسابيع'],
    quality: ['سيء', 'مشكل', 'عطل', 'لا يعمل'],
    service: ['خدمة', 'تقني', 'موعد', 'غائب'],
    billing: ['فاتورة', 'دفع', 'ثمن', 'غالي', 'استرجاع'],
    general: ['شكاية', 'شكوى', 'غير راضي'],
  },
};

// Priority scoring based on keywords and patterns
const PRIORITY_INDICATORS = {
  high: {
    keywords: ['urgent', 'urgence', 'immédiat', 'عاجل', 'فوري', 'inacceptable', 'scandale'],
    patterns: [/depuis \d+ semaines/i, /\d+ jours sans/i, /منذ \d+ أسابيع/],
  },
  medium: {
    keywords: ['problème', 'مشكل', 'attendre', 'انتظار'],
    patterns: [/depuis \d+ jours/i, /منذ \d+ أيام/],
  },
};

export interface ComplaintDetectionResult {
  isComplaint: boolean;
  complaintType: string | null;
  priority: ComplaintPriority;
  confidence: number;
  detectedKeywords: string[];
}

export interface CreateComplaintInput {
  phone: string;
  contractorName?: string;
  contractNumber: string;
  complaintType: string;
  description: string;
  priority: ComplaintPriority;
  messageId?: string;
}

/**
 * Detect if a message contains a complaint and classify it
 */
export function detectComplaint(
  message: string,
  language: 'fr' | 'ar'
): ComplaintDetectionResult {
  const lowerMessage = message.toLowerCase();
  const keywords = COMPLAINT_KEYWORDS[language] || COMPLAINT_KEYWORDS.fr;

  const detectedKeywords: string[] = [];
  const typeScores: Record<string, number> = {
    delay: 0,
    quality: 0,
    service: 0,
    billing: 0,
    general: 0,
  };

  // Check for keyword matches in each category
  for (const [type, typeKeywords] of Object.entries(keywords)) {
    for (const keyword of typeKeywords) {
      if (lowerMessage.includes(keyword)) {
        typeScores[type]++;
        detectedKeywords.push(keyword);
      }
    }
  }

  // Calculate total score
  const totalScore = Object.values(typeScores).reduce((a, b) => a + b, 0);

  if (totalScore === 0) {
    return {
      isComplaint: false,
      complaintType: null,
      priority: 'low',
      confidence: 0,
      detectedKeywords: [],
    };
  }

  // Determine complaint type (highest scoring category)
  const complaintType = Object.entries(typeScores).reduce((a, b) =>
    a[1] > b[1] ? a : b
  )[0];

  // Determine priority
  const priority = determinePriority(message);

  // Calculate confidence (0-1)
  const confidence = Math.min(totalScore / 5, 1);

  return {
    isComplaint: true,
    complaintType,
    priority,
    confidence,
    detectedKeywords,
  };
}

/**
 * Determine complaint priority based on keywords and patterns
 */
function determinePriority(message: string): ComplaintPriority {
  const lowerMessage = message.toLowerCase();

  // Check for high priority indicators
  for (const keyword of PRIORITY_INDICATORS.high.keywords) {
    if (lowerMessage.includes(keyword)) {
      return 'high';
    }
  }
  for (const pattern of PRIORITY_INDICATORS.high.patterns) {
    if (pattern.test(message)) {
      return 'high';
    }
  }

  // Check for medium priority indicators
  for (const keyword of PRIORITY_INDICATORS.medium.keywords) {
    if (lowerMessage.includes(keyword)) {
      return 'medium';
    }
  }
  for (const pattern of PRIORITY_INDICATORS.medium.patterns) {
    if (pattern.test(message)) {
      return 'medium';
    }
  }

  return 'low';
}

/**
 * Create a new complaint record
 */
export async function createComplaint(
  input: CreateComplaintInput
): Promise<Complaint> {
  const complaint = await prisma.complaint.create({
    data: {
      phone: input.phone,
      contractorName: input.contractorName,
      contractNumber: input.contractNumber,
      complaintType: input.complaintType,
      description: input.description,
      priority: input.priority,
      status: 'open',
      messageId: input.messageId,
    },
  });

  logger.info('Complaint created', {
    complaintId: complaint.id,
    phone: input.phone,
    type: input.complaintType,
    priority: input.priority,
  });

  return complaint;
}

/**
 * Get complaint by ID
 */
export async function getComplaintById(id: string): Promise<Complaint | null> {
  return prisma.complaint.findUnique({
    where: { id },
    include: {
      message: true,
      assignedToUser: true,
      tickets: true,
    },
  });
}

/**
 * Get complaints with filters
 */
export async function getComplaints(filters: {
  status?: ComplaintStatus;
  priority?: ComplaintPriority;
  assignedTo?: string;
  phone?: string;
  contractNumber?: string;
  page?: number;
  limit?: number;
}): Promise<{ complaints: Complaint[]; total: number }> {
  const { page = 1, limit = 20, ...whereFilters } = filters;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};

  if (whereFilters.status) where.status = whereFilters.status;
  if (whereFilters.priority) where.priority = whereFilters.priority;
  if (whereFilters.assignedTo) where.assignedTo = whereFilters.assignedTo;
  if (whereFilters.phone) where.phone = { contains: whereFilters.phone };
  if (whereFilters.contractNumber) {
    where.contractNumber = { contains: whereFilters.contractNumber };
  }

  const [complaints, total] = await Promise.all([
    prisma.complaint.findMany({
      where,
      include: {
        assignedToUser: {
          select: { id: true, name: true, email: true },
        },
        tickets: {
          select: { id: true, orangeTicketId: true, status: true },
        },
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
      skip,
      take: limit,
    }),
    prisma.complaint.count({ where }),
  ]);

  return { complaints, total };
}

/**
 * Update complaint status
 */
export async function updateComplaintStatus(
  id: string,
  status: ComplaintStatus,
  updatedBy: string
): Promise<Complaint> {
  const complaint = await prisma.complaint.update({
    where: { id },
    data: {
      status,
      updatedAt: new Date(),
    },
  });

  logger.info('Complaint status updated', {
    complaintId: id,
    newStatus: status,
    updatedBy,
  });

  return complaint;
}

/**
 * Assign complaint to a user
 */
export async function assignComplaint(
  id: string,
  assignedTo: string,
  assignedBy: string
): Promise<Complaint> {
  const complaint = await prisma.complaint.update({
    where: { id },
    data: {
      assignedTo,
      status: 'assigned',
      updatedAt: new Date(),
    },
  });

  logger.info('Complaint assigned', {
    complaintId: id,
    assignedTo,
    assignedBy,
  });

  return complaint;
}

/**
 * Add notes to a complaint
 */
export async function addComplaintNotes(
  id: string,
  notes: string,
  addedBy: string
): Promise<Complaint> {
  const existing = await prisma.complaint.findUnique({
    where: { id },
    select: { notes: true },
  });

  const timestamp = new Date().toISOString();
  const newNote = `[${timestamp}] ${addedBy}: ${notes}`;
  const updatedNotes = existing?.notes
    ? `${existing.notes}\n${newNote}`
    : newNote;

  return prisma.complaint.update({
    where: { id },
    data: {
      notes: updatedNotes,
      updatedAt: new Date(),
    },
  });
}

/**
 * Get complaint statistics
 */
export async function getComplaintStats(): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byType: Record<string, number>;
  avgResolutionTimeHours: number;
}> {
  const [total, byStatus, byPriority, byType, resolved] = await Promise.all([
    prisma.complaint.count(),
    prisma.complaint.groupBy({
      by: ['status'],
      _count: true,
    }),
    prisma.complaint.groupBy({
      by: ['priority'],
      _count: true,
    }),
    prisma.complaint.groupBy({
      by: ['complaintType'],
      _count: true,
    }),
    prisma.complaint.findMany({
      where: { status: 'resolved' },
      select: { createdAt: true, updatedAt: true },
    }),
  ]);

  // Calculate average resolution time
  let avgResolutionTimeHours = 0;
  if (resolved.length > 0) {
    const totalHours = resolved.reduce((sum, c) => {
      const diff = c.updatedAt.getTime() - c.createdAt.getTime();
      return sum + diff / (1000 * 60 * 60);
    }, 0);
    avgResolutionTimeHours = Math.round(totalHours / resolved.length);
  }

  return {
    total,
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    byPriority: Object.fromEntries(byPriority.map((p) => [p.priority, p._count])),
    byType: Object.fromEntries(byType.map((t) => [t.complaintType, t._count])),
    avgResolutionTimeHours,
  };
}

/**
 * Check if escalation is needed based on complaint age and priority
 */
export function shouldEscalate(complaint: Complaint): boolean {
  const ageHours =
    (Date.now() - complaint.createdAt.getTime()) / (1000 * 60 * 60);

  // Escalation thresholds by priority (hours)
  const thresholds: Record<string, number> = {
    high: 4,
    medium: 24,
    low: 72,
  };

  const threshold = thresholds[complaint.priority] || 72;

  return (
    complaint.status !== 'resolved' &&
    complaint.status !== 'escalated' &&
    ageHours > threshold
  );
}

/**
 * Get complaints that need escalation
 */
export async function getComplaintsNeedingEscalation(): Promise<Complaint[]> {
  const complaints = await prisma.complaint.findMany({
    where: {
      status: { in: ['open', 'assigned'] },
    },
  });

  return complaints.filter(shouldEscalate);
}
