import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { AppError } from './errorHandler.js';

// Validation middleware factory
export function validate<T>(schema: ZodSchema<T>, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errorMessages = result.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      throw new AppError(errorMessages, 400, 'VALIDATION_ERROR');
    }
    req[source] = result.data as typeof req[typeof source];
    next();
  };
}

// Common validation schemas
export const schemas = {
  // Webhook message schema
  webhookMessage: z.object({
    phone: z.string().min(10).max(20),
    message: z.string().min(1).max(1000),
    timestamp: z.string().datetime().optional(),
    messageId: z.string().optional(),
  }),

  // Pagination query params
  pagination: z.object({
    page: z.string().transform(Number).default('1'),
    limit: z.string().transform(Number).default('20'),
  }),

  // Message filters
  messageFilters: z.object({
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    status: z.enum(['success', 'error']).optional(),
    contract: z.string().optional(),
    phone: z.string().optional(),
    hasComplaint: z.string().transform((v) => v === 'true').optional(),
  }),

  // Magic link request
  magicLinkRequest: z.object({
    email: z.string().email(),
  }),

  // Complaint creation
  createComplaint: z.object({
    message_id: z.string().uuid().optional(),
    phone: z.string().min(10).max(20),
    contract_number: z.string().regex(/^F\d{7}D$/i, 'Invalid contract format'),
    complaint_type: z.enum([
      'Retard installation',
      'Annulation contrat',
      'Contact errone',
      'Adresse erronee',
      'Cas bloque',
      'Deuxieme contrat',
      'Prise de RDV',
      'Autre',
    ]),
    message: z.string().optional(),
    notes: z.string().optional(),
  }),

  // Complaint update
  updateComplaint: z.object({
    status: z.enum(['open', 'assigned', 'escalated', 'resolved']).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    assigned_to: z.string().email().optional(),
    notes: z.string().optional(),
  }),

  // Escalate complaint
  escalateComplaint: z.object({
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    notes: z.string().optional(),
  }),

  // UUID param
  uuidParam: z.object({
    id: z.string().uuid(),
  }),

  // Contract number param
  contractParam: z.object({
    contractNumber: z.string().regex(/^F\d{7}D$/i, 'Invalid contract format'),
  }),
};

// Contract format regex
export const CONTRACT_REGEX = /^F\d{7}D$/i;

// Validate contract format
export function isValidContractFormat(contractNumber: string): boolean {
  return CONTRACT_REGEX.test(contractNumber);
}

// Extract contract number from message (handles typos)
export function extractContractNumber(message: string): string | null {
  // Look for pattern: F followed by 7 digits followed by D
  const match = message.match(/F\s*\d{7}\s*D/i);
  if (match) {
    // Remove spaces and uppercase
    return match[0].replace(/\s/g, '').toUpperCase();
  }
  return null;
}

// Phone number validation
export function isValidPhoneNumber(phone: string): boolean {
  // Moroccan phone format: +212 or 0 followed by 9 digits
  const moroccanRegex = /^(\+212|0)[5-7]\d{8}$/;
  return moroccanRegex.test(phone.replace(/\s/g, ''));
}

// Normalize phone number to international format
export function normalizePhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\s/g, '');
  if (cleaned.startsWith('0')) {
    return `+212${cleaned.substring(1)}`;
  }
  if (!cleaned.startsWith('+')) {
    return `+${cleaned}`;
  }
  return cleaned;
}
