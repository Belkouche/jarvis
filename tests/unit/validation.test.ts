import { describe, it, expect } from 'vitest';
import {
  isValidContractFormat,
  extractContractNumber,
  isValidPhoneNumber,
  normalizePhoneNumber,
} from '../../src/middleware/validation.js';

describe('Validation Utilities', () => {
  describe('isValidContractFormat', () => {
    it('should return true for valid contract format', () => {
      expect(isValidContractFormat('F0823846D')).toBe(true);
    });

    it('should return true for lowercase valid format', () => {
      expect(isValidContractFormat('f0823846d')).toBe(true);
    });

    it('should return false for missing F prefix', () => {
      expect(isValidContractFormat('0823846D')).toBe(false);
    });

    it('should return false for missing D suffix', () => {
      expect(isValidContractFormat('F0823846')).toBe(false);
    });

    it('should return false for wrong number of digits', () => {
      expect(isValidContractFormat('F082384D')).toBe(false);
      expect(isValidContractFormat('F08238467D')).toBe(false);
    });

    it('should return false for letters in digit portion', () => {
      expect(isValidContractFormat('F08238A6D')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidContractFormat('')).toBe(false);
    });
  });

  describe('extractContractNumber', () => {
    it('should extract contract number from clean input', () => {
      expect(extractContractNumber('F0823846D')).toBe('F0823846D');
    });

    it('should extract contract number with spaces', () => {
      expect(extractContractNumber('F 0823846 D')).toBe('F0823846D');
    });

    it('should extract from message with text', () => {
      expect(extractContractNumber('Mon contrat est F0823846D merci')).toBe('F0823846D');
    });

    it('should extract lowercase and uppercase', () => {
      expect(extractContractNumber('f0823846d')).toBe('F0823846D');
    });

    it('should return null for invalid format', () => {
      expect(extractContractNumber('Hello world')).toBeNull();
    });

    it('should return null for partial contract', () => {
      expect(extractContractNumber('F082384D')).toBeNull();
    });
  });

  describe('isValidPhoneNumber', () => {
    it('should validate Moroccan mobile with +212', () => {
      expect(isValidPhoneNumber('+212612345678')).toBe(true);
    });

    it('should validate Moroccan mobile with 0', () => {
      expect(isValidPhoneNumber('0612345678')).toBe(true);
    });

    it('should validate with spaces', () => {
      expect(isValidPhoneNumber('+212 612 345 678')).toBe(true);
    });

    it('should reject too short number', () => {
      expect(isValidPhoneNumber('06123456')).toBe(false);
    });

    it('should reject invalid prefix', () => {
      expect(isValidPhoneNumber('0112345678')).toBe(false);
    });
  });

  describe('normalizePhoneNumber', () => {
    it('should convert 0 prefix to +212', () => {
      expect(normalizePhoneNumber('0612345678')).toBe('+212612345678');
    });

    it('should keep +212 prefix', () => {
      expect(normalizePhoneNumber('+212612345678')).toBe('+212612345678');
    });

    it('should add + to numbers starting with country code', () => {
      expect(normalizePhoneNumber('212612345678')).toBe('+212612345678');
    });

    it('should remove spaces', () => {
      expect(normalizePhoneNumber('+212 612 345 678')).toBe('+212612345678');
    });
  });
});
