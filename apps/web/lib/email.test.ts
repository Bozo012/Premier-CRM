import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails;

    constructor() {
      this.emails = {
        send: sendMock,
      };
    }
  },
}));

describe('email lifecycle templates', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.RESEND_FROM_EMAIL = 'quotes@ppmnky.com';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.ppmnky.com';
    sendMock.mockResolvedValue({ error: null });
  });

  it('sends the service-request confirmation with the request number and address', async () => {
    const { sendServiceRequestConfirmationEmail } = await import('./email');

    const result = await sendServiceRequestConfirmationEmail({
      customerEmail: 'customer@example.com',
      customerName: 'Jane Smith',
      preferredDateTime: 'Thursday morning',
      propertyAddress: '123 Main St, Nashville, TN 37201',
      requestNumber: 'REQ-1001',
      serviceTitle: 'Lawn cleanup',
    });

    expect(result).toEqual({ sent: true });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'quotes@ppmnky.com',
        subject: 'We received your request (REQ-1001)',
        to: 'customer@example.com',
      })
    );
    expect(sendMock.mock.calls[0]?.[0]?.html).toContain('REQ-1001');
    expect(sendMock.mock.calls[0]?.[0]?.html).toContain('123 Main St, Nashville, TN 37201');
  });

  it('sends the site-visit scheduled email with the scheduled timestamp', async () => {
    const { sendSiteVisitScheduledEmail } = await import('./email');

    const result = await sendSiteVisitScheduledEmail({
      customerEmail: 'customer@example.com',
      customerName: 'Jane Smith',
      propertyAddress: '123 Main St, Nashville, TN 37201',
      siteVisitAt: '2026-08-02T13:30:00.000Z',
      estimateTitle: 'Lawn cleanup',
    });

    expect(result).toEqual({ sent: true });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('Your site visit is scheduled'),
        to: 'customer@example.com',
      })
    );
    expect(sendMock.mock.calls[0]?.[0]?.text).toContain('Lawn cleanup');
  });

  it('sends the job-scheduled email with the work window', async () => {
    const { sendJobScheduledEmail } = await import('./email');

    const result = await sendJobScheduledEmail({
      customerEmail: 'customer@example.com',
      customerName: 'Jane Smith',
      jobTitle: 'Fence repair',
      propertyAddress: '123 Main St, Nashville, TN 37201',
      scheduledEnd: '2026-08-08T15:00:00.000Z',
      scheduledStart: '2026-08-08T13:30:00.000Z',
    });

    expect(result).toEqual({ sent: true });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('Your work is scheduled'),
        to: 'customer@example.com',
      })
    );
    expect(sendMock.mock.calls[0]?.[0]?.text).toContain('Fence repair');
    expect(sendMock.mock.calls[0]?.[0]?.text).toContain('123 Main St, Nashville, TN 37201');
  });

  it('sends the payment receipt email with the payment summary', async () => {
    const { sendPaymentReceiptEmail } = await import('./email');

    const result = await sendPaymentReceiptEmail({
      amount: 250,
      customerEmail: 'customer@example.com',
      customerName: 'Jane Smith',
      invoiceTitle: 'August mowing',
      paidAt: '2026-08-05',
      paymentMethod: 'card',
      propertyAddress: '123 Main St, Nashville, TN 37201',
      reference: 'PMT-42',
    });

    expect(result).toEqual({ sent: true });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Payment received for August mowing',
        to: 'customer@example.com',
      })
    );
    expect(sendMock.mock.calls[0]?.[0]?.text).toContain('PMT-42');
    expect(sendMock.mock.calls[0]?.[0]?.text).toContain('$250.00');
  });

  it('returns sent=false when the resend client throws', async () => {
    sendMock.mockRejectedValueOnce(new Error('smtp down'));
    const { sendPaymentReceiptEmail } = await import('./email');

    const result = await sendPaymentReceiptEmail({
      amount: 250,
      customerEmail: 'customer@example.com',
      customerName: 'Jane Smith',
      invoiceTitle: 'August mowing',
      paidAt: '2026-08-05',
      paymentMethod: 'card',
      propertyAddress: null,
      reference: null,
    });

    expect(result).toEqual({ sent: false });
  });

  // Forge/Foundry naming rollout (docs/architecture/forge-foundry-naming-audit.md):
  // the internal staff-notification template is the one email that should now
  // say "Forge" instead of "Premier CRM" — every customer-facing template must
  // keep saying "Premier Property Maintenance", never "Forge" or "Foundry".
  it('the internal quote-responded staff notification identifies the product as Forge, not Premier CRM', async () => {
    const { sendQuoteRespondedNotificationEmail } = await import('./email');

    const result = await sendQuoteRespondedNotificationEmail({
      toEmails: ['owner@example.com'],
      customerName: 'Jane Smith',
      quoteTitle: 'Fence repair',
      quoteTotal: 500,
      quoteDetailUrl: '/quotes/abc123',
      response: 'accepted',
      declineReason: null,
    });

    expect(result).toEqual({ sent: true });
    const html = sendMock.mock.calls[0]?.[0]?.html as string;
    expect(html).toContain('Forge');
    expect(html).not.toContain('Premier CRM');
  });

  it('customer-facing quote and invoice emails still identify Premier Property Maintenance, never Forge', async () => {
    const { sendQuoteEmail, sendInvoiceEmail } = await import('./email');

    await sendQuoteEmail({
      customerEmail: 'customer@example.com',
      customerName: 'Jane Smith',
      quoteTitle: 'Fence repair',
      quoteTotal: 500,
      quoteUrl: '/q/token123',
      validUntil: null,
    });
    const quoteHtml = sendMock.mock.calls[0]?.[0]?.html as string;
    expect(quoteHtml).toContain('Premier Property Maintenance');
    expect(quoteHtml).not.toContain('Forge');
    expect(quoteHtml).not.toContain('Foundry');

    sendMock.mockClear();

    await sendInvoiceEmail({
      customerEmail: 'customer@example.com',
      customerName: 'Jane Smith',
      invoiceTitle: 'August mowing',
      invoiceTotal: 250,
      invoiceUrl: '/i/token456',
      dueDate: null,
    });
    const invoiceHtml = sendMock.mock.calls[0]?.[0]?.html as string;
    expect(invoiceHtml).toContain('Premier Property Maintenance');
    expect(invoiceHtml).not.toContain('Forge');
    expect(invoiceHtml).not.toContain('Foundry');
  });
});
