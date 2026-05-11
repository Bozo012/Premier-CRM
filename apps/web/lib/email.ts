/**
 * Transactional email via Resend.
 *
 * All functions are best-effort — they catch delivery errors internally and
 * return { sent: boolean } so callers can record the outcome without having
 * email failure block the primary operation (e.g. marking a quote as sent).
 *
 * Requires env vars:
 *   RESEND_API_KEY        — API key from resend.com/api-keys
 *   RESEND_FROM_EMAIL     — verified sender address, e.g. quotes@ppmnky.com
 *   NEXT_PUBLIC_APP_URL   — public app base URL, e.g. https://app.ppmnky.com
 */

import { Resend } from 'resend';

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY is not set — email delivery skipped.');
    return null;
  }
  return new Resend(apiKey);
}

function getFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL ?? 'quotes@ppmnky.com';
}

function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

// ---------------------------------------------------------------------------
// Quote delivery email
// ---------------------------------------------------------------------------

export interface SendQuoteEmailArgs {
  customerEmail: string;
  customerName: string;
  quoteTitle: string;
  quoteTotal: number | null;
  quoteUrl: string; // relative path, e.g. /q/{token}
  validUntil: string | null; // ISO date string (DATE column)
}

export async function sendQuoteEmail(
  args: SendQuoteEmailArgs
): Promise<{ sent: boolean }> {
  const resend = getResendClient();
  if (!resend) return { sent: false };

  const absoluteUrl = `${getAppUrl()}${args.quoteUrl}`;
  const formattedTotal = formatMoney(args.quoteTotal);
  const formattedExpiry = args.validUntil ? formatDate(args.validUntil) : null;

  const subject = `Your quote from Premier: ${args.quoteTitle}`;
  const html = buildQuoteEmailHtml({ ...args, absoluteUrl, formattedTotal, formattedExpiry });
  const text = buildQuoteEmailText({ ...args, absoluteUrl, formattedTotal, formattedExpiry });

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: args.customerEmail,
    subject,
    html,
    text,
  });

  if (error) {
    console.error('[email] Resend delivery failed:', error);
    return { sent: false };
  }

  return { sent: true };
}

// ---------------------------------------------------------------------------
// Email body builders — plain HTML with inline styles, no template engine
// ---------------------------------------------------------------------------

interface EmailBodyArgs {
  absoluteUrl: string;
  customerName: string;
  formattedExpiry: string | null;
  formattedTotal: string;
  quoteTitle: string;
}

function buildQuoteEmailHtml(args: EmailBodyArgs): string {
  const { absoluteUrl, customerName, formattedExpiry, formattedTotal, quoteTitle } = args;
  const expiryLine = formattedExpiry
    ? `<p style="color:#6b7280;font-size:14px;margin:8px 0 0;">This quote is valid until <strong>${formattedExpiry}</strong>.</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr>
      <td>
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
          <tr>
            <td style="background:#1e293b;padding:20px 28px;">
              <p style="margin:0;color:#f8fafc;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Premier Property Maintenance</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 16px;color:#111827;font-size:16px;">Hi ${escapeHtml(customerName)},</p>
              <p style="margin:0 0 8px;color:#111827;font-size:16px;">We've prepared a quote for your review.</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;color:#374151;font-size:15px;font-weight:600;">${escapeHtml(quoteTitle)}</p>
                    <p style="margin:6px 0 0;color:#6b7280;font-size:14px;">Total: <strong style="color:#111827;">${formattedTotal}</strong></p>
                    ${expiryLine}
                  </td>
                </tr>
              </table>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background:#2563eb;border-radius:6px;">
                    <a href="${absoluteUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">Review and respond to your quote →</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;color:#6b7280;font-size:13px;">Or copy this link: <a href="${absoluteUrl}" style="color:#2563eb;">${absoluteUrl}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">Premier Property Maintenance · Questions? Reply to this email or contact us directly.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildQuoteEmailText(args: EmailBodyArgs): string {
  const { absoluteUrl, customerName, formattedExpiry, formattedTotal, quoteTitle } = args;
  const expiryLine = formattedExpiry ? `\nValid until: ${formattedExpiry}` : '';
  return `Hi ${customerName},

We've prepared a quote for your review.

${quoteTitle}
Total: ${formattedTotal}${expiryLine}

Review and respond to your quote:
${absoluteUrl}

Premier Property Maintenance
Questions? Reply to this email or contact us directly.`;
}

// ---------------------------------------------------------------------------
// Formatting helpers (server-side only — no Intl issues)
// ---------------------------------------------------------------------------

function formatMoney(value: number | null): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(
    value ?? 0
  );
}

function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(isoDate));
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
