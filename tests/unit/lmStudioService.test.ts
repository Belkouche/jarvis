import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractContractWithRegex } from '../../src/services/lmStudioService.js';

describe('LM Studio Service', () => {
  describe('extractContractWithRegex', () => {
    describe('Contract Number Extraction', () => {
      it('should extract valid contract number', () => {
        const result = extractContractWithRegex('F0823846D');
        expect(result.contract_number).toBe('F0823846D');
        expect(result.is_valid_format).toBe(true);
      });

      it('should extract contract number with spaces', () => {
        const result = extractContractWithRegex('F 0823846 D');
        expect(result.contract_number).toBe('F0823846D');
        expect(result.is_valid_format).toBe(true);
      });

      it('should extract lowercase contract number and uppercase it', () => {
        const result = extractContractWithRegex('f0823846d');
        expect(result.contract_number).toBe('F0823846D');
        expect(result.is_valid_format).toBe(true);
      });

      it('should extract contract from longer message', () => {
        const result = extractContractWithRegex('Bonjour, voici mon contrat F0823846D merci');
        expect(result.contract_number).toBe('F0823846D');
        expect(result.is_valid_format).toBe(true);
      });

      it('should return null for invalid contract format', () => {
        const result = extractContractWithRegex('F082384D'); // Only 6 digits
        expect(result.contract_number).toBeNull();
        expect(result.is_valid_format).toBe(false);
      });

      it('should return null for missing F prefix', () => {
        const result = extractContractWithRegex('0823846D');
        expect(result.contract_number).toBeNull();
      });

      it('should return null for missing D suffix', () => {
        const result = extractContractWithRegex('F0823846');
        expect(result.contract_number).toBeNull();
      });

      it('should return null for no contract number', () => {
        const result = extractContractWithRegex('Hello world');
        expect(result.contract_number).toBeNull();
      });
    });

    describe('Language Detection', () => {
      it('should detect French language', () => {
        const result = extractContractWithRegex('Bonjour, où est mon contrat?');
        expect(result.language).toBe('fr');
      });

      it('should detect Arabic language', () => {
        const result = extractContractWithRegex('مرحبا، أين عقدي؟');
        expect(result.language).toBe('ar');
      });

      it('should detect English by default for ASCII without French chars', () => {
        const result = extractContractWithRegex('Hello where is my contract');
        expect(result.language).toBe('en');
      });

      it('should detect French with accented characters', () => {
        const result = extractContractWithRegex('Vérifiez mon contrat svp');
        expect(result.language).toBe('fr');
      });
    });

    describe('Intent Classification', () => {
      it('should classify as status_check when contract number present', () => {
        const result = extractContractWithRegex('F0823846D');
        expect(result.intent).toBe('status_check');
      });

      it('should classify as complaint with complaint keywords', () => {
        const result = extractContractWithRegex("J'ai un problème avec mon contrat F0823846D");
        expect(result.intent).toBe('complaint');
      });

      it('should classify as complaint with French complaint word', () => {
        const result = extractContractWithRegex('Plainte: retard installation');
        expect(result.intent).toBe('complaint');
      });

      it('should classify as complaint with Arabic complaint word', () => {
        const result = extractContractWithRegex('مشكل في العقد');
        expect(result.intent).toBe('complaint');
      });

      it('should classify as other for generic messages', () => {
        const result = extractContractWithRegex('Bonjour');
        expect(result.intent).toBe('other');
      });
    });

    describe('Spam Detection', () => {
      it('should detect spam for very short messages', () => {
        const result = extractContractWithRegex('ab');
        expect(result.is_spam).toBe(true);
      });

      it('should detect spam for very long messages', () => {
        const longMessage = 'a '.repeat(300);
        const result = extractContractWithRegex(longMessage);
        expect(result.is_spam).toBe(true);
      });

      it('should detect spam for special characters only', () => {
        const result = extractContractWithRegex('!@#$%^&*()');
        expect(result.is_spam).toBe(true);
      });

      it('should not flag valid message as spam', () => {
        const result = extractContractWithRegex('Bonjour, voici mon contrat F0823846D');
        expect(result.is_spam).toBe(false);
      });
    });

    describe('Confidence Level', () => {
      it('should return 0.6 confidence for regex fallback', () => {
        const result = extractContractWithRegex('F0823846D');
        expect(result.confidence).toBe(0.6);
      });
    });
  });
});
