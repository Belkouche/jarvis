import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatBilingualResponse,
  getErrorMessage,
  getWelcomeMessage,
  appendComplaintPrompt,
} from '../../src/services/messageService.js';

describe('Message Service', () => {
  describe('formatBilingualResponse', () => {
    it('should combine French and Arabic with double newline', () => {
      const fr = 'Bonjour';
      const ar = 'مرحبا';
      const result = formatBilingualResponse(fr, ar);
      expect(result).toBe('Bonjour\n\nمرحبا');
    });

    it('should handle multi-line messages', () => {
      const fr = 'Ligne 1\nLigne 2';
      const ar = 'سطر 1\nسطر 2';
      const result = formatBilingualResponse(fr, ar);
      expect(result).toBe('Ligne 1\nLigne 2\n\nسطر 1\nسطر 2');
    });

    it('should handle empty strings', () => {
      const result = formatBilingualResponse('', '');
      expect(result).toBe('\n\n');
    });
  });

  describe('getErrorMessage', () => {
    it('should return correct message for INVALID_FORMAT', () => {
      const result = getErrorMessage('INVALID_FORMAT');
      expect(result.fr).toContain('Format invalide');
      expect(result.ar).toContain('صيغة غير صحيحة');
    });

    it('should return correct message for CONTRACT_NOT_FOUND', () => {
      const result = getErrorMessage('CONTRACT_NOT_FOUND');
      expect(result.fr).toContain('Contrat non trouvé');
      expect(result.ar).toContain('العقد غير موجود');
    });

    it('should return correct message for SPAM_DETECTED', () => {
      const result = getErrorMessage('SPAM_DETECTED');
      expect(result.fr).toContain('Message invalide');
      expect(result.ar).toContain('رسالة غير صحيحة');
    });

    it('should return correct message for SERVICE_UNAVAILABLE', () => {
      const result = getErrorMessage('SERVICE_UNAVAILABLE');
      expect(result.fr).toContain('Serveur indisponible');
      expect(result.ar).toContain('الخادم غير متاح');
    });

    it('should return SYSTEM_ERROR for unknown error codes', () => {
      const result = getErrorMessage('UNKNOWN_ERROR' as any);
      expect(result.fr).toContain('Erreur système');
    });
  });

  describe('getWelcomeMessage', () => {
    it('should return welcome message in both languages', () => {
      const result = getWelcomeMessage();
      expect(result.fr).toContain('Bienvenue');
      expect(result.fr).toContain('JARVIS');
      expect(result.ar).toContain('مرحباً');
      expect(result.ar).toContain('جارفيس');
    });

    it('should include contract format example', () => {
      const result = getWelcomeMessage();
      expect(result.fr).toContain('F0823846D');
      expect(result.ar).toContain('F0823846D');
    });
  });

  describe('appendComplaintPrompt', () => {
    it('should append complaint prompt when allowed', () => {
      const response = { fr: 'Status message', ar: 'رسالة الحالة' };
      const result = appendComplaintPrompt(response, true);

      expect(result.fr).toContain('Status message');
      expect(result.fr).toContain('réclamation');
      expect(result.ar).toContain('رسالة الحالة');
      expect(result.ar).toContain('شكوى');
    });

    it('should not append complaint prompt when not allowed', () => {
      const response = { fr: 'Status message', ar: 'رسالة الحالة' };
      const result = appendComplaintPrompt(response, false);

      expect(result.fr).toBe('Status message');
      expect(result.ar).toBe('رسالة الحالة');
    });
  });
});
