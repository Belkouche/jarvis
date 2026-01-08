import winston from 'winston';

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

  // Domain-specific logging
  message: {
    received: (phone: string, messageId: string) =>
      logger.info('Message received', { phone, messageId }),
    processed: (phone: string, latency: number, success: boolean) =>
      logger.info('Message processed', { phone, latency, success }),
    error: (phone: string, error: string) =>
      logger.error('Message processing error', { phone, error }),
  },

  lmStudio: {
    request: (contractNumber: string) =>
      logger.debug('LM Studio request', { contractNumber }),
    response: (contractNumber: string, latency: number) =>
      logger.info('LM Studio response', { contractNumber, latency }),
    timeout: (contractNumber: string) =>
      logger.warn('LM Studio timeout, using fallback', { contractNumber }),
    error: (error: string) => logger.error('LM Studio error', { error }),
  },

  crm: {
    lookup: (contractNumber: string) =>
      logger.debug('CRM lookup started', { contractNumber }),
    found: (contractNumber: string, latency: number) =>
      logger.info('CRM lookup success', { contractNumber, latency }),
    notFound: (contractNumber: string) =>
      logger.warn('Contract not found in CRM', { contractNumber }),
    cacheHit: (contractNumber: string) =>
      logger.debug('CRM cache hit', { contractNumber }),
    error: (contractNumber: string, error: string) =>
      logger.error('CRM lookup error', { contractNumber, error }),
  },

  auth: {
    magicLinkSent: (email: string) =>
      logger.info('Magic link sent', { email }),
    magicLinkUsed: (email: string) =>
      logger.info('Magic link used', { email }),
    loginSuccess: (email: string) =>
      logger.info('Login successful', { email }),
    loginFailed: (email: string, reason: string) =>
      logger.warn('Login failed', { email, reason }),
    logout: (email: string) => logger.info('User logged out', { email }),
  },

  complaint: {
    created: (id: string, contractNumber: string) =>
      logger.info('Complaint created', { id, contractNumber }),
    escalated: (id: string, orangeTicketId: string) =>
      logger.info('Complaint escalated to Orange', { id, orangeTicketId }),
    resolved: (id: string) => logger.info('Complaint resolved', { id }),
  },
};
