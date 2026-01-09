import { Resend } from 'resend';
import { logger } from '../config/logger.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@tktm.ma';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3001';

// SECURITY: Warn if Resend API key is not configured
if (!RESEND_API_KEY) {
  console.warn('WARNING: RESEND_API_KEY not configured - email functionality will fail');
}

// Initialize Resend client (with empty string fallback to prevent crash, but will fail on use)
const resend = new Resend(RESEND_API_KEY || '');

/**
 * Generate HTML template for magic link email
 */
function getMagicLinkTemplate(magicLink: string, expiresAt: Date): string {
  const expiryTime = expiresAt.toLocaleString('fr-FR', {
    timeZone: 'Africa/Casablanca',
    dateStyle: 'long',
    timeStyle: 'short',
  });

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Accès JARVIS Admin</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background-color: #ff6600; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">JARVIS</h1>
              <p style="margin: 8px 0 0; color: #ffffff; font-size: 14px; opacity: 0.9;">TKTM Orange Contractor Support</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px; font-weight: 600;">Connexion à votre tableau de bord</h2>
              <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.5;">
                Cliquez sur le bouton ci-dessous pour accéder à votre tableau de bord JARVIS. Ce lien est valide jusqu'au <strong>${expiryTime}</strong>.
              </p>

              <!-- Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 16px 0;">
                    <a href="${magicLink}" style="display: inline-block; padding: 14px 32px; background-color: #ff6600; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 6px;">
                      Accéder au tableau de bord
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 0; color: #71717a; font-size: 14px; line-height: 1.5;">
                Si vous n'avez pas demandé cet accès, vous pouvez ignorer cet email en toute sécurité.
              </p>

              <!-- Link fallback -->
              <div style="margin-top: 24px; padding: 16px; background-color: #f4f4f5; border-radius: 6px;">
                <p style="margin: 0 0 8px; color: #52525b; font-size: 12px;">Si le bouton ne fonctionne pas, copiez ce lien :</p>
                <p style="margin: 0; color: #3b82f6; font-size: 12px; word-break: break-all;">
                  <a href="${magicLink}" style="color: #3b82f6;">${magicLink}</a>
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; color: #71717a; font-size: 12px; text-align: center;">
                © ${new Date().getFullYear()} TKTM - Tous droits réservés<br>
                <span style="color: #a1a1aa;">Partenaire Orange Maroc</span>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Send magic link email via Resend
 */
export async function sendMagicLinkEmail(
  email: string,
  token: string,
  expiresAt: Date
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const magicLink = `${DASHBOARD_URL}/auth/verify?token=${token}`;

  try {
    const response = await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: email,
      subject: 'Votre accès JARVIS Admin',
      html: getMagicLinkTemplate(magicLink, expiresAt),
      headers: {
        'X-Entity-Ref-ID': token.substring(0, 8),
      },
    });

    if (response.error) {
      logger.error('Resend API error', {
        email,
        error: response.error.message,
      });
      return {
        success: false,
        error: response.error.message,
      };
    }

    logger.info('Magic link email sent', {
      email,
      messageId: response.data?.id,
    });

    return {
      success: true,
      messageId: response.data?.id,
    };
  } catch (error) {
    logger.error('Failed to send magic link email', {
      email,
      error: (error as Error).message,
    });
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Send notification email to admin
 */
export async function sendAdminNotification(
  subject: string,
  content: string
): Promise<boolean> {
  const adminEmail = process.env.RESEND_ADMIN_EMAIL || 'admin@tktm.ma';

  try {
    const response = await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: adminEmail,
      subject: `[JARVIS] ${subject}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2 style="color: #ff6600;">JARVIS Notification</h2>
          <p>${content}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #888; font-size: 12px;">
            This is an automated notification from JARVIS Admin System.
          </p>
        </div>
      `,
    });

    return !response.error;
  } catch {
    return false;
  }
}

/**
 * Check Resend service health
 */
export async function checkResendHealth(): Promise<boolean> {
  try {
    // Resend doesn't have a health endpoint, so we just check if API key is configured
    return !!RESEND_API_KEY && RESEND_API_KEY.length > 0;
  } catch {
    return false;
  }
}

export default {
  sendMagicLinkEmail,
  sendAdminNotification,
  checkResendHealth,
};
