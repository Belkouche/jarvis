import winston from 'winston';
import { maskPhone, maskEmail, maskContractNumber, maskIp } from '../utils/helpers.js';

const logLevel = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';

// Custom format for development
const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

// JSON format for production
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: logLevel,
  format: isProduction ? prodFormat : devFormat,
  defaultMeta: { service: 'jarvis' },
  transports: [
    new winston.transports.Console(),
    // Add file transport in production
    ...(isProduction
      ? [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' }),
        ]
      : []),
  ],
});

// Create a child logger for specific modules
export function createModuleLogger(moduleName: string) {
  return logger.child({ module: moduleName });
}

// Request logging utility
export function logRequest(
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  meta?: Record<string, unknown>
) {
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
  logger.log(level, `${method} ${path} ${statusCode}`, {
    statusCode,
    duration: `${duration}ms`,
    ...meta,
  });
}

// Structured logging helpers
export const log = {
  info: (message: string, meta?: Record<string, unknown>) => logger.info(message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => logger.warn(message, meta),
  error: (message: string, meta?: Record<string, unknown>) => logger.error(message, meta),
  debug: (message: string, meta?: Record<string, unknown>) => logger.debug(message, meta),

  // SECURITY: Domain-specific logging with PII masking for GDPR compliance
  message: {
    received: (phone: string, messageId: string) =>
      logger.info('Message received', { phone: maskPhone(phone), messageId }),
    processed: (phone: string, latency: number, success: boolean) =>
      logger.info('Message processed', { phone: maskPhone(phone), latency, success }),
    error: (phone: string, error: string) =>
      logger.error('Message processing error', { phone: maskPhone(phone), error }),
  },

  lmStudio: {
    request: (contractNumber: string) =>
      logger.debug('LM Studio request', { contractNumber: maskContractNumber(contractNumber) }),
    response: (contractNumber: string, latency: number) =>
      logger.info('LM Studio response', { contractNumber: maskContractNumber(contractNumber), latency }),
    timeout: (contractNumber: string) =>
      logger.warn('LM Studio timeout, using fallback', { contractNumber: maskContractNumber(contractNumber) }),
    error: (error: string) => logger.error('LM Studio error', { error }),
  },

  crm: {
    lookup: (contractNumber: string) =>
      logger.debug('CRM lookup started', { contractNumber: maskContractNumber(contractNumber) }),
    found: (contractNumber: string, latency: number) =>
      logger.info('CRM lookup success', { contractNumber: maskContractNumber(contractNumber), latency }),
    notFound: (contractNumber: string) =>
      logger.warn('Contract not found in CRM', { contractNumber: maskContractNumber(contractNumber) }),
    cacheHit: (contractNumber: string) =>
      logger.debug('CRM cache hit', { contractNumber: maskContractNumber(contractNumber) }),
    error: (contractNumber: string, error: string) =>
      logger.error('CRM lookup error', { contractNumber: maskContractNumber(contractNumber), error }),
  },

  auth: {
    magicLinkSent: (email: string) =>
      logger.info('Magic link sent', { email: maskEmail(email) }),
    magicLinkUsed: (email: string) =>
      logger.info('Magic link used', { email: maskEmail(email) }),
    loginSuccess: (email: string) =>
      logger.info('Login successful', { email: maskEmail(email) }),
    loginFailed: (email: string, reason: string) =>
      logger.warn('Login failed', { email: maskEmail(email), reason }),
    logout: (email: string) => logger.info('User logged out', { email: maskEmail(email) }),
  },

  complaint: {
    created: (id: string, contractNumber: string) =>
      logger.info('Complaint created', { id, contractNumber: maskContractNumber(contractNumber) }),
    escalated: (id: string, orangeTicketId: string) =>
      logger.info('Complaint escalated to Orange', { id, orangeTicketId }),
    resolved: (id: string) => logger.info('Complaint resolved', { id }),
  },

  // SECURITY: Security-specific audit logging
  security: {
    authFailed: (email: string, reason: string, ip?: string) =>
      logger.warn('SECURITY: Authentication failed', {
        email: maskEmail(email),
        reason,
        ip: maskIp(ip),
      }),
    rateLimitExceeded: (identifier: string, endpoint: string, ip?: string) =>
      logger.warn('SECURITY: Rate limit exceeded', {
        identifier,
        endpoint,
        ip: maskIp(ip),
      }),
    unauthorizedAccess: (userId: string, resource: string, action: string) =>
      logger.warn('SECURITY: Unauthorized access attempt', { userId, resource, action }),
    suspiciousActivity: (userId: string, activity: string, details?: Record<string, unknown>) =>
      logger.warn('SECURITY: Suspicious activity detected', { userId, activity, ...details }),
    roleChange: (adminId: string, targetUserId: string, oldRole: string, newRole: string) =>
      logger.info('SECURITY: User role changed', { adminId, targetUserId, oldRole, newRole }),
  },
};
