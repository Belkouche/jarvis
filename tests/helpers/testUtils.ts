import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { prisma } from '../../src/config/database';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

export interface TestUser {
  id: string;
  email: string;
  role: string;
}

/**
 * Create a test user in the database
 */
export async function createTestUser(
  email: string,
  role: 'admin' | 'bo_team' | 'viewer' = 'admin'
): Promise<TestUser> {
  const existingUser = await prisma.adminUser.findUnique({
    where: { email },
  });

  if (existingUser) {
    return {
      id: existingUser.id,
      email: existingUser.email,
      role: existingUser.role,
    };
  }

  const user = await prisma.adminUser.create({
    data: {
      email,
      name: `Test ${role}`,
      role,
      passwordHash: await bcrypt.hash('test-password', 10),
    },
  });

  return {
    id: user.id,
    email: user.email,
    role: user.role,
  };
}

/**
 * Generate a JWT token for testing
 */
export function generateTestToken(user: TestUser): string {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

/**
 * Clean up test data from the database
 */
export async function cleanupTestData(): Promise<void> {
  // Delete in correct order due to foreign keys
  await prisma.ticket.deleteMany({
    where: {
      complaint: {
        phone: { startsWith: '+212600000' },
      },
    },
  });

  await prisma.complaint.deleteMany({
    where: {
      phone: { startsWith: '+212600000' },
    },
  });

  await prisma.message.deleteMany({
    where: {
      phone: { startsWith: '+212600000' },
    },
  });

  await prisma.session.deleteMany({
    where: {
      user: {
        email: { endsWith: '@test.com' },
      },
    },
  });

  await prisma.magicLink.deleteMany({
    where: {
      user: {
        email: { endsWith: '@test.com' },
      },
    },
  });

  await prisma.adminUser.deleteMany({
    where: {
      email: { endsWith: '@test.com' },
    },
  });
}

/**
 * Create a test complaint
 */
export async function createTestComplaint(overrides: Partial<{
  phone: string;
  contractNumber: string;
  complaintType: string;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'assigned' | 'escalated' | 'resolved';
}> = {}) {
  return prisma.complaint.create({
    data: {
      phone: overrides.phone || '+212600000001',
      contractNumber: overrides.contractNumber || 'FT-TEST-001',
      complaintType: overrides.complaintType || 'delay',
      priority: overrides.priority || 'medium',
      status: overrides.status || 'open',
    },
  });
}

/**
 * Create a test message
 */
export async function createTestMessage(overrides: Partial<{
  phone: string;
  incomingMessage: string;
  intent: string;
}> = {}) {
  return prisma.message.create({
    data: {
      phone: overrides.phone || '+212600000001',
      incomingMessage: overrides.incomingMessage || 'Test message',
      languageDetected: 'fr',
      intent: overrides.intent || 'greeting',
      totalLatency: 100,
    },
  });
}

/**
 * Wait for a specified time (useful for testing async operations)
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mock Evolution API responses
 */
export function mockEvolutionApi() {
  return {
    sendMessage: jest.fn().mockResolvedValue({
      key: { id: 'test-message-id' },
      status: 'PENDING',
    }),
  };
}

/**
 * Mock LM Studio responses
 */
export function mockLmStudio() {
  return {
    analyze: jest.fn().mockResolvedValue({
      intent: 'contract_status',
      language: 'fr',
      contractNumber: 'FT-123456789',
      confidence: 0.95,
    }),
  };
}
