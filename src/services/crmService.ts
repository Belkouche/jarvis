import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { logger, log } from '../config/logger.js';
import { cache } from '../config/redis.js';
import { withTimeout, retry } from '../utils/helpers.js';
import { AppError } from '../middleware/errorHandler.js';
import type { CRMStatus } from '../types/index.js';

const D2D_PORTAL_URL = process.env.D2D_PORTAL_URL || 'https://d2d.orange.ma';
const D2D_USERNAME = process.env.D2D_USERNAME || '';
const D2D_PASSWORD = process.env.D2D_PASSWORD || '';
const CRM_TIMEOUT = 50000; // 50 seconds as per PRD
const CACHE_TTL = parseInt(process.env.CACHE_TTL_CRM || '300', 10); // 5 minutes

// Browser singleton for reuse
let browser: Browser | null = null;
let browserContext: BrowserContext | null = null;

/**
 * Get or create browser instance
 */
async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ],
    });
    logger.info('Browser instance created');
  }
  return browser;
}

/**
 * Get or create browser context with authentication
 */
async function getAuthenticatedContext(): Promise<BrowserContext> {
  if (browserContext) {
    return browserContext;
  }

  const browserInstance = await getBrowser();
  browserContext = await browserInstance.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'fr-FR',
  });

  // Perform login
  await performLogin(browserContext);

  return browserContext;
}

/**
 * Perform login to D2D Portal
 */
async function performLogin(context: BrowserContext): Promise<void> {
  const page = await context.newPage();

  try {
    logger.info('Logging into D2D Portal...');

    await page.goto(`${D2D_PORTAL_URL}/login`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Fill login form
    await page.fill('input[name="username"], input[type="email"], #username', D2D_USERNAME);
    await page.fill('input[name="password"], input[type="password"], #password', D2D_PASSWORD);

    // Click login button
    await page.click('button[type="submit"], input[type="submit"], .login-button');

    // Wait for navigation to complete
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });

    // Verify login success
    const url = page.url();
    if (url.includes('login') || url.includes('error')) {
      throw new Error('Login failed - still on login page');
    }

    logger.info('Successfully logged into D2D Portal');
  } catch (error) {
    logger.error('D2D Portal login failed', { error: (error as Error).message });
    throw new AppError('CRM authentication failed', 503, 'CRM_AUTH_FAILED');
  } finally {
    await page.close();
  }
}

/**
 * Look up contract status in D2D Portal
 */
async function lookupContractInPortal(contractNumber: string): Promise<CRMStatus> {
  const context = await getAuthenticatedContext();
  const page = await context.newPage();

  try {
    log.crm.lookup(contractNumber);

    // Navigate to contract search page
    await page.goto(`${D2D_PORTAL_URL}/contracts/search`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Fill search form with contract number
    await page.fill(
      'input[name="contract"], input[name="contractNumber"], #contractSearch, input[placeholder*="contrat"]',
      contractNumber
    );

    // Submit search
    await page.click('button[type="submit"], .search-button, button:has-text("Rechercher")');

    // Wait for results
    await page.waitForSelector('.contract-result, .result-row, table tbody tr, .contract-details', {
      timeout: 20000,
    });

    // Extract contract data
    const status = await extractContractData(page, contractNumber);

    if (!status) {
      log.crm.notFound(contractNumber);
      throw new AppError('Contract not found', 404, 'CONTRACT_NOT_FOUND');
    }

    return status;
  } catch (error) {
    if (error instanceof AppError) throw error;

    log.crm.error(contractNumber, (error as Error).message);

    // Check if it's a navigation/timeout error
    if ((error as Error).message.includes('timeout')) {
      throw new AppError('CRM lookup timeout', 504, 'CRM_TIMEOUT');
    }

    throw new AppError('CRM lookup failed', 503, 'CRM_ERROR');
  } finally {
    await page.close();
  }
}

/**
 * Extract contract data from page
 */
async function extractContractData(page: Page, contractNumber: string): Promise<CRMStatus | null> {
  try {
    // Try multiple selectors for different portal layouts
    const data = await page.evaluate((contract) => {
      // Helper to get text content safely
      const getText = (selector: string): string | null => {
        const el = document.querySelector(selector);
        return el?.textContent?.trim() || null;
      };

      // Helper to find row by label
      const getValueByLabel = (label: string): string | null => {
        const rows = document.querySelectorAll('tr, .row, .field-group');
        for (const row of rows) {
          if (row.textContent?.toLowerCase().includes(label.toLowerCase())) {
            const valueEl = row.querySelector('td:last-child, .value, span:last-child');
            return valueEl?.textContent?.trim() || null;
          }
        }
        return null;
      };

      // Extract état (status)
      const etat =
        getText('.contract-status, .etat, [data-field="etat"]') ||
        getValueByLabel('état') ||
        getValueByLabel('status') ||
        'Inconnu';

      // Extract sous-état (sub-status)
      const sousEtat =
        getText('.sub-status, .sous-etat, [data-field="sous_etat"]') ||
        getValueByLabel('sous-état') ||
        getValueByLabel('sous état') ||
        null;

      // Extract sous-état 2
      const sousEtat2 =
        getText('.sub-status-2, .sous-etat-2, [data-field="sous_etat_2"]') ||
        getValueByLabel('sous-état 2') ||
        null;

      // Extract date created
      const dateCreated =
        getText('.date-created, .creation-date, [data-field="date_created"]') ||
        getValueByLabel('date création') ||
        getValueByLabel('date de création') ||
        null;

      // Extract seller info
      const sellerName =
        getText('.seller-name, .vendeur, [data-field="seller_name"]') ||
        getValueByLabel('vendeur') ||
        null;

      const sellerPhone =
        getText('.seller-phone, [data-field="seller_phone"]') ||
        getValueByLabel('téléphone vendeur') ||
        null;

      return {
        contract_id: contract,
        etat,
        sous_etat: sousEtat,
        sous_etat_2: sousEtat2,
        date_created: dateCreated,
        seller_info: sellerName
          ? {
              name: sellerName,
              phone: sellerPhone || '',
            }
          : undefined,
      };
    }, contractNumber);

    if (!data || data.etat === 'Inconnu') {
      return null;
    }

    return {
      contract_id: data.contract_id,
      etat: data.etat,
      sous_etat: data.sous_etat,
      sous_etat_2: data.sous_etat_2,
      date_created: data.date_created,
      seller_info: data.seller_info,
    };
  } catch (error) {
    logger.error('Failed to extract contract data', { error: (error as Error).message });
    return null;
  }
}

/**
 * Get contract status with caching
 */
export async function getContractStatus(
  contractNumber: string,
  forceRefresh: boolean = false
): Promise<{
  status: CRMStatus;
  fromCache: boolean;
  latencyMs: number;
}> {
  const startTime = Date.now();
  const cacheKey = cache.getCrmCacheKey(contractNumber);

  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = await cache.get<CRMStatus>(cacheKey);
    if (cached) {
      log.crm.cacheHit(contractNumber);
      return {
        status: cached,
        fromCache: true,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  // Look up in portal with timeout and retry
  const status = await withTimeout(
    retry(() => lookupContractInPortal(contractNumber), {
      maxRetries: 2,
      baseDelay: 2000,
      backoff: 'exponential',
    }),
    CRM_TIMEOUT
  );

  const latencyMs = Date.now() - startTime;
  log.crm.found(contractNumber, latencyMs);

  // Cache the result
  await cache.set(cacheKey, status, CACHE_TTL);

  return {
    status,
    fromCache: false,
    latencyMs,
  };
}

/**
 * Invalidate cache for a contract
 */
export async function invalidateContractCache(contractNumber: string): Promise<void> {
  const cacheKey = cache.getCrmCacheKey(contractNumber);
  await cache.del(cacheKey);
  logger.debug('Contract cache invalidated', { contractNumber });
}

/**
 * Close browser and cleanup
 */
export async function closeBrowser(): Promise<void> {
  if (browserContext) {
    await browserContext.close();
    browserContext = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
  logger.info('Browser closed');
}

/**
 * Health check for CRM service
 */
export async function checkCRMHealth(): Promise<boolean> {
  try {
    const browserInstance = await getBrowser();
    return browserInstance.isConnected();
  } catch {
    return false;
  }
}

/**
 * Re-authenticate if session expired
 */
export async function reauthenticate(): Promise<void> {
  if (browserContext) {
    await browserContext.close();
    browserContext = null;
  }
  await getAuthenticatedContext();
}

export default {
  getContractStatus,
  invalidateContractCache,
  closeBrowser,
  checkCRMHealth,
  reauthenticate,
};
