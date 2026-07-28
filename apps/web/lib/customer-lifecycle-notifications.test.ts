import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  sendJobScheduledNotification,
  sendEstimateSiteVisitScheduledNotification,
  sendPaymentRecordedNotification,
  sendServiceRequestSubmittedNotification,
} from './customer-lifecycle-notifications';
import {
  sendJobScheduledEmail,
  sendPaymentReceiptEmail,
  sendServiceRequestConfirmationEmail,
  sendSiteVisitScheduledEmail,
} from './email';

vi.mock('./email', () => ({
  sendJobScheduledEmail: vi.fn(),
  sendPaymentReceiptEmail: vi.fn(),
  sendServiceRequestConfirmationEmail: vi.fn(),
  sendSiteVisitScheduledEmail: vi.fn(),
}));

describe('customer lifecycle notifications', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(sendJobScheduledEmail).mockResolvedValue({ sent: true });
    vi.mocked(sendPaymentReceiptEmail).mockResolvedValue({ sent: true });
    vi.mocked(sendServiceRequestConfirmationEmail).mockResolvedValue({ sent: true });
    vi.mocked(sendSiteVisitScheduledEmail).mockResolvedValue({ sent: true });
  });

  it('sends request-submitted confirmation when an email exists', async () => {
    await sendServiceRequestSubmittedNotification({
      customerEmail: 'customer@example.com',
      customerName: 'Jane Smith',
      preferredDateTime: 'Thursday morning',
      propertyAddress: '123 Main St, Nashville, TN 37201',
      requestNumber: 'REQ-1001',
      serviceTitle: 'Lawn cleanup',
    });

    expect(sendServiceRequestConfirmationEmail).toHaveBeenCalledWith({
      customerEmail: 'customer@example.com',
      customerName: 'Jane Smith',
      preferredDateTime: 'Thursday morning',
      propertyAddress: '123 Main St, Nashville, TN 37201',
      requestNumber: 'REQ-1001',
      serviceTitle: 'Lawn cleanup',
    });
  });

  it('skips request-submitted confirmation without a customer email', async () => {
    const result = await sendServiceRequestSubmittedNotification({
      customerEmail: null,
      customerName: 'Jane Smith',
      preferredDateTime: null,
      propertyAddress: '123 Main St, Nashville, TN 37201',
      requestNumber: 'REQ-1001',
      serviceTitle: 'Lawn cleanup',
    });

    expect(result).toEqual({ sent: false });
    expect(sendServiceRequestConfirmationEmail).not.toHaveBeenCalled();
  });

  it('sends site-visit email only for site_visit_scheduled estimates with customer email', async () => {
    await sendEstimateSiteVisitScheduledNotification({
      customer: {
        displayName: 'Jane Smith',
        email: 'customer@example.com',
      },
      estimateNumber: 'EST-1001',
      property: {
        addressLine1: '123 Main St',
        city: 'Nashville',
        state: 'TN',
        zip: '37201',
      },
      siteVisitAt: '2026-08-02T13:30:00.000Z',
      status: 'site_visit_scheduled',
      title: 'Lawn cleanup',
    } as never);

    expect(sendSiteVisitScheduledEmail).toHaveBeenCalledWith({
      customerEmail: 'customer@example.com',
      customerName: 'Jane Smith',
      propertyAddress: '123 Main St, Nashville, TN 37201',
      siteVisitAt: '2026-08-02T13:30:00.000Z',
      estimateTitle: 'Lawn cleanup',
    });
  });

  it('skips site-visit email for non-scheduled estimates', async () => {
    const result = await sendEstimateSiteVisitScheduledNotification({
      customer: {
        displayName: 'Jane Smith',
        email: 'customer@example.com',
      },
      estimateNumber: 'EST-1001',
      property: null,
      siteVisitAt: null,
      status: 'draft',
      title: 'Lawn cleanup',
    } as never);

    expect(result).toEqual({ sent: false });
    expect(sendSiteVisitScheduledEmail).not.toHaveBeenCalled();
  });

  it('sends job-scheduled email only for scheduled jobs with a customer email', async () => {
    await sendJobScheduledNotification({
      customer: {
        displayName: 'Jane Smith',
        email: 'customer@example.com',
      },
      job: {
        job_number: 'JOB-1001',
        scheduled_end: '2026-08-08T15:00:00.000Z',
        scheduled_start: '2026-08-08T13:30:00.000Z',
        status: 'scheduled',
        title: 'Fence repair',
      },
      property: {
        addressLine1: '123 Main St',
        city: 'Nashville',
        state: 'TN',
        zip: '37201',
      },
    } as never);

    expect(sendJobScheduledEmail).toHaveBeenCalledWith({
      customerEmail: 'customer@example.com',
      customerName: 'Jane Smith',
      jobTitle: 'Fence repair',
      propertyAddress: '123 Main St, Nashville, TN 37201',
      scheduledEnd: '2026-08-08T15:00:00.000Z',
      scheduledStart: '2026-08-08T13:30:00.000Z',
    });
  });

  it('skips job-scheduled email when the job is not scheduled', async () => {
    const result = await sendJobScheduledNotification({
      customer: {
        displayName: 'Jane Smith',
        email: 'customer@example.com',
      },
      job: {
        job_number: 'JOB-1001',
        scheduled_end: null,
        scheduled_start: null,
        status: 'approved',
        title: 'Fence repair',
      },
      property: null,
    } as never);

    expect(result).toEqual({ sent: false });
    expect(sendJobScheduledEmail).not.toHaveBeenCalled();
  });

  it('sends payment receipt email with the recorded payment details', async () => {
    await sendPaymentRecordedNotification(
      {
        customer: {
          displayName: 'Jane Smith',
          email: 'customer@example.com',
        },
        invoice: {
          invoice_number: 'INV-1001',
          title: 'August mowing',
        },
        property: {
          addressLine1: '123 Main St',
          city: 'Nashville',
          state: 'TN',
          zip: '37201',
        },
      } as never,
      {
        amount: 250,
        method: 'card',
        paidAt: '2026-08-05',
        reference: 'PMT-42',
      }
    );

    expect(sendPaymentReceiptEmail).toHaveBeenCalledWith({
      amount: 250,
      customerEmail: 'customer@example.com',
      customerName: 'Jane Smith',
      invoiceTitle: 'August mowing',
      paidAt: '2026-08-05',
      paymentMethod: 'card',
      propertyAddress: '123 Main St, Nashville, TN 37201',
      reference: 'PMT-42',
    });
  });
});
