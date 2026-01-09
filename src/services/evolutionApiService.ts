import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import { logger, log } from '../config/logger.js';
import { retry } from '../utils/helpers.js';
import { AppError } from '../middleware/errorHandler.js';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://evo.aslan.ma';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_WEBHOOK_SECRET = process.env.EVOLUTION_WEBHOOK_SECRET;

// SECURITY: Validate Evolution API configuration
if (!EVOLUTION_API_KEY) {
  console.warn('WARNING: EVOLUTION_API_KEY not configured - WhatsApp messaging will fail');
}

// Evolution API response types
interface EvolutionSendResponse {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  message: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
    };
  };
  messageTimestamp: number;
  status: string;
}

interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data: {
    key: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
    };
    pushName?: string;
    message: {
      conversation?: string;
      extendedTextMessage?: {
        text: string;
      };
    };
    messageTimestamp: number;
  };
}

/**
 * Verify webhook signature from Evolution API
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  // SECURITY: Fail-closed - reject webhooks if secret not configured
  if (!EVOLUTION_WEBHOOK_SECRET) {
    logger.error('SECURITY: Webhook secret not configured - rejecting request');
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', EVOLUTION_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  // Use timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Parse incoming webhook message
 */
export function parseWebhookMessage(payload: EvolutionWebhookPayload): {
  phone: string;
  message: string;
  messageId: string;
  timestamp: string;
  senderName?: string;
} | null {
  // Only process incoming messages
  if (payload.event !== 'messages.upsert' || payload.data.key.fromMe) {
    return null;
  }

  const { data } = payload;

  // Extract message text
  const messageText =
    data.message.conversation ||
    data.message.extendedTextMessage?.text ||
    '';

  if (!messageText) {
    return null;
  }

  // Extract phone number (remove @s.whatsapp.net suffix)
  const phone = data.key.remoteJid.replace('@s.whatsapp.net', '');

  return {
    phone: normalizePhone(phone),
    message: messageText.trim(),
    messageId: data.key.id,
    timestamp: new Date(data.messageTimestamp * 1000).toISOString(),
    senderName: data.pushName,
  };
}

/**
 * Normalize phone number to international format
 */
function normalizePhone(phone: string): string {
  // Remove any non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, '');

  // Add + if not present and starts with country code
  if (!cleaned.startsWith('+') && cleaned.length > 10) {
    cleaned = `+${cleaned}`;
  }

  // Handle Moroccan numbers
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = `+212${cleaned.substring(1)}`;
  }

  return cleaned;
}

/**
 * Send WhatsApp message via Evolution API
 */
export async function sendMessage(
  phone: string,
  message: string
): Promise<{ messageId: string; success: boolean }> {
  const normalizedPhone = normalizePhone(phone);

  // Format phone for WhatsApp JID
  const jid = `${normalizedPhone.replace('+', '')}@s.whatsapp.net`;

  try {
    const response = await retry(
      async () => {
        const result = await axios.post<EvolutionSendResponse>(
          `${EVOLUTION_API_URL}/message/sendText/jarvis`,
          {
            number: jid,
            text: message,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              apikey: EVOLUTION_API_KEY,
            },
            timeout: 30000,
          }
        );
        return result;
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        backoff: 'exponential',
      }
    );

    logger.info('Message sent via Evolution API', {
      phone: normalizedPhone,
      messageId: response.data.key.id,
    });

    return {
      messageId: response.data.key.id,
      success: true,
    };
  } catch (error) {
    const axiosError = error as AxiosError;

    logger.error('Failed to send message via Evolution API', {
      phone: normalizedPhone,
      error: axiosError.message,
      status: axiosError.response?.status,
    });

    throw new AppError(
      'WhatsApp delivery failed',
      500,
      'EVOLUTION_API_ERROR'
    );
  }
}

/**
 * Send bilingual message (FR + AR)
 */
export async function sendBilingualMessage(
  phone: string,
  frMessage: string,
  arMessage: string
): Promise<{ messageId: string; success: boolean }> {
  // Combine French and Arabic with separator
  const combinedMessage = `${frMessage}\n\n${arMessage}`;
  return sendMessage(phone, combinedMessage);
}

/**
 * Check Evolution API connection status
 */
export async function checkConnectionStatus(): Promise<{
  connected: boolean;
  instance: string;
  state: string;
}> {
  try {
    const response = await axios.get(
      `${EVOLUTION_API_URL}/instance/connectionState/jarvis`,
      {
        headers: {
          apikey: EVOLUTION_API_KEY,
        },
        timeout: 10000,
      }
    );

    return {
      connected: response.data.state === 'open',
      instance: 'jarvis',
      state: response.data.state,
    };
  } catch (error) {
    logger.error('Failed to check Evolution API status', {
      error: (error as Error).message,
    });

    return {
      connected: false,
      instance: 'jarvis',
      state: 'error',
    };
  }
}

/**
 * Get instance info
 */
export async function getInstanceInfo(): Promise<{
  instanceName: string;
  owner: string;
  profileName: string;
  profilePicUrl: string;
} | null> {
  try {
    const response = await axios.get(
      `${EVOLUTION_API_URL}/instance/fetchInstances`,
      {
        headers: {
          apikey: EVOLUTION_API_KEY,
        },
        timeout: 10000,
      }
    );

    const instance = response.data.find(
      (inst: { name: string }) => inst.name === 'jarvis'
    );

    if (!instance) return null;

    return {
      instanceName: instance.name,
      owner: instance.owner,
      profileName: instance.profileName || '',
      profilePicUrl: instance.profilePicUrl || '',
    };
  } catch (error) {
    logger.error('Failed to get instance info', {
      error: (error as Error).message,
    });
    return null;
  }
}

/**
 * Mark message as read
 */
export async function markAsRead(
  phone: string,
  messageId: string
): Promise<void> {
  try {
    const jid = `${normalizePhone(phone).replace('+', '')}@s.whatsapp.net`;

    await axios.post(
      `${EVOLUTION_API_URL}/chat/markMessageAsRead/jarvis`,
      {
        readMessages: [
          {
            remoteJid: jid,
            id: messageId,
          },
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          apikey: EVOLUTION_API_KEY,
        },
        timeout: 10000,
      }
    );
  } catch (error) {
    // Non-critical error, just log it
    logger.warn('Failed to mark message as read', {
      phone,
      messageId,
      error: (error as Error).message,
    });
  }
}

export default {
  verifyWebhookSignature,
  parseWebhookMessage,
  sendMessage,
  sendBilingualMessage,
  checkConnectionStatus,
  getInstanceInfo,
  markAsRead,
};
