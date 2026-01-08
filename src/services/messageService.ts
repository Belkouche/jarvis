import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import type { CRMStatus, MessageTemplate } from '../types/index.js';

// Default templates as fallback if database is empty
const DEFAULT_TEMPLATES: Omit<MessageTemplate, 'id'>[] = [
  {
    etat: 'En cours',
    sous_etat: 'Dossier incomplet',
    sous_etat_2: null,
    fr: 'Merci de ressaisir en complétant votre contrat',
    ar: 'يرجى إعادة تقديم المستندات',
    allow_complaint: false,
  },
  {
    etat: 'Fermé',
    sous_etat: null,
    sous_etat_2: null,
    fr: 'Votre contrat a été installé ✅',
    ar: 'تم تثبيت عقدك ✅',
    allow_complaint: false,
  },
  {
    etat: 'En cours',
    sous_etat: 'Activation lancée',
    sous_etat_2: null,
    fr: 'Votre contrat est toujours dans les délais, merci de patienter',
    ar: 'عقدك لا يزال ضمن المواعيد النهائية',
    allow_complaint: true,
  },
  {
    etat: 'En cours',
    sous_etat: 'BO fixe',
    sous_etat_2: null,
    fr: 'Votre contrat est toujours dans les délais, merci de patienter',
    ar: 'عقدك لا يزال ضمن المواعيد النهائية',
    allow_complaint: true,
  },
  {
    etat: 'En cours',
    sous_etat: 'BO prestataire',
    sous_etat_2: null,
    fr: 'Merci de vérifier que votre contrat a été envoyé à la validation',
    ar: 'يرجى التحقق من إرسال العقد',
    allow_complaint: true,
  },
  {
    etat: 'Refusé',
    sous_etat: 'Refusé par BO',
    sous_etat_2: null,
    fr: 'Contrat refusé, resaisi',
    ar: 'العقد مرفوض',
    allow_complaint: false,
  },
  {
    etat: 'Annulé',
    sous_etat: null,
    sous_etat_2: null,
    fr: 'Votre contrat a été annulé',
    ar: 'تم إلغاء عقدك',
    allow_complaint: false,
  },
];

// Error message templates
const ERROR_MESSAGES = {
  INVALID_FORMAT: {
    fr: 'Format invalide. Exemple: F0823846D',
    ar: 'صيغة غير صحيحة. مثال: F0823846D',
  },
  CONTRACT_NOT_FOUND: {
    fr: 'Contrat non trouvé. Vérifiez le numéro',
    ar: 'العقد غير موجود. يرجى التحقق من الرقم',
  },
  SPAM_DETECTED: {
    fr: 'Message invalide. Envoyez numéro de contrat',
    ar: 'رسالة غير صحيحة. أرسل رقم العقد',
  },
  SERVICE_UNAVAILABLE: {
    fr: 'Serveur indisponible, réessayez dans 1 min',
    ar: 'الخادم غير متاح، حاول مرة أخرى بعد دقيقة',
  },
  UNSUPPORTED_LANGUAGE: {
    fr: 'Langue non supportée (FR/AR)',
    ar: 'اللغة غير مدعومة (FR/AR)',
  },
  SYSTEM_ERROR: {
    fr: 'Erreur système, veuillez réessayer',
    ar: 'خطأ في النظام، يرجى المحاولة مرة أخرى',
  },
};

// Welcome and help messages
const WELCOME_MESSAGE = {
  fr: `Bienvenue sur JARVIS 🤖
Envoyez votre numéro de contrat (ex: F0823846D) pour vérifier son statut.`,
  ar: `مرحباً بك في جارفيس 🤖
أرسل رقم عقدك (مثال: F0823846D) للتحقق من حالته.`,
};

const COMPLAINT_PROMPT = {
  fr: `Si vous souhaitez déposer une réclamation, répondez "RECLAMATION" suivi de votre message.`,
  ar: `إذا كنت ترغب في تقديم شكوى، أرسل "شكاية" متبوعة برسالتك.`,
};

/**
 * Find matching template from database
 */
async function findTemplate(
  etat: string,
  sousEtat: string | null,
  sousEtat2: string | null
): Promise<MessageTemplate | null> {
  try {
    // Try exact match first
    const template = await prisma.messageTemplate.findFirst({
      where: {
        etat: { equals: etat, mode: 'insensitive' },
        sousEtat: sousEtat ? { equals: sousEtat, mode: 'insensitive' } : null,
        sousEtat2: sousEtat2 ? { equals: sousEtat2, mode: 'insensitive' } : null,
        isActive: true,
      },
    });

    if (template) {
      return {
        id: template.id,
        etat: template.etat,
        sous_etat: template.sousEtat,
        sous_etat_2: template.sousEtat2,
        fr: template.messageFr,
        ar: template.messageAr,
        allow_complaint: template.allowComplaint,
      };
    }

    // Try match without sous_etat_2
    if (sousEtat2) {
      const partialTemplate = await prisma.messageTemplate.findFirst({
        where: {
          etat: { equals: etat, mode: 'insensitive' },
          sousEtat: sousEtat ? { equals: sousEtat, mode: 'insensitive' } : null,
          sousEtat2: null,
          isActive: true,
        },
      });

      if (partialTemplate) {
        return {
          id: partialTemplate.id,
          etat: partialTemplate.etat,
          sous_etat: partialTemplate.sousEtat,
          sous_etat_2: partialTemplate.sousEtat2,
          fr: partialTemplate.messageFr,
          ar: partialTemplate.messageAr,
          allow_complaint: partialTemplate.allowComplaint,
        };
      }
    }

    // Try match with just etat
    const etatOnlyTemplate = await prisma.messageTemplate.findFirst({
      where: {
        etat: { equals: etat, mode: 'insensitive' },
        sousEtat: null,
        sousEtat2: null,
        isActive: true,
      },
    });

    if (etatOnlyTemplate) {
      return {
        id: etatOnlyTemplate.id,
        etat: etatOnlyTemplate.etat,
        sous_etat: etatOnlyTemplate.sousEtat,
        sous_etat_2: etatOnlyTemplate.sousEtat2,
        fr: etatOnlyTemplate.messageFr,
        ar: etatOnlyTemplate.messageAr,
        allow_complaint: etatOnlyTemplate.allowComplaint,
      };
    }

    return null;
  } catch (error) {
    logger.error('Error finding template', { error: (error as Error).message });
    return null;
  }
}

/**
 * Find template from default list (fallback)
 */
function findDefaultTemplate(
  etat: string,
  sousEtat: string | null,
  sousEtat2: string | null
): Omit<MessageTemplate, 'id'> | null {
  // Try exact match
  let template = DEFAULT_TEMPLATES.find(
    (t) =>
      t.etat.toLowerCase() === etat.toLowerCase() &&
      (t.sous_etat?.toLowerCase() || null) === (sousEtat?.toLowerCase() || null) &&
      (t.sous_etat_2?.toLowerCase() || null) === (sousEtat2?.toLowerCase() || null)
  );

  if (template) return template;

  // Try without sous_etat_2
  if (sousEtat2) {
    template = DEFAULT_TEMPLATES.find(
      (t) =>
        t.etat.toLowerCase() === etat.toLowerCase() &&
        (t.sous_etat?.toLowerCase() || null) === (sousEtat?.toLowerCase() || null) &&
        t.sous_etat_2 === null
    );
    if (template) return template;
  }

  // Try with just etat
  template = DEFAULT_TEMPLATES.find(
    (t) =>
      t.etat.toLowerCase() === etat.toLowerCase() &&
      t.sous_etat === null &&
      t.sous_etat_2 === null
  );

  return template || null;
}

/**
 * Generate bilingual response from CRM status
 */
export async function generateStatusResponse(
  crmStatus: CRMStatus,
  contractNumber: string
): Promise<{
  fr: string;
  ar: string;
  allowComplaint: boolean;
}> {
  const { etat, sous_etat, sous_etat_2 } = crmStatus;

  // Try database template first
  let template = await findTemplate(etat, sous_etat, sous_etat_2);

  // Fall back to default templates
  if (!template) {
    const defaultTemplate = findDefaultTemplate(etat, sous_etat, sous_etat_2);
    if (defaultTemplate) {
      template = { ...defaultTemplate, id: 'default' };
    }
  }

  // Generate response
  if (template) {
    const fr = formatMessage(template.fr, contractNumber, crmStatus);
    const ar = formatMessage(template.ar, contractNumber, crmStatus);

    return {
      fr,
      ar,
      allowComplaint: template.allow_complaint,
    };
  }

  // Generic response if no template found
  logger.warn('No template found for status', { etat, sous_etat, sous_etat_2 });

  return {
    fr: `Contrat ${contractNumber}: ${etat}${sous_etat ? ` - ${sous_etat}` : ''}`,
    ar: `العقد ${contractNumber}: ${etat}${sous_etat ? ` - ${sous_etat}` : ''}`,
    allowComplaint: true,
  };
}

/**
 * Format message with placeholders
 */
function formatMessage(
  template: string,
  contractNumber: string,
  crmStatus: CRMStatus
): string {
  return template
    .replace(/{contract}/gi, contractNumber)
    .replace(/{etat}/gi, crmStatus.etat)
    .replace(/{sous_etat}/gi, crmStatus.sous_etat || '')
    .replace(/{date}/gi, crmStatus.date_created || '');
}

/**
 * Generate bilingual response combining FR and AR
 */
export function formatBilingualResponse(fr: string, ar: string): string {
  return `${fr}\n\n${ar}`;
}

/**
 * Get error message in both languages
 */
export function getErrorMessage(errorCode: keyof typeof ERROR_MESSAGES): {
  fr: string;
  ar: string;
} {
  return ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.SYSTEM_ERROR;
}

/**
 * Get welcome message
 */
export function getWelcomeMessage(): { fr: string; ar: string } {
  return WELCOME_MESSAGE;
}

/**
 * Get complaint prompt
 */
export function getComplaintPrompt(): { fr: string; ar: string } {
  return COMPLAINT_PROMPT;
}

/**
 * Add complaint prompt to response if allowed
 */
export function appendComplaintPrompt(
  response: { fr: string; ar: string },
  allowComplaint: boolean
): { fr: string; ar: string } {
  if (!allowComplaint) return response;

  return {
    fr: `${response.fr}\n\n${COMPLAINT_PROMPT.fr}`,
    ar: `${response.ar}\n\n${COMPLAINT_PROMPT.ar}`,
  };
}

export default {
  generateStatusResponse,
  formatBilingualResponse,
  getErrorMessage,
  getWelcomeMessage,
  getComplaintPrompt,
  appendComplaintPrompt,
};
