import crypto from 'crypto';

/**
 * Execute a promise with a timeout
 * @param promise The promise to execute
 * @param timeoutMs Timeout in milliseconds
 * @param fallback Optional fallback function to call on timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback?: () => T | Promise<T>
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutHandle!);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle!);
    if (fallback && (error as Error).message.includes('timed out')) {
      return fallback();
    }
    throw error;
  }
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    backoff?: 'exponential' | 'linear';
  } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000, backoff = 'exponential' } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries - 1) {
        const delay =
          backoff === 'exponential'
            ? Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
            : Math.min(baseDelay * (attempt + 1), maxDelay);

        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a random hex token
 */
export function generateToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Hash a string using bcrypt-like timing-safe comparison
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Timing-safe string comparison
 */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString();
}

/**
 * Calculate date range
 */
export function getDateRange(
  range: 'today' | 'week' | 'month' | 'year'
): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  const from = new Date(now);
  from.setHours(0, 0, 0, 0);

  switch (range) {
    case 'week':
      from.setDate(from.getDate() - 7);
      break;
    case 'month':
      from.setMonth(from.getMonth() - 1);
      break;
    case 'year':
      from.setFullYear(from.getFullYear() - 1);
      break;
    // 'today' - no change needed
  }

  return { from, to };
}

/**
 * Sanitize string for logging (remove sensitive data)
 */
export function sanitizeForLog(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitive = ['password', 'token', 'secret', 'api_key', 'apikey'];
  const sanitized = { ...obj };

  for (const key of Object.keys(sanitized)) {
    if (sensitive.some((s) => key.toLowerCase().includes(s))) {
      sanitized[key] = '[REDACTED]';
    }
  }

  return sanitized;
}

// SECURITY: PII masking utilities for GDPR compliance and safe logging

/**
 * Mask phone number for logging - shows only last 4 digits
 * Example: +212612345678 -> ********5678
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone || phone.length <= 4) return '****';
  return '*'.repeat(phone.length - 4) + phone.slice(-4);
}

/**
 * Mask email for logging - shows first char and domain
 * Example: user@example.com -> u***@example.com
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '****';
  const [local, domain] = email.split('@');
  if (!domain) return '****';
  return `${local.charAt(0)}***@${domain}`;
}

/**
 * Mask contract number - shows first 2 and last 2 characters
 * Example: F0823846D -> F0****6D
 */
export function maskContractNumber(contractNumber: string | null | undefined): string {
  if (!contractNumber || contractNumber.length <= 4) return '****';
  return contractNumber.slice(0, 2) + '****' + contractNumber.slice(-2);
}

/**
 * Mask name for logging - shows first initial only
 * Example: John Doe -> J***
 */
export function maskName(name: string | null | undefined): string {
  if (!name || name.length === 0) return '****';
  return name.charAt(0) + '***';
}

/**
 * Generic IP address masking - masks last octet
 * Example: 192.168.1.100 -> 192.168.1.xxx
 */
export function maskIp(ip: string | null | undefined): string {
  if (!ip) return '****';
  // Handle IPv4
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return parts.slice(0, 3).join('.') + '.xxx';
    }
  }
  // Handle IPv6 - mask last segment
  if (ip.includes(':')) {
    const parts = ip.split(':');
    parts[parts.length - 1] = 'xxxx';
    return parts.join(':');
  }
  return '****';
}

/**
 * Generate Orange ticket ID
 */
export function generateOrangeTicketId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ONG-${timestamp}${random}`;
}

/**
 * Parse pagination params with defaults
 */
export function parsePagination(
  page?: string | number,
  limit?: string | number
): { page: number; limit: number; skip: number } {
  const parsedPage = Math.max(1, parseInt(String(page || '1'), 10));
  const parsedLimit = Math.min(100, Math.max(1, parseInt(String(limit || '20'), 10)));
  const skip = (parsedPage - 1) * parsedLimit;

  return { page: parsedPage, limit: parsedLimit, skip };
}

/**
 * Build pagination response
 */
export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
) {
  return {
    data,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  };
}
