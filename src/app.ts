import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

// Load environment variables first
dotenv.config();

import { logger } from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { connectRedis, disconnectRedis } from './config/redis.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/logging.js';
import { globalRateLimiter } from './middleware/rateLimit.js';
import cookieParser from 'cookie-parser';
import healthRoutes from './routes/health.js';
import webhookRoutes from './routes/webhook.js';
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import complaintRoutes from './routes/complaints.js';
import { scheduleEscalationWorkflow } from './services/escalationService.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: process.env.DASHBOARD_URL || 'http://localhost:3001',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  })
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Request logging
app.use(requestLogger);

// Global rate limiting
app.use(globalRateLimiter);

// Health check routes (no auth required)
app.use('/', healthRoutes);

// API routes
app.use('/api/webhook', webhookRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/complaints', complaintRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  // Clear scheduled tasks
  if (escalationInterval) {
    clearInterval(escalationInterval);
    logger.info('Escalation workflow scheduler stopped');
  }

  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      // Disconnect from services
      await disconnectDatabase();
      await disconnectRedis();

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown', { error });
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

// Start server
async function startServer() {
  try {
    // Connect to database
    await connectDatabase();

    // Connect to Redis
    await connectRedis();

    // Start listening
    server = app.listen(PORT, () => {
      logger.info(`JARVIS server started`, {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
      });

      // Start escalation workflow scheduler (runs every 30 minutes)
      if (process.env.ENABLE_ESCALATION_WORKFLOW !== 'false') {
        escalationInterval = scheduleEscalationWorkflow(30);
        logger.info('Escalation workflow scheduled');
      }
    });

    // Handle graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      gracefulShutdown('uncaughtException');
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection', { reason });
      gracefulShutdown('unhandledRejection');
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

let server: ReturnType<typeof app.listen>;
let escalationInterval: NodeJS.Timeout;

startServer();

export default app;
