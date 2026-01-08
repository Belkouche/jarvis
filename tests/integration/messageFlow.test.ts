import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock dependencies before importing the app
vi.mock('../../src/config/database.js', () => ({
  prisma: {
    message: {
      create: vi.fn().mockResolvedValue({ id: 'test-message-id' }),
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _avg: { totalLatency: 1000 } }),
    },
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  },
  connectDatabase: vi.fn(),
  disconnectDatabase: vi.fn(),
}));

vi.mock('../../src/config/redis.js', () => ({
  getRedisClient: vi.fn().mockReturnValue({
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    ping: vi.fn().mockResolvedValue('PONG'),
  }),
  connectRedis: vi.fn(),
  disconnectRedis: vi.fn(),
  cache: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
    getCrmCacheKey: vi.fn((contract) => `crm_${contract}`),
  },
}));

vi.mock('../../src/services/lmStudioService.js', () => ({
  analyzeMessage: vi.fn().mockResolvedValue({
    result: {
      language: 'fr',
      intent: 'status_check',
      contract_number: 'F0823846D',
      is_valid_format: true,
      is_spam: false,
      confidence: 0.95,
    },
    usedFallback: false,
    latencyMs: 500,
  }),
  extractContractWithRegex: vi.fn(),
}));

vi.mock('../../src/services/crmService.js', () => ({
  getContractStatus: vi.fn().mockResolvedValue({
    status: {
      contract_id: 'F0823846D',
      etat: 'En cours',
      sous_etat: 'Activation lancée',
      sous_etat_2: null,
      date_created: '2026-01-01',
    },
    fromCache: false,
    latencyMs: 2000,
  }),
}));

vi.mock('../../src/services/evolutionApiService.js', () => ({
  verifyWebhookSignature: vi.fn().mockReturnValue(true),
  parseWebhookMessage: vi.fn().mockImplementation((payload) => {
    if (payload.data?.key?.fromMe) return null;
    return {
      phone: '+212612345678',
      message: payload.data?.message?.conversation || '',
      messageId: payload.data?.key?.id || 'test-id',
      timestamp: new Date().toISOString(),
      senderName: payload.data?.pushName,
    };
  }),
  sendBilingualMessage: vi.fn().mockResolvedValue({ messageId: 'sent-id', success: true }),
  markAsRead: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/messageService.js', () => ({
  generateStatusResponse: vi.fn().mockResolvedValue({
    fr: 'Votre contrat est en cours de traitement',
    ar: 'عقدك قيد المعالجة',
    allowComplaint: true,
  }),
  formatBilingualResponse: vi.fn((fr, ar) => `${fr}\n\n${ar}`),
  getErrorMessage: vi.fn((code) => ({
    fr: `Erreur: ${code}`,
    ar: `خطأ: ${code}`,
  })),
  getWelcomeMessage: vi.fn().mockReturnValue({
    fr: 'Bienvenue sur JARVIS',
    ar: 'مرحباً بك في جارفيس',
  }),
  appendComplaintPrompt: vi.fn((response) => response),
}));

vi.mock('../../src/services/auditService.js', () => ({
  logMessageProcessed: vi.fn().mockResolvedValue(undefined),
}));

// Create test app
import webhookRoutes from '../../src/routes/webhook.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

const app = express();
app.use(express.json());
app.use('/api/webhook', webhookRoutes);
app.use(errorHandler);

describe('Message Flow Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/webhook/message', () => {
    const validWebhookPayload = {
      event: 'messages.upsert',
      instance: 'jarvis',
      data: {
        key: {
          remoteJid: '212612345678@s.whatsapp.net',
          fromMe: false,
          id: 'test-message-id',
        },
        pushName: 'Test User',
        message: {
          conversation: 'F0823846D',
        },
        messageTimestamp: Math.floor(Date.now() / 1000),
      },
    };

    it('should process valid contract number message', async () => {
      const response = await request(app)
        .post('/api/webhook/message')
        .send(validWebhookPayload)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('processed');
    });

    it('should acknowledge outgoing messages without processing', async () => {
      const outgoingPayload = {
        ...validWebhookPayload,
        data: {
          ...validWebhookPayload.data,
          key: {
            ...validWebhookPayload.data.key,
            fromMe: true,
          },
        },
      };

      const response = await request(app)
        .post('/api/webhook/message')
        .send(outgoingPayload)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Event acknowledged');
    });

    it('should handle spam messages', async () => {
      const { analyzeMessage } = await import('../../src/services/lmStudioService.js');
      (analyzeMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        result: {
          language: 'fr',
          intent: 'other',
          contract_number: null,
          is_valid_format: false,
          is_spam: true,
          confidence: 0.9,
        },
        usedFallback: false,
        latencyMs: 100,
      });

      const spamPayload = {
        ...validWebhookPayload,
        data: {
          ...validWebhookPayload.data,
          message: { conversation: '!@#$%^&*()' },
        },
      };

      const response = await request(app)
        .post('/api/webhook/message')
        .send(spamPayload)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should handle invalid contract format', async () => {
      const { analyzeMessage } = await import('../../src/services/lmStudioService.js');
      (analyzeMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        result: {
          language: 'fr',
          intent: 'status_check',
          contract_number: null,
          is_valid_format: false,
          is_spam: false,
          confidence: 0.8,
        },
        usedFallback: false,
        latencyMs: 200,
      });

      const invalidPayload = {
        ...validWebhookPayload,
        data: {
          ...validWebhookPayload.data,
          message: { conversation: 'F123D' },
        },
      };

      const response = await request(app)
        .post('/api/webhook/message')
        .send(invalidPayload)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return welcome message for greetings', async () => {
      const { analyzeMessage } = await import('../../src/services/lmStudioService.js');
      (analyzeMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        result: {
          language: 'fr',
          intent: 'other',
          contract_number: null,
          is_valid_format: false,
          is_spam: false,
          confidence: 0.9,
        },
        usedFallback: false,
        latencyMs: 150,
      });

      const greetingPayload = {
        ...validWebhookPayload,
        data: {
          ...validWebhookPayload.data,
          message: { conversation: 'Bonjour' },
        },
      };

      const response = await request(app)
        .post('/api/webhook/message')
        .send(greetingPayload)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/webhook/health', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/api/webhook/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('ready');
    });
  });

  describe('POST /api/webhook/status', () => {
    it('should acknowledge status updates', async () => {
      const statusPayload = {
        event: 'message.update',
        data: {
          key: { id: 'msg-123' },
          status: 'delivered',
        },
      };

      const response = await request(app)
        .post('/api/webhook/status')
        .send(statusPayload)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Status update received');
    });
  });

  describe('POST /api/webhook/connection', () => {
    it('should acknowledge connection updates', async () => {
      const connectionPayload = {
        event: 'connection.update',
        data: {
          state: 'open',
          instance: 'jarvis',
        },
      };

      const response = await request(app)
        .post('/api/webhook/connection')
        .send(connectionPayload)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Connection update received');
    });
  });
});
