import { beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.RESEND_API_KEY = 'test-resend-api-key';

beforeAll(async () => {
  // Global test setup
  console.log('Starting test suite...');
});

afterAll(async () => {
  // Global test cleanup
  console.log('Test suite completed.');
});
