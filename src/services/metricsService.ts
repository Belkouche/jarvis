import { prisma } from '../config/database';
import { logger } from '../config/logger';

interface MessageMetrics {
  totalMessages: number;
  successMessages: number;
  errorMessages: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  messagesPerHour: number;
  intentBreakdown: Record<string, number>;
  languageBreakdown: Record<string, number>;
}

interface ComplaintMetrics {
  totalComplaints: number;
  openComplaints: number;
  avgResolutionHours: number;
  escalatedCount: number;
  priorityBreakdown: Record<string, number>;
}

interface SystemMetrics {
  uptime: number;
  memoryUsageMb: number;
  cacheHitRate: number;
  lmStudioFallbackRate: number;
}

// Store for tracking runtime metrics
const runtimeMetrics = {
  cacheHits: 0,
  cacheMisses: 0,
  lmStudioCalls: 0,
  lmStudioFallbacks: 0,
  requestCount: 0,
  errorCount: 0,
  latencySum: 0,
  startTime: Date.now(),
};

/**
 * Track cache hit/miss
 */
export function trackCacheAccess(hit: boolean): void {
  if (hit) {
    runtimeMetrics.cacheHits++;
  } else {
    runtimeMetrics.cacheMisses++;
  }
}

/**
 * Track LM Studio usage
 */
export function trackLmStudioCall(usedFallback: boolean): void {
  runtimeMetrics.lmStudioCalls++;
  if (usedFallback) {
    runtimeMetrics.lmStudioFallbacks++;
  }
}

/**
 * Track request
 */
export function trackRequest(latencyMs: number, error: boolean = false): void {
  runtimeMetrics.requestCount++;
  runtimeMetrics.latencySum += latencyMs;
  if (error) {
    runtimeMetrics.errorCount++;
  }
}

/**
 * Get message metrics for a time period
 */
export async function getMessageMetrics(
  hours: number = 24
): Promise<MessageMetrics> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const [
    total,
    success,
    errors,
    avgLatency,
    intents,
    languages,
    messagesPerHour,
  ] = await Promise.all([
    prisma.message.count({
      where: { createdAt: { gte: since } },
    }),
    prisma.message.count({
      where: { createdAt: { gte: since }, errorMessage: null },
    }),
    prisma.message.count({
      where: { createdAt: { gte: since }, errorMessage: { not: null } },
    }),
    prisma.message.aggregate({
      where: { createdAt: { gte: since } },
      _avg: { totalLatency: true },
    }),
    prisma.message.groupBy({
      by: ['intent'],
      where: { createdAt: { gte: since } },
      _count: true,
    }),
    prisma.message.groupBy({
      by: ['languageDetected'],
      where: { createdAt: { gte: since } },
      _count: true,
    }),
    prisma.message.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000),
        },
      },
    }),
  ]);

  // Get p95 latency (approximate)
  const latencies = await prisma.message.findMany({
    where: { createdAt: { gte: since } },
    select: { totalLatency: true },
    orderBy: { totalLatency: 'asc' },
    take: 1000,
  });

  const p95Index = Math.floor(latencies.length * 0.95);
  const p95Latency = latencies[p95Index]?.totalLatency || 0;

  return {
    totalMessages: total,
    successMessages: success,
    errorMessages: errors,
    avgLatencyMs: Math.round(avgLatency._avg.totalLatency || 0),
    p95LatencyMs: p95Latency,
    messagesPerHour,
    intentBreakdown: Object.fromEntries(
      intents.map((i) => [i.intent || 'unknown', i._count])
    ),
    languageBreakdown: Object.fromEntries(
      languages.map((l) => [l.languageDetected || 'unknown', l._count])
    ),
  };
}

/**
 * Get complaint metrics
 */
export async function getComplaintMetrics(): Promise<ComplaintMetrics> {
  const [total, open, escalated, priorities, resolved] = await Promise.all([
    prisma.complaint.count(),
    prisma.complaint.count({
      where: { status: { in: ['open', 'assigned'] } },
    }),
    prisma.complaint.count({
      where: { escalatedToOrange: true },
    }),
    prisma.complaint.groupBy({
      by: ['priority'],
      _count: true,
    }),
    prisma.complaint.findMany({
      where: { status: 'resolved' },
      select: { createdAt: true, updatedAt: true },
    }),
  ]);

  // Calculate average resolution time
  let avgResolutionHours = 0;
  if (resolved.length > 0) {
    const totalHours = resolved.reduce((sum, c) => {
      const diff = c.updatedAt.getTime() - c.createdAt.getTime();
      return sum + diff / (1000 * 60 * 60);
    }, 0);
    avgResolutionHours = Math.round(totalHours / resolved.length);
  }

  return {
    totalComplaints: total,
    openComplaints: open,
    avgResolutionHours,
    escalatedCount: escalated,
    priorityBreakdown: Object.fromEntries(
      priorities.map((p) => [p.priority, p._count])
    ),
  };
}

/**
 * Get system metrics
 */
export function getSystemMetrics(): SystemMetrics {
  const cacheTotal = runtimeMetrics.cacheHits + runtimeMetrics.cacheMisses;
  const cacheHitRate = cacheTotal > 0
    ? Math.round((runtimeMetrics.cacheHits / cacheTotal) * 100)
    : 0;

  const fallbackRate = runtimeMetrics.lmStudioCalls > 0
    ? Math.round((runtimeMetrics.lmStudioFallbacks / runtimeMetrics.lmStudioCalls) * 100)
    : 0;

  return {
    uptime: Math.floor((Date.now() - runtimeMetrics.startTime) / 1000),
    memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    cacheHitRate,
    lmStudioFallbackRate: fallbackRate,
  };
}

/**
 * Get all metrics
 */
export async function getAllMetrics(): Promise<{
  messages: MessageMetrics;
  complaints: ComplaintMetrics;
  system: SystemMetrics;
  timestamp: string;
}> {
  const [messages, complaints] = await Promise.all([
    getMessageMetrics(),
    getComplaintMetrics(),
  ]);

  return {
    messages,
    complaints,
    system: getSystemMetrics(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Log metrics periodically (for external monitoring)
 */
export function startMetricsLogging(intervalMinutes: number = 5): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      const metrics = await getAllMetrics();

      logger.info('Metrics snapshot', {
        messages: {
          total: metrics.messages.totalMessages,
          errors: metrics.messages.errorMessages,
          avgLatency: metrics.messages.avgLatencyMs,
        },
        complaints: {
          open: metrics.complaints.openComplaints,
          escalated: metrics.complaints.escalatedCount,
        },
        system: metrics.system,
      });
    } catch (error) {
      logger.error('Failed to log metrics', { error });
    }
  }, intervalMinutes * 60 * 1000);
}

/**
 * Export Prometheus-compatible metrics
 */
export async function getPrometheusMetrics(): Promise<string> {
  const metrics = await getAllMetrics();

  const lines: string[] = [
    '# HELP jarvis_messages_total Total number of messages processed',
    '# TYPE jarvis_messages_total counter',
    `jarvis_messages_total ${metrics.messages.totalMessages}`,

    '# HELP jarvis_messages_errors_total Total number of message errors',
    '# TYPE jarvis_messages_errors_total counter',
    `jarvis_messages_errors_total ${metrics.messages.errorMessages}`,

    '# HELP jarvis_message_latency_ms Average message processing latency',
    '# TYPE jarvis_message_latency_ms gauge',
    `jarvis_message_latency_ms ${metrics.messages.avgLatencyMs}`,

    '# HELP jarvis_complaints_open Number of open complaints',
    '# TYPE jarvis_complaints_open gauge',
    `jarvis_complaints_open ${metrics.complaints.openComplaints}`,

    '# HELP jarvis_complaints_escalated Number of escalated complaints',
    '# TYPE jarvis_complaints_escalated counter',
    `jarvis_complaints_escalated ${metrics.complaints.escalatedCount}`,

    '# HELP jarvis_cache_hit_rate Cache hit rate percentage',
    '# TYPE jarvis_cache_hit_rate gauge',
    `jarvis_cache_hit_rate ${metrics.system.cacheHitRate}`,

    '# HELP jarvis_memory_usage_mb Memory usage in MB',
    '# TYPE jarvis_memory_usage_mb gauge',
    `jarvis_memory_usage_mb ${metrics.system.memoryUsageMb}`,

    '# HELP jarvis_uptime_seconds Application uptime in seconds',
    '# TYPE jarvis_uptime_seconds counter',
    `jarvis_uptime_seconds ${metrics.system.uptime}`,
  ];

  return lines.join('\n');
}
