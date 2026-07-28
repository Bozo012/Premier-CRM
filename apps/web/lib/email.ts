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

async function deliverEmail(args: {
  html: string;
  subject: string;
  text: string;
  to: string;
  errorLabel?: string;
}): Promise<{ sent: boolean }> {
  const resend = getResendClient();
  if (!resend) return { sent: false };

  try {
    const { error } = await resend.emails.send({
      from: getFromAddress(),
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });

    if (error) {
      console.error(args.errorLabel ?? '[email] Resend delivery failed:', error);
      return { sent: false };
    }
  } catch (error) {
    console.error(args.errorLabel ?? '[email] Resend delivery failed:', error);
    return { sent: false };
  }

  return { sent: true };
}

// ---------------------------------------------------------------------------
// Customer lifecycle notifications
// ---------------------------------------------------------------------------

export interface SendServiceRequestConfirmationEmailArgs {
  customerEmail: string;
  customerName: string;
  preferredDateTime: string | null;
  propertyAddress: string;
  requestNumber: string | null;
  serviceTitle: string;
}

export async function sendServiceRequestConfirmationEmail(
  args: SendServiceRequestConfirmationEmailArgs
): Promise<{ sent: boolean }> {
  const subject = args.requestNumber
    ? `We received your request (${args.requestNumber})`
    : 'We received your service request';
  const html = buildServiceRequestConfirmationEmailHtml(args);
  const text = buildServiceRequestConfirmationEmailText(args);

  return deliverEmail({
    to: args.customerEmail,
    subject,
    html,
    text,
  });
}

export interface SendSiteVisitScheduledEmailArgs {
  customerEmail: string;
  customerName: string;
  propertyAddress: string | null;
  siteVisitAt: string;
  estimateTitle: string;
}

export async function sendSiteVisitScheduledEmail(
  args: SendSiteVisitScheduledEmailArgs
): Promise<{ sent: boolean }> {
  const formattedSiteVisitAt = formatDateTime(args.siteVisitAt);
  const subject = `Your site visit is scheduled for ${formattedSiteVisitAt}`;
  const html = buildSiteVisitScheduledEmailHtml({
    ...args,
    formattedSiteVisitAt,
  });
  const text = buildSiteVisitScheduledEmailText({
    ...args,
    formattedSiteVisitAt,
  });

  return deliverEmail({
    to: args.customerEmail,
    subject,
    html,
    text,
  });
}

export interface SendJobScheduledEmailArgs {
  customerEmail: string;
  customerName: string;
  jobTitle: string;
  propertyAddress: string | null;
  scheduledEnd: string | null;
  scheduledStart: string;
}

export async function sendJobScheduledEmail(
  args: SendJobScheduledEmailArgs
): Promise<{ sent: boolean }> {
  const formattedScheduledStart = formatDateTime(args.scheduledStart);
  const formattedScheduledEnd = args.scheduledEnd ? formatDateTime(args.scheduledEnd) : null;
  const subject = `Your work is scheduled for ${formattedScheduledStart}`;
  const html = buildJobScheduledEmailHtml({
    ...args,
    formattedScheduledEnd,
    formattedScheduledStart,
  });
  const text = buildJobScheduledEmailText({
    ...args,
    formattedScheduledEnd,
    formattedScheduledStart,
  });

  return deliverEmail({
    to: args.customerEmail,
    subject,
    html,
    text,
  });
}

export interface SendPaymentReceiptEmailArgs {
  amount: number;
  customerEmail: string;
  customerName: string;
  invoiceTitle: string;
  paidAt: string;
  paymentMethod: string;
  propertyAddress: string | null;
  reference: string | null;
}

export async function sendPaymentReceiptEmail(
  args: SendPaymentReceiptEmailArgs
): Promise<{ sent: boolean }> {
  const formattedAmount = formatMoney(args.amount);
  const formattedPaidAt = formatDateTime(args.paidAt);
  const subject = `Payment received for ${args.invoiceTitle}`;
  const html = buildPaymentReceiptEmailHtml({
    ...args,
    formattedAmount,
    formattedPaidAt,
  });
  const text = buildPaymentReceiptEmailText({
    ...args,
    formattedAmount,
    formattedPaidAt,
  });

  return deliverEmail({
    to: args.customerEmail,
    subject,
    html,
    text,
  });
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
  const absoluteUrl = `${getAppUrl()}${args.quoteUrl}`;
  const formattedTotal = formatMoney(args.quoteTotal);
  const formattedExpiry = args.validUntil ? formatDate(args.validUntil) : null;

  const subject = `Your quote from Premier: ${args.quoteTitle}`;
  const html = buildQuoteEmailHtml({ ...args, absoluteUrl, formattedTotal, formattedExpiry });
  const text = buildQuoteEmailText({ ...args, absoluteUrl, formattedTotal, formattedExpiry });

  return deliverEmail({
    to: args.customerEmail,
    subject,
    html,
    text,
  });
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

  return deliverEmail({
    to: args.customerEmail,
    subject,
    html,
    text,
  });
}

// ---------------------------------------------------------------------------
// Team invite email
// ---------------------------------------------------------------------------

export interface SendExistingUserJoinEmailArgs {
  /** Human-readable role label, e.g. "Employee", "Admin" — not the raw enum value. */
  displayRole: string;
  /** ISO timestamp — org_invites.expires_at. */
  expiresAt: string;
  fullName: string;
  /** relative path — always /invite/{token}/continue for this flow. */
  joinUrl: string;
  inviterName: string;
  /** The actual organization's name — never hardcode a business name here. */
  orgName: string;
  toEmail: string;
}

/**
 * Auth Reset architecture (PR: "Auth Reset and Standard Supabase Invitation
 * Architecture") — this is the ONLY custom application email in the
 * onboarding flow, and it is used for exactly one scenario: an email that
 * already has a confirmed Supabase Auth account being invited to join an
 * (additional) organization. A genuinely new address never reaches this
 * function — it gets Supabase's own native "Invite user" email instead
 * (via `supabase.auth.admin.inviteUserByEmail()`), so there is never a
 * double-send for the same new user. See team/actions.ts's
 * createInviteAction for the branching logic.
 */
export async function sendExistingUserJoinEmail(
  args: SendExistingUserJoinEmailArgs
): Promise<{ sent: boolean }> {
  const absoluteUrl = `${getAppUrl()}${args.joinUrl}`;
  const formattedExpiresAt = formatDate(args.expiresAt);
  const subject = `${args.inviterName} invited you to join ${args.orgName}`;
  const html = buildExistingUserJoinEmailHtml({ ...args, absoluteUrl, formattedExpiresAt });
  const text = buildExistingUserJoinEmailText({ ...args, absoluteUrl, formattedExpiresAt });

  return deliverEmail({
    to: args.toEmail,
    subject,
    html,
    text,
    errorLabel: '[email] Resend delivery failed for existing-user join email:',
  });
}

interface ExistingUserJoinEmailBodyArgs {
  absoluteUrl: string;
  displayRole: string;
  formattedExpiresAt: string;
  fullName: string;
  inviterName: string;
  orgName: string;
}

function buildExistingUserJoinEmailHtml(args: ExistingUserJoinEmailBodyArgs): string {
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
              <p style="margin:0 0 20px;color:#111827;font-size:16px;">${escapeHtml(inviterName)} invited you to join <strong>${escapeHtml(orgName)}</strong> as <strong>${escapeHtml(displayRole)}</strong>. You already have an account with us — sign in with your existing password to join.</p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background:#2563eb;border-radius:6px;">
                    <a href="${absoluteUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">Sign in and join →</a>
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

function buildExistingUserJoinEmailText(args: ExistingUserJoinEmailBodyArgs): string {
  const { absoluteUrl, displayRole, formattedExpiresAt, fullName, inviterName, orgName } = args;
  return `Hi ${fullName},

${inviterName} invited you to join ${orgName} as ${displayRole}. You already have an account with us — sign in with your existing password to join.

Sign in and join:
${absoluteUrl}

This invite expires on ${formattedExpiresAt}.

${orgName}
Questions? Reply to this email or contact us directly.`;
}

function buildServiceRequestConfirmationEmailHtml(
  args: SendServiceRequestConfirmationEmailArgs
): string {
  const requestLine = args.requestNumber
    ? `<p style="margin:0 0 12px;color:#6b7280;font-size:14px;">Reference: <strong>${escapeHtml(args.requestNumber)}</strong></p>`
    : '';
  const preferredDateLine = args.preferredDateTime
    ? `<p style="margin:6px 0 0;color:#6b7280;font-size:14px;">Preferred timing: <strong>${escapeHtml(args.preferredDateTime)}</strong></p>`
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
              <p style="margin:0 0 16px;color:#111827;font-size:16px;">Hi ${escapeHtml(args.customerName)},</p>
              <p style="margin:0 0 12px;color:#111827;font-size:16px;">We received your request for <strong>${escapeHtml(args.serviceTitle)}</strong>.</p>
              ${requestLine}
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;color:#374151;font-size:15px;font-weight:600;">Service location</p>
                    <p style="margin:6px 0 0;color:#6b7280;font-size:14px;">${escapeHtml(args.propertyAddress)}</p>
                    ${preferredDateLine}
                  </td>
                </tr>
              </table>
              <p style="margin:0;color:#111827;font-size:15px;">We’ll review the request and follow up by email or phone with the next step.</p>
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

function buildServiceRequestConfirmationEmailText(
  args: SendServiceRequestConfirmationEmailArgs
): string {
  return `Hi ${args.customerName},

We received your request for ${args.serviceTitle}.
${args.requestNumber ? `Reference: ${args.requestNumber}\n` : ''}Service location: ${args.propertyAddress}
${args.preferredDateTime ? `Preferred timing: ${args.preferredDateTime}\n` : ''}We’ll review the request and follow up by email or phone with the next step.

Premier Property Maintenance`;
}

interface SiteVisitScheduledEmailBodyArgs extends SendSiteVisitScheduledEmailArgs {
  formattedSiteVisitAt: string;
}

function buildSiteVisitScheduledEmailHtml(args: SiteVisitScheduledEmailBodyArgs): string {
  const propertyLine = args.propertyAddress
    ? `<p style="margin:6px 0 0;color:#6b7280;font-size:14px;">Property: <strong>${escapeHtml(args.propertyAddress)}</strong></p>`
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
              <p style="margin:0 0 16px;color:#111827;font-size:16px;">Hi ${escapeHtml(args.customerName)},</p>
              <p style="margin:0 0 8px;color:#111827;font-size:16px;">Your site visit is scheduled for <strong>${escapeHtml(args.formattedSiteVisitAt)}</strong>.</p>
              <p style="margin:0;color:#111827;font-size:15px;">We’ll use this visit to review <strong>${escapeHtml(args.estimateTitle)}</strong> and confirm the next step with you.</p>
              ${propertyLine}
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

function buildSiteVisitScheduledEmailText(args: SiteVisitScheduledEmailBodyArgs): string {
  return `Hi ${args.customerName},

Your site visit is scheduled for ${args.formattedSiteVisitAt}.

We’ll use this visit to review ${args.estimateTitle} and confirm the next step with you.
${args.propertyAddress ? `Property: ${args.propertyAddress}\n` : ''}
Premier Property Maintenance`;
}

interface PaymentReceiptEmailBodyArgs extends SendPaymentReceiptEmailArgs {
  formattedAmount: string;
  formattedPaidAt: string;
}

interface JobScheduledEmailBodyArgs extends SendJobScheduledEmailArgs {
  formattedScheduledEnd: string | null;
  formattedScheduledStart: string;
}

function buildJobScheduledEmailHtml(args: JobScheduledEmailBodyArgs): string {
  const propertyLine = args.propertyAddress
    ? `<p style="margin:6px 0 0;color:#6b7280;font-size:14px;">Property: <strong>${escapeHtml(args.propertyAddress)}</strong></p>`
    : '';
  const windowLine = args.formattedScheduledEnd
    ? `<p style="margin:0;color:#111827;font-size:15px;">We’ve scheduled <strong>${escapeHtml(args.jobTitle)}</strong> from <strong>${escapeHtml(args.formattedScheduledStart)}</strong> to <strong>${escapeHtml(args.formattedScheduledEnd)}</strong>.</p>`
    : `<p style="margin:0;color:#111827;font-size:15px;">We’ve scheduled <strong>${escapeHtml(args.jobTitle)}</strong> for <strong>${escapeHtml(args.formattedScheduledStart)}</strong>.</p>`;

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
              <p style="margin:0 0 16px;color:#111827;font-size:16px;">Hi ${escapeHtml(args.customerName)},</p>
              ${windowLine}
              ${propertyLine}
              <p style="margin:16px 0 0;color:#111827;font-size:15px;">If anything changes, reply to this email or contact us and we’ll update the schedule.</p>
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

function buildJobScheduledEmailText(args: JobScheduledEmailBodyArgs): string {
  const windowLine = args.formattedScheduledEnd
    ? `We’ve scheduled ${args.jobTitle} from ${args.formattedScheduledStart} to ${args.formattedScheduledEnd}.`
    : `We’ve scheduled ${args.jobTitle} for ${args.formattedScheduledStart}.`;

  return `Hi ${args.customerName},

${windowLine}
${args.propertyAddress ? `Property: ${args.propertyAddress}\n` : ''}If anything changes, reply to this email or contact us and we’ll update the schedule.

Premier Property Maintenance`;
}

function buildPaymentReceiptEmailHtml(args: PaymentReceiptEmailBodyArgs): string {
  const referenceLine = args.reference
    ? `<p style="margin:6px 0 0;color:#6b7280;font-size:14px;">Reference: <strong>${escapeHtml(args.reference)}</strong></p>`
    : '';
  const propertyLine = args.propertyAddress
    ? `<p style="margin:6px 0 0;color:#6b7280;font-size:14px;">Property: <strong>${escapeHtml(args.propertyAddress)}</strong></p>`
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
              <p style="margin:0 0 16px;color:#111827;font-size:16px;">Hi ${escapeHtml(args.customerName)},</p>
              <p style="margin:0 0 8px;color:#111827;font-size:16px;">We received your payment of <strong>${args.formattedAmount}</strong> for <strong>${escapeHtml(args.invoiceTitle)}</strong>.</p>
              <p style="margin:0;color:#111827;font-size:15px;">Paid on ${escapeHtml(args.formattedPaidAt)} via ${escapeHtml(formatEnumLabel(args.paymentMethod))}.</p>
              ${referenceLine}
              ${propertyLine}
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

function buildPaymentReceiptEmailText(args: PaymentReceiptEmailBodyArgs): string {
  return `Hi ${args.customerName},

We received your payment of ${args.formattedAmount} for ${args.invoiceTitle}.
Paid on ${args.formattedPaidAt} via ${formatEnumLabel(args.paymentMethod)}.
${args.reference ? `Reference: ${args.reference}\n` : ''}${args.propertyAddress ? `Property: ${args.propertyAddress}\n` : ''}
Premier Property Maintenance`;
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

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}

function formatEnumLabel(value: string): string {
  return value
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
