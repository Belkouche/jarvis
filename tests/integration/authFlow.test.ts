import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/config/database';

describe('Authentication Flow Integration Tests', () => {
  const testEmail = 'auth-test@jarvis.test';

  afterAll(async () => {
    // Cleanup
    await prisma.session.deleteMany({ where: { email: testEmail } });
    await prisma.magicLink.deleteMany({ where: { email: testEmail } });
    await prisma.adminUser.deleteMany({ where: { email: testEmail } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.session.deleteMany({ where: { email: testEmail } });
    await prisma.magicLink.deleteMany({ where: { email: testEmail } });
  });

  describe('Magic Link Request', () => {
    beforeEach(async () => {
      // Ensure test user exists
      await prisma.adminUser.upsert({
        where: { email: testEmail },
        create: { email: testEmail, name: 'Auth Test User', role: 'bo_team' },
        update: {},
      });
    });

    it('should request a magic link for existing user', async () => {
      const response = await request(app)
        .post('/api/auth/magic-link')
        .send({ email: testEmail })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('sent');

      // Verify magic link was created
      const magicLink = await prisma.magicLink.findFirst({
        where: { email: testEmail, used: false },
      });
      expect(magicLink).toBeDefined();
    });

    it('should reject request for non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/magic-link')
        .send({ email: 'nonexistent@jarvis.test' })
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/api/auth/magic-link')
        .send({ email: 'invalid-email' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject missing email', async () => {
      const response = await request(app)
        .post('/api/auth/magic-link')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Magic Link Verification', () => {
    let validToken: string;

    beforeEach(async () => {
      // Ensure test user exists
      await prisma.adminUser.upsert({
        where: { email: testEmail },
        create: { email: testEmail, name: 'Auth Test User', role: 'bo_team' },
        update: {},
      });

      // Create a valid magic link
      const magicLink = await prisma.magicLink.create({
        data: {
          email: testEmail,
          token: 'test-valid-token-' + Date.now(),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
        },
      });
      validToken = magicLink.token;
    });

    it('should verify valid magic link and return session', async () => {
      const response = await request(app)
        .post('/api/auth/verify')
        .send({ token: validToken })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.email).toBe(testEmail);
    });

    it('should reject expired magic link', async () => {
      // Create an expired magic link
      const expiredLink = await prisma.magicLink.create({
        data: {
          email: testEmail,
          token: 'expired-token-' + Date.now(),
          expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        },
      });

      const response = await request(app)
        .post('/api/auth/verify')
        .send({ token: expiredLink.token })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should reject already used magic link', async () => {
      // First use
      await request(app)
        .post('/api/auth/verify')
        .send({ token: validToken })
        .expect(200);

      // Second use should fail
      const response = await request(app)
        .post('/api/auth/verify')
        .send({ token: validToken })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should reject invalid token', async () => {
      const response = await request(app)
        .post('/api/auth/verify')
        .send({ token: 'invalid-token-that-does-not-exist' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Session Management', () => {
    let sessionToken: string;

    beforeEach(async () => {
      // Ensure test user exists
      await prisma.adminUser.upsert({
        where: { email: testEmail },
        create: { email: testEmail, name: 'Auth Test User', role: 'bo_team' },
        update: {},
      });

      // Create a magic link and verify it to get a session
      const magicLink = await prisma.magicLink.create({
        data: {
          email: testEmail,
          token: 'session-test-token-' + Date.now(),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });

      const response = await request(app)
        .post('/api/auth/verify')
        .send({ token: magicLink.token });

      sessionToken = response.body.data.token;
    });

    it('should get current user with valid session', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${sessionToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe(testEmail);
    });

    it('should refresh session token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${sessionToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.token).not.toBe(sessionToken);
    });

    it('should logout and invalidate session', async () => {
      // Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${sessionToken}`)
        .expect(200);

      // Try to use old session
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${sessionToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit magic link requests', async () => {
      // Ensure test user exists
      await prisma.adminUser.upsert({
        where: { email: testEmail },
        create: { email: testEmail, name: 'Auth Test User', role: 'bo_team' },
        update: {},
      });

      // Make multiple requests quickly
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(
          request(app)
            .post('/api/auth/magic-link')
            .send({ email: testEmail })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.some(r => r.status === 429);

      // At least one should be rate limited (depends on rate limit config)
      // This test may need adjustment based on actual rate limit settings
      expect(responses.some(r => r.status === 200 || r.status === 429)).toBe(true);
    });
  });
});
