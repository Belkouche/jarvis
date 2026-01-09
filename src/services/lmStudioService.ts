import axios, { AxiosError } from 'axios';
import { z } from 'zod';
import { logger, log } from '../config/logger.js';
import { withTimeout } from '../utils/helpers.js';
import type { LMAnalysisResult, LanguageCode, MessageIntent } from '../types/index.js';

// SECURITY: Zod schema for validating LM Studio responses
const LMResponseSchema = z.object({
  language: z.string().optional(),
  intent: z.string().optional(),
  contract_number: z.string().nullable().optional(),
  is_valid_format: z.boolean().optional(),
  is_spam: z.boolean().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

type LMParsedResponse = z.infer<typeof LMResponseSchema>;

const LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://localhost:5000';
const LM_STUDIO_TIMEOUT = parseInt(process.env.LM_STUDIO_TIMEOUT || '10000', 10);

// Analysis prompt template for Gemma 3 12B
const ANALYSIS_PROMPT = `You are JARVIS, analyzing WhatsApp messages from TKTM Orange contractors in Morocco.

Analyze this message and return a JSON response with these fields:
- language: detected language code ('fr' for French, 'ar' for Arabic/Darija, 'dar' for Darija specifically, 'en' for English)
- intent: what the contractor wants ('status_check' for contract status, 'complaint' for filing a complaint, 'other' for anything else)
- contract_number: extracted contract number in format F0000000D (null if not found)
- is_valid_format: true if contract number matches F + 7 digits + D pattern
- is_spam: true if message is gibberish, spam, or clearly invalid
- confidence: your confidence level from 0 to 1

Contract format rules:
- Valid format: F followed by exactly 7 digits followed by D (e.g., F0823846D)
- Handle common typos: spaces between characters, lowercase letters
- Extract and normalize to uppercase

Message to analyze:
"{message}"

Respond ONLY with valid JSON, no explanations:`;

// LM Studio request format
interface LMStudioRequest {
  prompt: string;
  temperature: number;
  max_tokens: number;
  stop?: string[];
}

// LM Studio response format
interface LMStudioResponse {
  generated_text?: string;
  text?: string;
  response?: string;
  choices?: Array<{ text: string }>;
}

/**
 * Call LM Studio API with the analysis prompt
 */
async function callLMStudio(message: string): Promise<LMAnalysisResult> {
  const prompt = ANALYSIS_PROMPT.replace('{message}', message);

  const request: LMStudioRequest = {
    prompt,
    temperature: 0.3,
    max_tokens: 200,
    stop: ['\n\n', '```'],
  };

  log.lmStudio.request(message.substring(0, 50));

  const response = await axios.post<LMStudioResponse>(
    `${LM_STUDIO_URL}/api/generate`,
    request,
    {
      timeout: LM_STUDIO_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  // Extract text from various response formats
  const responseText =
    response.data.generated_text ||
    response.data.text ||
    response.data.response ||
    response.data.choices?.[0]?.text ||
    '';

  return parseAnalysisResponse(responseText);
}

/**
 * Parse JSON response from LM Studio with Zod validation
 */
function parseAnalysisResponse(responseText: string): LMAnalysisResult {
  // Try to extract JSON from the response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in LM Studio response');
  }

  let rawParsed: unknown;
  try {
    rawParsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error('Invalid JSON in LM Studio response');
  }

  // SECURITY: Validate response structure with Zod to prevent injection attacks
  const parseResult = LMResponseSchema.safeParse(rawParsed);
  if (!parseResult.success) {
    logger.warn('LM Studio response failed schema validation', {
      errors: parseResult.error.errors.map((e) => e.message),
    });
    throw new Error('LM Studio response failed schema validation');
  }

  const parsed: LMParsedResponse = parseResult.data;

  // Validate and normalize the response
  return {
    language: normalizeLanguage(parsed.language),
    intent: normalizeIntent(parsed.intent),
    contract_number: normalizeContractNumber(parsed.contract_number),
    is_valid_format: Boolean(parsed.is_valid_format),
    is_spam: Boolean(parsed.is_spam),
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
  };
}

/**
 * Normalize language code
 */
function normalizeLanguage(lang: unknown): LanguageCode {
  if (typeof lang !== 'string') return 'fr';
  const normalized = lang.toLowerCase().trim();
  if (['fr', 'french', 'français'].includes(normalized)) return 'fr';
  if (['ar', 'arabic', 'arabe', 'العربية'].includes(normalized)) return 'ar';
  if (['dar', 'darija', 'دارجة', 'marocain'].includes(normalized)) return 'dar';
  if (['en', 'english', 'anglais'].includes(normalized)) return 'en';
  return 'fr'; // Default to French
}

/**
 * Normalize intent
 */
function normalizeIntent(intent: unknown): MessageIntent {
  if (typeof intent !== 'string') return 'other';
  const normalized = intent.toLowerCase().trim();
  if (['status_check', 'status', 'check', 'vérification'].includes(normalized)) return 'status_check';
  if (['complaint', 'plainte', 'réclamation', 'problème'].includes(normalized)) return 'complaint';
  return 'other';
}

/**
 * Normalize contract number
 */
function normalizeContractNumber(contractNumber: unknown): string | null {
  if (!contractNumber || typeof contractNumber !== 'string') return null;
  // Remove spaces and convert to uppercase
  const normalized = contractNumber.replace(/\s/g, '').toUpperCase();
  // Validate format
  if (/^F\d{7}D$/.test(normalized)) {
    return normalized;
  }
  return null;
}

/**
 * Regex-based fallback for contract extraction
 */
export function extractContractWithRegex(message: string): Partial<LMAnalysisResult> {
  // Extract contract number
  const contractMatch = message.match(/F\s*\d{7}\s*D/i);
  const contractNumber = contractMatch
    ? contractMatch[0].replace(/\s/g, '').toUpperCase()
    : null;

  // Detect language (simple heuristic)
  const hasArabic = /[\u0600-\u06FF]/.test(message);
  const hasFrench = /[éèêëàâäùûüôöîïç]/i.test(message);

  let language: LanguageCode = 'fr';
  if (hasArabic) language = 'ar';
  else if (!hasFrench && /^[a-zA-Z0-9\s]+$/.test(message)) language = 'en';

  // Detect intent (simple heuristic)
  const complaintKeywords = [
    'problème', 'problem', 'plainte', 'complaint', 'مشكل', 'شكاية',
    'retard', 'delay', 'annul', 'cancel', 'bloqué', 'blocked'
  ];
  const isComplaint = complaintKeywords.some((kw) =>
    message.toLowerCase().includes(kw.toLowerCase())
  );

  // Detect spam
  const isSpam = message.length < 3 ||
    message.length > 500 ||
    /^[!@#$%^&*()]+$/.test(message) ||
    message.split(' ').length > 50;

  return {
    language,
    intent: isComplaint ? 'complaint' : contractNumber ? 'status_check' : 'other',
    contract_number: contractNumber,
    is_valid_format: contractNumber !== null,
    is_spam: isSpam,
    confidence: 0.6, // Lower confidence for regex fallback
  };
}

/**
 * Main analysis function with timeout and fallback
 */
export async function analyzeMessage(message: string): Promise<{
  result: LMAnalysisResult;
  usedFallback: boolean;
  latencyMs: number;
}> {
  const startTime = Date.now();
  let usedFallback = false;

  try {
    // Try LM Studio with timeout
    const result = await withTimeout(
      callLMStudio(message),
      LM_STUDIO_TIMEOUT,
      () => {
        log.lmStudio.timeout(message.substring(0, 50));
        usedFallback = true;
        return extractContractWithRegex(message) as LMAnalysisResult;
      }
    );

    const latencyMs = Date.now() - startTime;
    log.lmStudio.response(message.substring(0, 50), latencyMs);

    return { result, usedFallback, latencyMs };
  } catch (error) {
    usedFallback = true;
    const latencyMs = Date.now() - startTime;

    if (error instanceof AxiosError) {
      log.lmStudio.error(`API error: ${error.message}`);
    } else if (error instanceof SyntaxError) {
      log.lmStudio.error('JSON parse error in response');
    } else {
      log.lmStudio.error((error as Error).message);
    }

    // Use regex fallback
    const fallbackResult = extractContractWithRegex(message) as LMAnalysisResult;
    return { result: fallbackResult, usedFallback, latencyMs };
  }
}

/**
 * Health check for LM Studio
 */
export async function checkLMStudioHealth(): Promise<boolean> {
  try {
    const response = await axios.get(`${LM_STUDIO_URL}/health`, {
      timeout: 5000,
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

export default {
  analyzeMessage,
  extractContractWithRegex,
  checkLMStudioHealth,
};
