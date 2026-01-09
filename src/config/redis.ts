import Redis from 'ioredis';
import crypto from 'crypto';
import { logger } from './logger.js';

// SECURITY: Redis cache encryption for sensitive data
const REDIS_ENCRYPTION_KEY = process.env.REDIS_ENCRYPTION_KEY;
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Check if encryption is enabled
const encryptionEnabled = !!REDIS_ENCRYPTION_KEY && REDIS_ENCRYPTION_KEY.length >= 32;

if (REDIS_ENCRYPTION_KEY && REDIS_ENCRYPTION_KEY.length < 32) {
  logger.warn('SECURITY: REDIS_ENCRYPTION_KEY must be at least 32 characters - encryption disabled');
}

/**
 * Encrypt data for Redis storage
 */
function encryptData(data: string): string {
  if (!encryptionEnabled || !REDIS_ENCRYPTION_KEY) {
    return data;
  }

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = crypto.createHash('sha256').update(REDIS_ENCRYPTION_KEY).digest();
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encryptedData (all base64)
    return `ENC:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  } catch (error) {
    logger.error('Redis encryption failed', { error: (error as Error).message });
    return data; // Fallback to unencrypted
  }
}

/**
 * Decrypt data from Redis storage
 */
function decryptData(data: string): string {
  if (!encryptionEnabled || !REDIS_ENCRYPTION_KEY) {
    return data;
  }

  // Check if data is encrypted
  if (!data.startsWith('ENC:')) {
    return data;
  }

  try {
    const parts = data.split(':');
    if (parts.length !== 4) {
      logger.warn('Invalid encrypted data format');
      return data;
    }

    const [, ivBase64, authTagBase64, encryptedData] = parts;
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');
    const key = crypto.createHash('sha256').update(REDIS_ENCRYPTION_KEY).digest();

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    logger.error('Redis decryption failed', { error: (error as Error).message });
    return data; // Return as-is if decryption fails
  }
}

let redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379/0';

    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      lazyConnect: true,
    });

    redis.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redis.on('error', (error) => {
      logger.error('Redis connection error', { error: error.message });
    });

    redis.on('close', () => {
      logger.warn('Redis connection closed');
    });
  }

  return redis;
}

export async function connectRedis(): Promise<void> {
  const client = getRedisClient();
  try {
    await client.connect();
  } catch (error) {
    // Connection might already be established
    if ((error as Error).message !== 'Redis is already connecting/connected') {
      throw error;
    }
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.info('Redis disconnected');
  }
}

// SECURITY: Cache utility functions with optional encryption for sensitive data
export const cache = {
  /**
   * Get value from cache, with automatic decryption if encrypted
   */
  async get<T>(key: string): Promise<T | null> {
    const client = getRedisClient();
    const value = await client.get(key);
    if (!value) return null;
    try {
      // Decrypt if encrypted
      const decrypted = decryptData(value);
      return JSON.parse(decrypted) as T;
    } catch {
      return value as unknown as T;
    }
  },

  /**
   * Set value in cache with optional encryption
   * @param encrypt - Set to true to encrypt sensitive data
   */
  async set<T>(key: string, value: T, ttlSeconds?: number, encrypt: boolean = false): Promise<void> {
    const client = getRedisClient();
    let serialized = typeof value === 'string' ? value : JSON.stringify(value);

    // Encrypt if requested and encryption is enabled
    if (encrypt) {
      serialized = encryptData(serialized);
    }

    if (ttlSeconds) {
      await client.setex(key, ttlSeconds, serialized);
    } else {
      await client.set(key, serialized);
    }
  },

  /**
   * Set sensitive value with encryption (convenience method)
   */
  async setSecure<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    return this.set(key, value, ttlSeconds, true);
  },

  async del(key: string): Promise<void> {
    const client = getRedisClient();
    await client.del(key);
  },

  async exists(key: string): Promise<boolean> {
    const client = getRedisClient();
    const result = await client.exists(key);
    return result === 1;
  },

  async ttl(key: string): Promise<number> {
    const client = getRedisClient();
    return client.ttl(key);
  },

  // Generate CRM cache key with 5-minute window
  getCrmCacheKey(contractNumber: string): string {
    return `crm_${contractNumber}`;
  },

  // Check if encryption is enabled
  isEncryptionEnabled(): boolean {
    return encryptionEnabled;
  },
};
