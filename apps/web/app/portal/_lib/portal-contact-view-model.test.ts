import { describe, expect, it } from 'vitest';

import {
  buildPortalContactViewModel,
  contactBlockingReasons,
  parseContactRecordKey,
  recordsForCategory,
} from './portal-contact-view-model';

describe('portal contact view model', () => {
  it('offers only customer-owned request and property records supplied by the dashboard', () => {
    const model = buildPortalContactViewModel({
      customerEmail: 'customer@example.com',
      serviceRequests: [
        {
          id: 'request-1',
          request_number: 'REQ-001',
          service_title: 'Deck repair',
          status: 'new',
          submitted_at: '2026-08-05T12:00:00.000Z',
        },
      ],
      properties: [
        {
          relationship: 'owner',
          is_primary: true,
          properties: {
            id: 'property-1',
            address_line_1: '1 Main St',
            city: 'Florence',
            state: 'KY',
            zip: '41042',
          },
        },
      ],
    });

    expect(model.records.map((record) => record.id)).toEqual([
      'request:request-1',
      'property:property-1',
    ]);
    expect(model.records[0]?.sublabel).toContain('New');
  });

  it('filters records by selected category', () => {
    const model = buildPortalContactViewModel({
      customerEmail: 'customer@example.com',
      serviceRequests: [
        {
          id: 'request-1',
          request_number: 'REQ-001',
          service_title: 'Deck repair',
          status: 'new',
          submitted_at: '2026-08-05T12:00:00.000Z',
        },
      ],
      properties: [
        {
          relationship: null,
          is_primary: null,
          properties: {
            id: 'property-1',
            address_line_1: '1 Main St',
            city: 'Florence',
            state: 'KY',
            zip: '41042',
          },
        },
      ],
    });
    const propertyCategory = model.categories.find((category) => category.id === 'property');

    expect(recordsForCategory(model.records, propertyCategory).map((record) => record.type)).toEqual([
      'property',
    ]);
  });

  it('requires a related record only for categories that demand one', () => {
    const model = buildPortalContactViewModel({
      customerEmail: 'customer@example.com',
      serviceRequests: [],
      properties: [],
    });

    expect(
      contactBlockingReasons(
        {
          categoryId: 'property',
          relatedRecordKey: '',
          subject: 'Gate',
          message: 'Can you check this?',
          replyMethodId: 'email',
        },
        model.categories.find((category) => category.id === 'property')
      )
    ).toContain('Select the record your question is about.');

    expect(
      contactBlockingReasons(
        {
          categoryId: 'general',
          relatedRecordKey: '',
          subject: 'Question',
          message: 'Can you help?',
          replyMethodId: 'email',
        },
        model.categories.find((category) => category.id === 'general')
      )
    ).toEqual([]);
  });

  it('parses related-record keys without accepting unsupported types', () => {
    expect(parseContactRecordKey('request:request-1')).toEqual({
      type: 'request',
      id: 'request-1',
    });
    expect(parseContactRecordKey('invoice:invoice-1')).toBeNull();
  });
});
