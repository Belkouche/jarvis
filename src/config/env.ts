import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Node.js
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),

  // Database
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // LM Studio
  LM_STUDIO_URL: z.string().url(),
  LM_STUDIO_TIMEOUT: z.string().transform(Number).default('10000'),

  // Evolution API
  EVOLUTION_API_URL: z.string().url(),
  EVOLUTION_API_KEY: z.string().min(1),
  EVOLUTION_WEBHOOK_SECRET: z.string().min(1),

  // Resend Email
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().email(),
  RESEND_ADMIN_EMAIL: z.string().email(),

  // Admin Dashboard
  DASHBOARD_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().transform(Number).default('86400'),

  // D2D Portal
  D2D_PORTAL_URL: z.string().url(),
  D2D_USERNAME: z.string().min(1),
  D2D_PASSWORD: z.string().min(1),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  SENTRY_DSN: z.string().optional(),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('60000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('10'),

  // Cache
  CACHE_TTL_CRM: z.string().transform(Number).default('300'),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
};

export const env = parseEnv();

export type Env = z.infer<typeof envSchema>;
