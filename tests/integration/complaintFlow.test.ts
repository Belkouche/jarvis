import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/config/database';
import { createTestUser, generateTestToken, cleanupTestData } from '../helpers/testUtils';

describe('Complaint Flow Integration Tests', () => {
  let adminToken: string;
  let boTeamToken: string;
  let adminUser: { id: string; email: string };
  let boTeamUser: { id: string; email: string };
  let testComplaintId: string;

  const testContract = 'FT-TEST-001';
  const testPhone = '+212600000099';

  beforeAll(async () => {
    // Create test users
    adminUser = await createTestUser('admin@test.com', 'admin');
    boTeamUser = await createTestUser('bo@test.com', 'bo_team');

    // Generate tokens
    adminToken = generateTestToken(adminUser);
    boTeamToken = generateTestToken(boTeamUser);
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up complaints before each test
    await prisma.complaint.deleteMany({ where: { phone: testPhone } });
  });

  describe('Complaint CRUD Operations', () => {
    it('should create a complaint via message webhook', async () => {
      const response = await request(app)
        .post('/api/webhook/message')
        .send({
          data: {
            key: { remoteJid: `${testPhone}@s.whatsapp.net` },
            message: {
              conversation: `Réclamation urgente! Contrat ${testContract} - problème depuis 3 semaines`,
            },
            messageTimestamp: Math.floor(Date.now() / 1000),
          },
        })
        .expect(200);

      expect(response.body.data.isComplaint).toBe(true);

      // Get the created complaint
      const complaint = await prisma.complaint.findFirst({
        where: { phone: testPhone },
      });
      expect(complaint).toBeDefined();
      testComplaintId = complaint!.id;
    });

    it('should list complaints with authentication', async () => {
      // Create a complaint first
      await prisma.complaint.create({
        data: {
          phone: testPhone,
          contractNumber: testContract,
          complaintType: 'delay',
          message: 'Test complaint',
          priority: 'medium',
          status: 'open',
        },
      });

      const response = await request(app)
        .get('/api/complaints')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.complaints).toBeInstanceOf(Array);
      expect(response.body.data.pagination).toBeDefined();
    });

    it('should filter complaints by status', async () => {
      // Create complaints with different statuses
      await prisma.complaint.createMany({
        data: [
          { phone: testPhone, contractNumber: testContract, complaintType: 'delay', priority: 'low', status: 'open' },
          { phone: testPhone, contractNumber: testContract, complaintType: 'quality', priority: 'medium', status: 'resolved' },
        ],
      });

      const response = await request(app)
        .get('/api/complaints?status=open')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.complaints.every((c: { status: string }) => c.status === 'open')).toBe(true);
    });

    it('should filter complaints by priority', async () => {
      await prisma.complaint.createMany({
        data: [
          { phone: testPhone, contractNumber: testContract, complaintType: 'delay', priority: 'high', status: 'open' },
          { phone: testPhone, contractNumber: testContract, complaintType: 'quality', priority: 'low', status: 'open' },
        ],
      });

      const response = await request(app)
        .get('/api/complaints?priority=high')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.complaints.every((c: { priority: string }) => c.priority === 'high')).toBe(true);
    });
  });

  describe('Complaint Assignment', () => {
    beforeEach(async () => {
      const complaint = await prisma.complaint.create({
        data: {
          phone: testPhone,
          contractNumber: testContract,
          complaintType: 'service',
          priority: 'medium',
          status: 'open',
        },
      });
      testComplaintId = complaint.id;
    });

    it('should allow admin to assign complaint', async () => {
      const response = await request(app)
        .post(`/api/complaints/${testComplaintId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assignedTo: boTeamUser.id })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.assignedTo).toBe(boTeamUser.id);
      expect(response.body.data.status).toBe('assigned');
    });

    it('should not allow BO team to assign complaints', async () => {
      await request(app)
        .post(`/api/complaints/${testComplaintId}/assign`)
        .set('Authorization', `Bearer ${boTeamToken}`)
        .send({ assignedTo: adminUser.id })
        .expect(403);
    });
  });

  describe('Complaint Status Updates', () => {
    beforeEach(async () => {
      const complaint = await prisma.complaint.create({
        data: {
          phone: testPhone,
          contractNumber: testContract,
          complaintType: 'billing',
          priority: 'low',
          status: 'open',
        },
      });
      testComplaintId = complaint.id;
    });

    it('should update complaint status', async () => {
      const response = await request(app)
        .patch(`/api/complaints/${testComplaintId}/status`)
        .set('Authorization', `Bearer ${boTeamToken}`)
        .send({ status: 'assigned' })
        .expect(200);

      expect(response.body.data.status).toBe('assigned');
    });

    it('should add notes to complaint', async () => {
      const response = await request(app)
        .post(`/api/complaints/${testComplaintId}/notes`)
        .set('Authorization', `Bearer ${boTeamToken}`)
        .send({ notes: 'Contacted customer, waiting for response' })
        .expect(200);

      expect(response.body.data.notes).toContain('Contacted customer');
    });

    it('should resolve complaint with resolution', async () => {
      const response = await request(app)
        .post(`/api/complaints/${testComplaintId}/resolve`)
        .set('Authorization', `Bearer ${boTeamToken}`)
        .send({ resolution: 'Issue fixed, customer satisfied' })
        .expect(200);

      expect(response.body.data.status).toBe('resolved');
      expect(response.body.data.notes).toContain('Resolution: Issue fixed');
    });
  });

  describe('Complaint Escalation', () => {
    beforeEach(async () => {
      const complaint = await prisma.complaint.create({
        data: {
          phone: testPhone,
          contractNumber: testContract,
          complaintType: 'delay',
          priority: 'high',
          status: 'open',
        },
      });
      testComplaintId = complaint.id;
    });

    it('should allow admin to escalate to Orange', async () => {
      const response = await request(app)
        .post(`/api/complaints/${testComplaintId}/escalate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.complaint.status).toBe('escalated');
      expect(response.body.data.complaint.escalatedToOrange).toBe(true);
      expect(response.body.data.ticket).toBeDefined();
    });

    it('should not allow BO team to escalate', async () => {
      await request(app)
        .post(`/api/complaints/${testComplaintId}/escalate`)
        .set('Authorization', `Bearer ${boTeamToken}`)
        .expect(403);
    });

    it('should not allow double escalation', async () => {
      // First escalation
      await request(app)
        .post(`/api/complaints/${testComplaintId}/escalate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Second escalation should fail
      const response = await request(app)
        .post(`/api/complaints/${testComplaintId}/escalate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.error).toContain('already escalated');
    });
  });

  describe('Complaint Statistics', () => {
    beforeEach(async () => {
      await prisma.complaint.createMany({
        data: [
          { phone: testPhone, contractNumber: testContract, complaintType: 'delay', priority: 'high', status: 'open' },
          { phone: testPhone, contractNumber: testContract, complaintType: 'quality', priority: 'medium', status: 'assigned' },
          { phone: testPhone, contractNumber: testContract, complaintType: 'service', priority: 'low', status: 'resolved' },
        ],
      });
    });

    it('should return complaint statistics', async () => {
      const response = await request(app)
        .get('/api/complaints/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.total).toBeGreaterThanOrEqual(3);
      expect(response.body.data.byStatus).toBeDefined();
      expect(response.body.data.byPriority).toBeDefined();
      expect(response.body.data.byType).toBeDefined();
    });
  });

  describe('Authentication & Authorization', () => {
    it('should reject unauthenticated requests', async () => {
      await request(app)
        .get('/api/complaints')
        .expect(401);
    });

    it('should reject invalid tokens', async () => {
      await request(app)
        .get('/api/complaints')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });
});
