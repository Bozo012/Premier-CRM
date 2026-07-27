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

export function getAppUrl(): string {
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
// Invoice delivery email
// ---------------------------------------------------------------------------

export interface SendInvoiceEmailArgs {
  customerEmail: string;
  customerName: string;
  invoiceTitle: string;
  invoiceTotal: number | null;
  invoiceUrl: string; // relative path, e.g. /i/{token}
  dueDate: string | null; // ISO date string (DATE column)
}

export async function sendInvoiceEmail(
  args: SendInvoiceEmailArgs
): Promise<{ sent: boolean }> {
  const resend = getResendClient();
  if (!resend) return { sent: false };

  const absoluteUrl = `${getAppUrl()}${args.invoiceUrl}`;
  const formattedTotal = formatMoney(args.invoiceTotal);
  const formattedDueDate = args.dueDate ? formatDate(args.dueDate) : null;

  const subject = `Your invoice from Premier: ${args.invoiceTitle}`;
  const html = buildInvoiceEmailHtml({
    ...args,
    absoluteUrl,
    formattedTotal,
    formattedDueDate,
  });
  const text = buildInvoiceEmailText({
    ...args,
    absoluteUrl,
    formattedTotal,
    formattedDueDate,
  });

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
// Team invite email
// ---------------------------------------------------------------------------

export interface SendTeamInviteEmailArgs {
  /** Human-readable role label, e.g. "Employee", "Admin" — not the raw enum value. */
  displayRole: string;
  /** ISO timestamp — org_invites.expires_at. */
  expiresAt: string;
  fullName: string;
  inviteUrl: string; // relative path, e.g. /invite/{token}
  inviterName: string;
  /** The actual organization's name — never hardcode a business name here. */
  orgName: string;
  toEmail: string;
}

export async function sendTeamInviteEmail(
  args: SendTeamInviteEmailArgs
): Promise<{ sent: boolean }> {
  const resend = getResendClient();
  if (!resend) return { sent: false };

  const absoluteUrl = `${getAppUrl()}${args.inviteUrl}`;
  const formattedExpiresAt = formatDate(args.expiresAt);
  const subject = `${args.inviterName} invited you to join ${args.orgName}`;
  const html = buildTeamInviteEmailHtml({ ...args, absoluteUrl, formattedExpiresAt });
  const text = buildTeamInviteEmailText({ ...args, absoluteUrl, formattedExpiresAt });

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: args.toEmail,
    subject,
    html,
    text,
  });

  if (error) {
    // Never log the raw invite URL/token — it's a live, unauthenticated
    // acceptance link. Resend's own error object doesn't include it, but
    // callers of this function must not add it to their own error logging.
    console.error('[email] Resend delivery failed for team invite:', error.message);
    return { sent: false };
  }

  return { sent: true };
}

interface TeamInviteEmailBodyArgs {
  absoluteUrl: string;
  displayRole: string;
  formattedExpiresAt: string;
  fullName: string;
  inviterName: string;
  orgName: string;
}

function buildTeamInviteEmailHtml(args: TeamInviteEmailBodyArgs): string {
  const { absoluteUrl, displayRole, formattedExpiresAt, fullName, inviterName, orgName } = args;

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
              <p style="margin:0;color:#f8fafc;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(orgName)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 16px;color:#111827;font-size:16px;">Hi ${escapeHtml(fullName)},</p>
              <p style="margin:0 0 20px;color:#111827;font-size:16px;">${escapeHtml(inviterName)} invited you to join <strong>${escapeHtml(orgName)}</strong> as <strong>${escapeHtml(displayRole)}</strong>.</p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background:#2563eb;border-radius:6px;">
                    <a href="${absoluteUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">Accept invitation →</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;color:#6b7280;font-size:13px;">Or copy this link: <a href="${absoluteUrl}" style="color:#2563eb;">${absoluteUrl}</a></p>
              <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;">This invite expires on ${formattedExpiresAt}.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">${escapeHtml(orgName)} · Questions? Reply to this email or contact us directly.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildTeamInviteEmailText(args: TeamInviteEmailBodyArgs): string {
  const { absoluteUrl, displayRole, formattedExpiresAt, fullName, inviterName, orgName } = args;
  return `Hi ${fullName},

${inviterName} invited you to join ${orgName} as ${displayRole}.

Accept your invitation:
${absoluteUrl}

This invite expires on ${formattedExpiresAt}.

${orgName}
Questions? Reply to this email or contact us directly.`;
}

interface InvoiceEmailBodyArgs {
  absoluteUrl: string;
  customerName: string;
  formattedDueDate: string | null;
  formattedTotal: string;
  invoiceTitle: string;
}

function buildInvoiceEmailHtml(args: InvoiceEmailBodyArgs): string {
  const { absoluteUrl, customerName, formattedDueDate, formattedTotal, invoiceTitle } = args;
  const dueLine = formattedDueDate
    ? `<p style="color:#6b7280;font-size:14px;margin:8px 0 0;">Payment is due by <strong>${formattedDueDate}</strong>.</p>`
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
              <p style="margin:0 0 8px;color:#111827;font-size:16px;">Your invoice is ready.</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;color:#374151;font-size:15px;font-weight:600;">${escapeHtml(invoiceTitle)}</p>
                    <p style="margin:6px 0 0;color:#6b7280;font-size:14px;">Amount due: <strong style="color:#111827;">${formattedTotal}</strong></p>
                    ${dueLine}
                  </td>
                </tr>
              </table>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background:#2563eb;border-radius:6px;">
                    <a href="${absoluteUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">View your invoice →</a>
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

function buildInvoiceEmailText(args: InvoiceEmailBodyArgs): string {
  const { absoluteUrl, customerName, formattedDueDate, formattedTotal, invoiceTitle } = args;
  const dueLine = formattedDueDate ? `\nDue by: ${formattedDueDate}` : '';
  return `Hi ${customerName},

Your invoice is ready.

${invoiceTitle}
Amount due: ${formattedTotal}${dueLine}

View your invoice:
${absoluteUrl}

Premier Property Maintenance
Questions? Reply to this email or contact us directly.`;
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
