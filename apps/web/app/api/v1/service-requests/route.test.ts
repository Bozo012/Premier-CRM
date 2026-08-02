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
  preferredDateTime: '2026-08-05T14:30',
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
    createServiceClientMock.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { timezone: 'America/New_York' } }),
          }),
        }),
      }),
    });
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
      preferredDateTime: '2026-08-05T14:30',
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

  // parsePreferredDateTime() (route.ts) parses the datetime-local string as
  // literal wall-clock text — it never constructs a Date object or converts
  // between zones, so a DST-boundary value and a non-Eastern org timezone
  // both parse identically and unambiguously. These tests lock that in: if
  // someone later "fixes" this with `new Date(str)`, they reintroduce the
  // exact server/browser-timezone contamination bug this design avoids.
  it('parses a datetime-local value that falls inside a DST spring-forward window unambiguously', async () => {
    const response = await POST(
      buildRequest({ ...validPayload, preferredDateTime: '2026-03-08T02:30' }, '203.0.113.12')
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(sendServiceRequestSubmittedNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ preferredDateTime: '2026-03-08T02:30' })
    );
    expect(createServiceRequestMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        payload: expect.objectContaining({ preferred_date: '2026-03-08', preferred_time: '2:30 AM' }),
      })
    );
  });

  it('parses the same datetime-local value identically for a non-Eastern org timezone', async () => {
    createServiceClientMock.mockReturnValueOnce({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { timezone: 'America/Los_Angeles' } }),
          }),
        }),
      }),
    });

    const response = await POST(
      buildRequest({ ...validPayload, preferredDateTime: '2026-08-05T14:30' }, '203.0.113.13')
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(createServiceRequestMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        payload: expect.objectContaining({ preferred_date: '2026-08-05', preferred_time: '2:30 PM' }),
      })
    );
  });
});
