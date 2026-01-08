import { Request, Response } from 'express';
import { prisma } from '../config/database.js';
import { logger, log } from '../config/logger.js';
import { analyzeMessage, extractContractWithRegex } from '../services/lmStudioService.js';
import { getContractStatus } from '../services/crmService.js';
import {
  generateStatusResponse,
  formatBilingualResponse,
  getErrorMessage,
  getWelcomeMessage,
  appendComplaintPrompt,
} from '../services/messageService.js';
import {
  parseWebhookMessage,
  sendBilingualMessage,
  markAsRead,
} from '../services/evolutionApiService.js';
import { logMessageProcessed } from '../services/auditService.js';
import { AppError, errors } from '../middleware/errorHandler.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { isValidContractFormat } from '../middleware/validation.js';
import type { ApiResponse, ProcessedMessage, CRMStatus, LMAnalysisResult } from '../types/index.js';

interface WebhookBody {
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
 * Handle incoming WhatsApp webhook from Evolution API
 */
export const handleWebhook = asyncHandler(async (
  req: Request<object, ApiResponse, WebhookBody>,
  res: Response<ApiResponse>
) => {
  const startTime = Date.now();

  // Parse the webhook message
  const parsed = parseWebhookMessage(req.body);

  // If not a valid incoming message, acknowledge and return
  if (!parsed) {
    res.json({ success: true, message: 'Event acknowledged' });
    return;
  }

  const { phone, message, messageId, timestamp, senderName } = parsed;

  log.message.received(phone, messageId);

  // Mark message as read
  markAsRead(phone, messageId).catch(() => {
    // Non-critical, ignore errors
  });

  // Create initial message log entry
  const messageLog = await prisma.message.create({
    data: {
      phone,
      contractorName: senderName,
      incomingMessage: message,
      createdAt: new Date(timestamp),
    },
  });

  try {
    // Process the message
    const result = await processMessage(message, phone, messageLog.id);

    // Update message log with results
    await prisma.message.update({
      where: { id: messageLog.id },
      data: {
        languageDetected: result.language_detected,
        intent: result.intent,
        contractNumber: result.contract_number,
        isValidFormat: result.is_valid_format,
        isSpam: result.is_spam,
        lmStudioLatency: result.lm_studio_latency,
        crmLookupLatency: result.crm_lookup_latency,
        totalLatency: result.total_latency,
        crmStatus: result.crm_status as object,
        responseMessageFr: result.response_message_fr,
        responseMessageAr: result.response_message_ar,
        hasComplaint: result.has_complaint,
        complaintType: result.complaint_type,
        errorCode: result.error_code,
        errorMessage: result.error_message,
        lmStudioFallback: result.lm_studio_fallback,
      },
    });

    // Send response via WhatsApp
    await sendBilingualMessage(
      phone,
      result.response_message_fr,
      result.response_message_ar
    );

    const totalLatency = Date.now() - startTime;
    log.message.processed(phone, totalLatency, true);

    // Audit log
    await logMessageProcessed(messageLog.id, phone, true, {
      contractNumber: result.contract_number,
      latency: totalLatency,
    });

    res.json({
      success: true,
      data: {
        message_id: messageLog.id,
        status: 'processed',
        latency_ms: totalLatency,
      },
    });
  } catch (error) {
    const totalLatency = Date.now() - startTime;
    const appError = error instanceof AppError ? error : errors.serviceUnavailable();

    // Get error messages
    const errorMessages = getErrorMessage(
      appError.code as keyof ReturnType<typeof getErrorMessage>
    );

    // Update message log with error
    await prisma.message.update({
      where: { id: messageLog.id },
      data: {
        totalLatency,
        errorCode: appError.code,
        errorMessage: appError.message,
        responseMessageFr: errorMessages.fr,
        responseMessageAr: errorMessages.ar,
      },
    });

    // Send error response via WhatsApp
    await sendBilingualMessage(phone, errorMessages.fr, errorMessages.ar).catch(() => {
      // If we can't send the error message, log it
      logger.error('Failed to send error message to user', { phone });
    });

    log.message.error(phone, appError.message);

    // Audit log
    await logMessageProcessed(messageLog.id, phone, false, {
      error: appError.code,
      latency: totalLatency,
    });

    // Still return success to Evolution API to acknowledge receipt
    res.json({
      success: true,
      data: {
        message_id: messageLog.id,
        status: 'error',
        error: appError.code,
      },
    });
  }
});

/**
 * Process incoming message and generate response
 */
async function processMessage(
  message: string,
  phone: string,
  messageLogId: string
): Promise<Omit<ProcessedMessage, 'id' | 'phone' | 'contractor_name' | 'incoming_message'>> {
  const startTime = Date.now();

  // Step 1: Analyze message with LM Studio (with fallback)
  const { result: analysis, usedFallback, latencyMs: lmLatency } = await analyzeMessage(message);

  // Check for spam
  if (analysis.is_spam) {
    const errorMsg = getErrorMessage('SPAM_DETECTED');
    return {
      language_detected: analysis.language,
      intent: analysis.intent,
      contract_number: null,
      is_valid_format: false,
      is_spam: true,
      lm_studio_latency: lmLatency,
      crm_lookup_latency: null,
      total_latency: Date.now() - startTime,
      crm_status: null,
      response_message_fr: errorMsg.fr,
      response_message_ar: errorMsg.ar,
      has_complaint: false,
      complaint_type: null,
      error_code: 'SPAM_DETECTED',
      error_message: 'Spam message detected',
      lm_studio_fallback: usedFallback,
    };
  }

  // Check if it's a greeting/other intent without contract
  if (analysis.intent === 'other' && !analysis.contract_number) {
    const welcome = getWelcomeMessage();
    return {
      language_detected: analysis.language,
      intent: analysis.intent,
      contract_number: null,
      is_valid_format: false,
      is_spam: false,
      lm_studio_latency: lmLatency,
      crm_lookup_latency: null,
      total_latency: Date.now() - startTime,
      crm_status: null,
      response_message_fr: welcome.fr,
      response_message_ar: welcome.ar,
      has_complaint: false,
      complaint_type: null,
      error_code: null,
      error_message: null,
      lm_studio_fallback: usedFallback,
    };
  }

  // Check for valid contract format
  if (!analysis.contract_number || !analysis.is_valid_format) {
    const errorMsg = getErrorMessage('INVALID_FORMAT');
    return {
      language_detected: analysis.language,
      intent: analysis.intent,
      contract_number: analysis.contract_number,
      is_valid_format: false,
      is_spam: false,
      lm_studio_latency: lmLatency,
      crm_lookup_latency: null,
      total_latency: Date.now() - startTime,
      crm_status: null,
      response_message_fr: errorMsg.fr,
      response_message_ar: errorMsg.ar,
      has_complaint: false,
      complaint_type: null,
      error_code: 'INVALID_FORMAT',
      error_message: 'Invalid contract format',
      lm_studio_fallback: usedFallback,
    };
  }

  // Step 2: Look up contract in CRM
  let crmStatus: CRMStatus | null = null;
  let crmLatency: number | null = null;

  try {
    const crmResult = await getContractStatus(analysis.contract_number);
    crmStatus = crmResult.status;
    crmLatency = crmResult.latencyMs;
  } catch (error) {
    if (error instanceof AppError && error.code === 'CONTRACT_NOT_FOUND') {
      const errorMsg = getErrorMessage('CONTRACT_NOT_FOUND');
      return {
        language_detected: analysis.language,
        intent: analysis.intent,
        contract_number: analysis.contract_number,
        is_valid_format: true,
        is_spam: false,
        lm_studio_latency: lmLatency,
        crm_lookup_latency: null,
        total_latency: Date.now() - startTime,
        crm_status: null,
        response_message_fr: errorMsg.fr,
        response_message_ar: errorMsg.ar,
        has_complaint: false,
        complaint_type: null,
        error_code: 'CONTRACT_NOT_FOUND',
        error_message: 'Contract not found in CRM',
        lm_studio_fallback: usedFallback,
      };
    }
    throw error; // Re-throw other errors
  }

  // Step 3: Generate response from template
  const statusResponse = await generateStatusResponse(crmStatus, analysis.contract_number);

  // Append complaint prompt if allowed
  const finalResponse = appendComplaintPrompt(
    { fr: statusResponse.fr, ar: statusResponse.ar },
    statusResponse.allowComplaint
  );

  return {
    language_detected: analysis.language,
    intent: analysis.intent,
    contract_number: analysis.contract_number,
    is_valid_format: true,
    is_spam: false,
    lm_studio_latency: lmLatency,
    crm_lookup_latency: crmLatency,
    total_latency: Date.now() - startTime,
    crm_status: crmStatus,
    response_message_fr: finalResponse.fr,
    response_message_ar: finalResponse.ar,
    has_complaint: analysis.intent === 'complaint',
    complaint_type: null, // Will be set by complaint flow
    error_code: null,
    error_message: null,
    lm_studio_fallback: usedFallback,
  };
}

/**
 * Get message by ID (for dashboard)
 */
export const getMessageById = asyncHandler(async (
  req: Request<{ id: string }>,
  res: Response<ApiResponse>
) => {
  const { id } = req.params;

  const message = await prisma.message.findUnique({
    where: { id },
    include: {
      complaints: true,
    },
  });

  if (!message) {
    throw errors.notFound('Message');
  }

  res.json({
    success: true,
    data: message,
  });
});

/**
 * Get messages with pagination and filters
 */
export const getMessages = asyncHandler(async (
  req: Request,
  res: Response<ApiResponse>
) => {
  const {
    page = '1',
    limit = '20',
    dateFrom,
    dateTo,
    status,
    contract,
    phone,
    hasComplaint,
  } = req.query;

  const pageNum = Math.max(1, parseInt(page as string, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
  const skip = (pageNum - 1) * limitNum;

  // Build where clause
  const where: Record<string, unknown> = {};

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) {
      (where.createdAt as Record<string, Date>).gte = new Date(dateFrom as string);
    }
    if (dateTo) {
      (where.createdAt as Record<string, Date>).lte = new Date(dateTo as string);
    }
  }

  if (status === 'success') {
    where.errorCode = null;
  } else if (status === 'error') {
    where.errorCode = { not: null };
  }

  if (contract) {
    where.contractNumber = { contains: contract as string, mode: 'insensitive' };
  }

  if (phone) {
    where.phone = { contains: phone as string };
  }

  if (hasComplaint === 'true') {
    where.hasComplaint = true;
  }

  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limitNum,
      skip,
    }),
    prisma.message.count({ where }),
  ]);

  res.json({
    success: true,
    data: messages,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    },
  });
});

/**
 * Get message statistics
 */
export const getMessageStats = asyncHandler(async (
  req: Request,
  res: Response<ApiResponse>
) => {
  const { period = 'day' } = req.query;

  // Calculate date range
  const now = new Date();
  let dateFrom: Date;

  switch (period) {
    case 'week':
      dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      dateFrom = new Date(now.setHours(0, 0, 0, 0));
  }

  const [
    totalMessages,
    successMessages,
    errorMessages,
    complaintsCount,
    avgLatency,
    fallbackCount,
  ] = await Promise.all([
    prisma.message.count({
      where: { createdAt: { gte: dateFrom } },
    }),
    prisma.message.count({
      where: { createdAt: { gte: dateFrom }, errorCode: null },
    }),
    prisma.message.count({
      where: { createdAt: { gte: dateFrom }, errorCode: { not: null } },
    }),
    prisma.message.count({
      where: { createdAt: { gte: dateFrom }, hasComplaint: true },
    }),
    prisma.message.aggregate({
      where: { createdAt: { gte: dateFrom }, totalLatency: { not: null } },
      _avg: { totalLatency: true },
    }),
    prisma.message.count({
      where: { createdAt: { gte: dateFrom }, lmStudioFallback: true },
    }),
  ]);

  const successRate = totalMessages > 0
    ? ((successMessages / totalMessages) * 100).toFixed(2)
    : '0';

  const fallbackRate = totalMessages > 0
    ? ((fallbackCount / totalMessages) * 100).toFixed(2)
    : '0';

  res.json({
    success: true,
    data: {
      period,
      totalMessages,
      successMessages,
      errorMessages,
      successRate: `${successRate}%`,
      complaintsCount,
      avgLatencyMs: Math.round(avgLatency._avg.totalLatency || 0),
      fallbackCount,
      fallbackRate: `${fallbackRate}%`,
    },
  });
});

export default {
  handleWebhook,
  getMessageById,
  getMessages,
  getMessageStats,
};
