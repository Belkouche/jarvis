import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/config/database';
import { createTestUser, generateTestToken, cleanupTestData } from '../helpers/testUtils';

describe('Dashboard Flow Integration Tests', () => {
  let adminToken: string;
  let boTeamToken: string;
  let viewerToken: string;
  let adminUser: { id: string; email: string };
  let boTeamUser: { id: string; email: string };
  let viewerUser: { id: string; email: string };

  const testPhone = '+212600000088';

  beforeAll(async () => {
    // Create test users with different roles
    adminUser = await createTestUser('dashboard-admin@test.com', 'admin');
    boTeamUser = await createTestUser('dashboard-bo@test.com', 'bo_team');
    viewerUser = await createTestUser('dashboard-viewer@test.com', 'viewer');

    // Generate tokens
    adminToken = generateTestToken(adminUser);
    boTeamToken = generateTestToken(boTeamUser);
    viewerToken = generateTestToken(viewerUser);
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up test messages
    await prisma.message.deleteMany({ where: { phone: testPhone } });
  });

  describe('Message Listing', () => {
    beforeEach(async () => {
      // Create test messages
      await prisma.message.createMany({
        data: [
          {
            phone: testPhone,
            incomingMessage: 'Test message 1 - contract status',
            languageDetected: 'fr',
            intent: 'contract_status',
            contractNumber: 'F1234567D',
            isValidFormat: true,
            totalLatency: 150,
            createdAt: new Date(),
          },
          {
            phone: testPhone,
            incomingMessage: 'Test message 2 - complaint',
            languageDetected: 'ar',
            intent: 'complaint',
            hasComplaint: true,
            complaintType: 'delay',
            totalLatency: 200,
            createdAt: new Date(Date.now() - 86400000), // Yesterday
          },
          {
            phone: testPhone,
            incomingMessage: 'Test message 3 - error',
            languageDetected: 'fr',
            errorCode: 'INVALID_FORMAT',
            errorMessage: 'Invalid contract format',
            totalLatency: 50,
            createdAt: new Date(Date.now() - 172800000), // 2 days ago
          },
        ],
      });
    });

    it('should list messages with pagination', async () => {
      const response = await request(app)
        .get('/api/dashboard/messages')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.total).toBeGreaterThanOrEqual(3);
    });

    it('should filter messages by date range', async () => {
      const today = new Date().toISOString().split('T')[0];

      const response = await request(app)
        .get(`/api/dashboard/messages?dateFrom=${today}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter messages by status (success)', async () => {
      const response = await request(app)
        .get('/api/dashboard/messages?status=success')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // All returned messages should have no error code
      expect(response.body.data.every((m: { errorCode: string | null }) => m.errorCode === null)).toBe(true);
    });

    it('should filter messages by status (error)', async () => {
      const response = await request(app)
        .get('/api/dashboard/messages?status=error')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // All returned messages should have an error code
      expect(response.body.data.every((m: { errorCode: string | null }) => m.errorCode !== null)).toBe(true);
    });

    it('should filter messages by complaint flag', async () => {
      const response = await request(app)
        .get('/api/dashboard/messages?hasComplaint=true')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.every((m: { hasComplaint: boolean }) => m.hasComplaint === true)).toBe(true);
    });

    it('should search messages by contract number', async () => {
      const response = await request(app)
        .get('/api/dashboard/messages?contract=F1234567D')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.some((m: { contractNumber: string }) => m.contractNumber === 'F1234567D')).toBe(true);
    });

    it('should allow viewer role to list messages', async () => {
      const response = await request(app)
        .get('/api/dashboard/messages')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Message Details', () => {
    let testMessageId: string;

    beforeEach(async () => {
      const message = await prisma.message.create({
        data: {
          phone: testPhone,
          incomingMessage: 'Detailed test message',
          languageDetected: 'fr',
          intent: 'contract_status',
          contractNumber: 'F7654321D',
          isValidFormat: true,
          crmStatus: { etat: 'RDV Programmé', sous_etat: 'En attente' },
          totalLatency: 180,
        },
      });
      testMessageId = message.id;
    });

    it('should get message details by ID', async () => {
      const response = await request(app)
        .get(`/api/dashboard/messages/${testMessageId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testMessageId);
      expect(response.body.data.phone).toBe(testPhone);
      expect(response.body.data.crmStatus).toBeDefined();
    });

    it('should return 404 for non-existent message', async () => {
      const response = await request(app)
        .get('/api/dashboard/messages/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should reject invalid UUID format', async () => {
      const response = await request(app)
        .get('/api/dashboard/messages/invalid-uuid')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      // Create test messages for statistics
      await prisma.message.createMany({
        data: [
          {
            phone: testPhone,
            incomingMessage: 'Stats test 1',
            totalLatency: 100,
            createdAt: new Date(),
          },
          {
            phone: testPhone,
            incomingMessage: 'Stats test 2',
            totalLatency: 200,
            errorCode: 'TEST_ERROR',
            createdAt: new Date(),
          },
          {
            phone: testPhone,
            incomingMessage: 'Stats test 3',
            totalLatency: 150,
            lmStudioFallback: true,
            createdAt: new Date(),
          },
        ],
      });
    });

    it('should get daily statistics', async () => {
      const response = await request(app)
        .get('/api/dashboard/stats?period=day')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.period).toBe('day');
      expect(response.body.data.totalMessages).toBeGreaterThanOrEqual(3);
      expect(response.body.data.successRate).toBeDefined();
    });

    it('should get weekly statistics', async () => {
      const response = await request(app)
        .get('/api/dashboard/stats?period=week')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.period).toBe('week');
    });

    it('should get monthly statistics', async () => {
      const response = await request(app)
        .get('/api/dashboard/stats?period=month')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.period).toBe('month');
    });

    it('should include fallback statistics', async () => {
      const response = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.fallbackCount).toBeDefined();
      expect(response.body.data.fallbackRate).toBeDefined();
    });
  });

  describe('Export Functionality', () => {
    beforeEach(async () => {
      await prisma.message.createMany({
        data: [
          {
            phone: testPhone,
            incomingMessage: 'Export test 1',
            languageDetected: 'fr',
            intent: 'contract_status',
            totalLatency: 100,
          },
          {
            phone: testPhone,
            incomingMessage: 'Export test 2',
            languageDetected: 'ar',
            intent: 'complaint',
            totalLatency: 150,
          },
        ],
      });
    });

    it('should export messages as CSV', async () => {
      const response = await request(app)
        .get('/api/dashboard/export?type=messages&format=csv')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.text).toContain('ID,Phone,Contractor');
    });

    it('should export messages as JSON', async () => {
      const response = await request(app)
        .get('/api/dashboard/export?type=messages&format=json')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it('should allow BO team to export', async () => {
      const response = await request(app)
        .get('/api/dashboard/export?format=csv')
        .set('Authorization', `Bearer ${boTeamToken}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
    });

    it('should not allow viewer role to export', async () => {
      await request(app)
        .get('/api/dashboard/export')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(403);
    });
  });

  describe('Health & Metrics', () => {
    it('should return health check status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.checks).toBeDefined();
    });

    it('should return metrics with authentication', async () => {
      const response = await request(app)
        .get('/health/metrics')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });
  });
});
