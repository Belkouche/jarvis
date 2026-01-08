import { Router, Request, Response } from 'express';
import { prisma } from '../config/database.js';
import { getRedisClient } from '../config/redis.js';
import type { ApiResponse } from '../types/index.js';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  services: {
    database: 'connected' | 'disconnected';
    redis: 'connected' | 'disconnected';
    lmStudio?: 'available' | 'unavailable';
  };
  version: string;
}

// Basic health check
router.get('/health', (_req: Request, res: Response<ApiResponse<{ status: string }>>) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
    },
  });
});

// Detailed health check with service status
router.get('/health/detailed', async (_req: Request, res: Response<ApiResponse<HealthStatus>>) => {
  const services = {
    database: 'disconnected' as const,
    redis: 'disconnected' as const,
  };

  // Check database
  try {
    await prisma.$queryRaw`SELECT 1`;
    services.database = 'connected';
  } catch {
    // Database not connected
  }

  // Check Redis
  try {
    const redis = getRedisClient();
    await redis.ping();
    services.redis = 'connected';
  } catch {
    // Redis not connected
  }

  const allConnected = services.database === 'connected' && services.redis === 'connected';
  const anyConnected = services.database === 'connected' || services.redis === 'connected';

  const status: HealthStatus = {
    status: allConnected ? 'healthy' : anyConnected ? 'degraded' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services,
    version: process.env.npm_package_version || '1.0.0',
  };

  res.status(allConnected ? 200 : anyConnected ? 200 : 503).json({
    success: allConnected,
    data: status,
  });
});

// Readiness probe for Kubernetes
router.get('/ready', async (_req: Request, res: Response<ApiResponse<{ ready: boolean }>>) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const redis = getRedisClient();
    await redis.ping();

    res.json({
      success: true,
      data: { ready: true },
    });
  } catch {
    res.status(503).json({
      success: false,
      data: { ready: false },
    });
  }
});

// Liveness probe for Kubernetes
router.get('/live', (_req: Request, res: Response<ApiResponse<{ live: boolean }>>) => {
  res.json({
    success: true,
    data: { live: true },
  });
});

export default router;
