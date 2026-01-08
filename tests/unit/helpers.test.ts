import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withTimeout,
  retry,
  sleep,
  generateToken,
  hashToken,
  safeCompare,
  generateOrangeTicketId,
  parsePagination,
  buildPaginatedResponse,
} from '../../src/utils/helpers.js';

describe('Helper Utilities', () => {
  describe('withTimeout', () => {
    it('should resolve when promise completes before timeout', async () => {
      const promise = Promise.resolve('success');
      const result = await withTimeout(promise, 1000);
      expect(result).toBe('success');
    });

    it('should reject when promise times out', async () => {
      const slowPromise = new Promise((resolve) => setTimeout(() => resolve('late'), 200));
      await expect(withTimeout(slowPromise, 50)).rejects.toThrow('timed out');
    });

    it('should call fallback when timeout occurs', async () => {
      const slowPromise = new Promise((resolve) => setTimeout(() => resolve('late'), 200));
      const fallback = vi.fn().mockReturnValue('fallback value');

      const result = await withTimeout(slowPromise, 50, fallback);
      expect(result).toBe('fallback value');
      expect(fallback).toHaveBeenCalled();
    });

    it('should not call fallback when promise succeeds', async () => {
      const promise = Promise.resolve('success');
      const fallback = vi.fn().mockReturnValue('fallback');

      const result = await withTimeout(promise, 1000, fallback);
      expect(result).toBe('success');
      expect(fallback).not.toHaveBeenCalled();
    });
  });

  describe('retry', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await retry(fn, { maxRetries: 3 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const result = await retry(fn, { maxRetries: 3, baseDelay: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fails'));

      await expect(retry(fn, { maxRetries: 3, baseDelay: 10 })).rejects.toThrow('always fails');
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('sleep', () => {
    it('should delay for specified time', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(45);
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('generateToken', () => {
    it('should generate token with default 32 bytes (64 hex chars)', () => {
      const token = generateToken();
      expect(token).toHaveLength(64);
      expect(/^[a-f0-9]+$/i.test(token)).toBe(true);
    });

    it('should generate token with custom bytes', () => {
      const token = generateToken(16);
      expect(token).toHaveLength(32);
    });

    it('should generate unique tokens', () => {
      const token1 = generateToken();
      const token2 = generateToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('hashToken', () => {
    it('should hash token consistently', () => {
      const token = 'test-token';
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different tokens', () => {
      const hash1 = hashToken('token1');
      const hash2 = hashToken('token2');
      expect(hash1).not.toBe(hash2);
    });

    it('should produce 64 character hex hash (SHA256)', () => {
      const hash = hashToken('test');
      expect(hash).toHaveLength(64);
      expect(/^[a-f0-9]+$/i.test(hash)).toBe(true);
    });
  });

  describe('safeCompare', () => {
    it('should return true for equal strings', () => {
      expect(safeCompare('abc', 'abc')).toBe(true);
    });

    it('should return false for different strings', () => {
      expect(safeCompare('abc', 'def')).toBe(false);
    });

    it('should return false for different length strings', () => {
      expect(safeCompare('abc', 'abcd')).toBe(false);
    });
  });

  describe('generateOrangeTicketId', () => {
    it('should generate ticket ID with ONG- prefix', () => {
      const ticketId = generateOrangeTicketId();
      expect(ticketId.startsWith('ONG-')).toBe(true);
    });

    it('should generate unique ticket IDs', () => {
      const id1 = generateOrangeTicketId();
      const id2 = generateOrangeTicketId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('parsePagination', () => {
    it('should use default values', () => {
      const result = parsePagination();
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.skip).toBe(0);
    });

    it('should parse string values', () => {
      const result = parsePagination('2', '10');
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.skip).toBe(10);
    });

    it('should enforce minimum page of 1', () => {
      const result = parsePagination('0', '10');
      expect(result.page).toBe(1);
    });

    it('should enforce maximum limit of 100', () => {
      const result = parsePagination('1', '200');
      expect(result.limit).toBe(100);
    });

    it('should calculate correct skip value', () => {
      const result = parsePagination('3', '25');
      expect(result.skip).toBe(50); // (3-1) * 25
    });
  });

  describe('buildPaginatedResponse', () => {
    it('should build correct pagination response', () => {
      const data = [{ id: 1 }, { id: 2 }];
      const result = buildPaginatedResponse(data, 100, 1, 20);

      expect(result.data).toEqual(data);
      expect(result.pagination.total).toBe(100);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
      expect(result.pagination.pages).toBe(5);
    });

    it('should calculate pages correctly', () => {
      const result = buildPaginatedResponse([], 45, 1, 10);
      expect(result.pagination.pages).toBe(5); // 45/10 = 4.5 -> 5
    });

    it('should handle zero total', () => {
      const result = buildPaginatedResponse([], 0, 1, 20);
      expect(result.pagination.pages).toBe(0);
    });
  });
});
