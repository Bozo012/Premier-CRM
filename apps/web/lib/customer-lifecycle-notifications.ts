import type { EstimateDetail, InvoiceDetail, JobDetail } from '@premier/db';

import {
  sendJobScheduledEmail,
  sendPaymentReceiptEmail,
  sendServiceRequestConfirmationEmail,
  sendSiteVisitScheduledEmail,
} from './email';

export const CUSTOMER_NOTIFICATION_TRIGGER_POINTS = [
  {
    event: 'service_request_submitted',
    template: 'service-request-confirmation',
    trigger: 'POST /api/v1/service-requests',
  },
  {
    event: 'estimate_site_visit_scheduled',
    template: 'site-visit-scheduled',
    trigger: 'updateEstimateStatusAction (draft → site_visit_scheduled)',
  },
  {
    event: 'job_scheduled',
    template: 'job-scheduled',
    trigger: 'scheduleJobAction (approved → scheduled)',
  },
  {
    event: 'quote_sent',
    template: 'quote-delivery',
    trigger: 'sendQuoteAction',
  },
  {
    event: 'invoice_sent',
    template: 'invoice-delivery',
    trigger: 'sendInvoiceAction',
  },
  {
    event: 'invoice_payment_recorded',
    template: 'payment-receipt',
    trigger: 'recordPaymentAction',
  },
] as const;

export async function sendServiceRequestSubmittedNotification(args: {
  customerEmail: string | null;
  customerName: string;
  preferredDateTime: string | null;
  propertyAddress: string;
  requestNumber: string | null;
  serviceTitle: string;
}): Promise<{ sent: boolean }> {
  if (!args.customerEmail) {
    return { sent: false };
  }

  return sendServiceRequestConfirmationEmail({
    customerEmail: args.customerEmail,
    customerName: args.customerName,
    preferredDateTime: args.preferredDateTime,
    propertyAddress: args.propertyAddress,
    requestNumber: args.requestNumber,
    serviceTitle: args.serviceTitle,
  });
}

export async function sendEstimateSiteVisitScheduledNotification(
  estimate: EstimateDetail
): Promise<{ sent: boolean }> {
  if (
    estimate.status !== 'site_visit_scheduled' ||
    !estimate.customer?.email ||
    !estimate.siteVisitAt
  ) {
    return { sent: false };
  }

  return sendSiteVisitScheduledEmail({
    customerEmail: estimate.customer.email,
    customerName: estimate.customer.displayName,
    propertyAddress: estimate.property ? formatPropertyAddress(estimate.property) : null,
    siteVisitAt: estimate.siteVisitAt,
    estimateTitle: estimate.title?.trim() || estimate.estimateNumber || 'your estimate',
  });
}

export async function sendJobScheduledNotification(
  jobDetail: JobDetail
): Promise<{ sent: boolean }> {
  if (
    jobDetail.job.status !== 'scheduled' ||
    !jobDetail.customer?.email ||
    !jobDetail.job.scheduled_start
  ) {
    return { sent: false };
  }

  return sendJobScheduledEmail({
    customerEmail: jobDetail.customer.email,
    customerName: jobDetail.customer.displayName,
    jobTitle: jobDetail.job.title?.trim() || jobDetail.job.job_number || 'your job',
    propertyAddress: jobDetail.property ? formatPropertyAddress(jobDetail.property) : null,
    scheduledEnd: jobDetail.job.scheduled_end,
    scheduledStart: jobDetail.job.scheduled_start,
  });
}

export async function sendPaymentRecordedNotification(
  invoice: InvoiceDetail,
  payment: {
    amount: number;
    method: string;
    paidAt: string;
    reference?: string | null;
  }
): Promise<{ sent: boolean }> {
  if (!invoice.customer?.email) {
    return { sent: false };
  }

  return sendPaymentReceiptEmail({
    amount: payment.amount,
    customerEmail: invoice.customer.email,
    customerName: invoice.customer.displayName,
    invoiceTitle: invoice.invoice.title?.trim() || invoice.invoice.invoice_number || 'your invoice',
    paidAt: payment.paidAt,
    paymentMethod: payment.method,
    propertyAddress: invoice.property ? formatPropertyAddress(invoice.property) : null,
    reference: payment.reference ?? null,
  });
}

function formatPropertyAddress(property: {
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
}): string {
  return [property.addressLine1, `${property.city}, ${property.state} ${property.zip}`]
    .filter(Boolean)
    .join(', ');
}
