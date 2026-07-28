import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

const {
  createServiceClientMock,
  createServiceRequestMock,
  sendServiceRequestSubmittedNotificationMock,
} = vi.hoisted(() => ({
  createServiceClientMock: vi.fn(),
  createServiceRequestMock: vi.fn(),
  sendServiceRequestSubmittedNotificationMock: vi.fn(),
}));

vi.mock('@premier/db', () => ({
  createServiceClient: createServiceClientMock,
  createServiceRequest: createServiceRequestMock,
}));

vi.mock('@/lib/customer-lifecycle-notifications', () => ({
  sendServiceRequestSubmittedNotification: sendServiceRequestSubmittedNotificationMock,
}));

function buildRequest(body: unknown, ip: string): NextRequest {
  return new Request('https://ppmnky.com/api/v1/service-requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://ppmnky.com',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  }) as NextRequest;
}

const validPayload = {
  accessInstructions: '',
  additionalNotes: '',
  addressLine1: '123 Main St',
  city: 'Nashville',
  customerType: 'Residential',
  emailAddress: 'customer@example.com',
  firstName: 'Jane',
  lastName: 'Smith',
  phoneNumber: '615-555-0100',
  preferredContactMethod: 'email',
  preferredDateTime: 'Thursday morning',
  priorityLevel: 'normal',
  problemDescription: 'Need lawn cleanup',
  propertyType: 'single-family',
  serviceCategory: 'Lawn cleanup',
  state: 'TN',
  zipCode: '37201',
};

describe('POST /api/v1/service-requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServiceClientMock.mockReturnValue({ client: true });
    createServiceRequestMock.mockResolvedValue({
      success: true,
      data: {
        serviceRequestId: 'request-1',
        requestNumber: 'REQ-1001',
        customerId: 'customer-1',
        propertyId: 'property-1',
        dedupedCustomer: false,
        dedupedProperty: false,
      },
    });
    sendServiceRequestSubmittedNotificationMock.mockResolvedValue({ sent: true });
  });

  it('returns success and triggers the customer confirmation notification', async () => {
    const response = await POST(buildRequest(validPayload, '203.0.113.10'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.ticket_id).toBe('request-1');
    expect(createServiceRequestMock).toHaveBeenCalled();
    expect(sendServiceRequestSubmittedNotificationMock).toHaveBeenCalledWith({
      customerEmail: 'customer@example.com',
      customerName: 'Jane Smith',
      preferredDateTime: 'Thursday morning',
      propertyAddress: '123 Main St, Nashville, TN 37201',
      requestNumber: 'REQ-1001',
      serviceTitle: 'Lawn cleanup',
    });
  });

  it('still returns success if the confirmation notification reports sent=false', async () => {
    sendServiceRequestSubmittedNotificationMock.mockResolvedValueOnce({ sent: false });

    const response = await POST(buildRequest(validPayload, '203.0.113.11'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(sendServiceRequestSubmittedNotificationMock).toHaveBeenCalledOnce();
  });
});
