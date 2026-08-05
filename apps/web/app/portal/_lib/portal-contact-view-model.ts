export type PortalContactRecordType = 'request' | 'property';

export interface PortalContactRecord {
  id: string;
  type: PortalContactRecordType;
  label: string;
  sublabel?: string;
}

export interface PortalContactCategory {
  id: string;
  label: string;
  helpText: string;
  recordTypes: PortalContactRecordType[];
  requiresRecord: boolean;
  expectedResponse: string;
}

export interface PortalContactReplyMethod {
  id: string;
  label: string;
  detail: string;
}

export interface PortalContactDraft {
  categoryId: string;
  relatedRecordKey: string;
  subject: string;
  message: string;
  replyMethodId: string;
}

export interface PortalContactViewModel {
  customerEmail: string;
  categories: PortalContactCategory[];
  records: PortalContactRecord[];
  replyMethods: PortalContactReplyMethod[];
  business: {
    phone: string;
    email: string;
    hoursLabel: string;
  };
}

export interface PortalContactServiceRequest {
  id: string;
  request_number: string;
  service_title: string;
  status: string;
  submitted_at: string;
}

export interface PortalContactProperty {
  relationship: string | null;
  is_primary: boolean | null;
  properties: {
    id: string;
    address_line_1: string;
    city: string;
    state: string;
    zip: string;
  } | null;
}

export const PORTAL_CONTACT_CATEGORIES: PortalContactCategory[] = [
  {
    id: 'request_status',
    label: 'Question about a request',
    helpText: 'Ask about an active or completed service request.',
    recordTypes: ['request'],
    requiresRecord: true,
    expectedResponse: 'Premier will review the request and follow up through your selected reply method.',
  },
  {
    id: 'scheduling',
    label: 'Scheduling question',
    helpText: 'Ask about timing, access, or scheduling preferences.',
    recordTypes: ['request', 'property'],
    requiresRecord: false,
    expectedResponse: 'Premier will confirm scheduling details before making any calendar changes.',
  },
  {
    id: 'property',
    label: 'Property question',
    helpText: 'Ask about a property linked to your portal account.',
    recordTypes: ['property'],
    requiresRecord: true,
    expectedResponse: 'Premier will review the property details and follow up if records need to be updated.',
  },
  {
    id: 'billing',
    label: 'Billing question',
    helpText: 'Ask about invoices, payments, or account balance.',
    recordTypes: [],
    requiresRecord: false,
    expectedResponse: 'Premier will review billing details and reply through your selected method.',
  },
  {
    id: 'general',
    label: 'General question',
    helpText: 'Send a general note to Premier.',
    recordTypes: [],
    requiresRecord: false,
    expectedResponse: 'Premier will route your message to the right person.',
  },
];

export const PORTAL_CONTACT_REPLY_METHODS: PortalContactReplyMethod[] = [
  { id: 'email', label: 'Email', detail: 'Reply to the email on this portal account' },
  { id: 'phone', label: 'Phone', detail: 'Call the phone number Premier has on file' },
];

export function emptyPortalContactDraft(): PortalContactDraft {
  return {
    categoryId: '',
    relatedRecordKey: '',
    subject: '',
    message: '',
    replyMethodId: 'email',
  };
}

export function buildPortalContactViewModel({
  customerEmail,
  properties,
  serviceRequests,
}: {
  customerEmail: string;
  properties: PortalContactProperty[];
  serviceRequests: PortalContactServiceRequest[];
}): PortalContactViewModel {
  return {
    customerEmail,
    categories: PORTAL_CONTACT_CATEGORIES,
    records: [
      ...serviceRequests.slice(0, 20).map((request) => ({
        id: contactRecordKey('request', request.id),
        type: 'request' as const,
        label: `${request.request_number} · ${request.service_title}`,
        sublabel: `${formatEnumLabel(request.status)} · ${formatDate(request.submitted_at)}`,
      })),
      ...properties.flatMap((row) => {
        if (!row.properties) return [];
        return [
          {
            id: contactRecordKey('property', row.properties.id),
            type: 'property' as const,
            label: formatPropertyAddress(row.properties),
            sublabel: [row.relationship ?? 'customer', row.is_primary ? 'primary' : null]
              .filter(Boolean)
              .join(' · '),
          },
        ];
      }),
    ],
    replyMethods: PORTAL_CONTACT_REPLY_METHODS,
    business: {
      phone: '(859) 555-0198',
      email: 'support@ppmnky.com',
      hoursLabel: 'Monday–Friday, 8 AM–5 PM',
    },
  };
}

export function recordsForCategory(
  records: PortalContactRecord[],
  category?: PortalContactCategory
): PortalContactRecord[] {
  if (!category) return [];
  return records.filter((record) => category.recordTypes.includes(record.type));
}

export function contactBlockingReasons(
  draft: PortalContactDraft,
  category?: PortalContactCategory
): string[] {
  const reasons: string[] = [];
  if (!draft.categoryId) reasons.push('Choose what your message is about.');
  if (category?.requiresRecord && !draft.relatedRecordKey) {
    reasons.push('Select the record your question is about.');
  }
  if (!draft.subject.trim()) reasons.push('Add a short subject.');
  if (!draft.message.trim()) reasons.push('Write your message.');
  if (!draft.replyMethodId) reasons.push('Choose how you would like us to reply.');
  return reasons;
}

export function contactRecordKey(type: PortalContactRecordType, id: string): string {
  return `${type}:${id}`;
}

export function parseContactRecordKey(value: string): { type: PortalContactRecordType; id: string } | null {
  const [type, id] = value.split(':');
  if ((type === 'request' || type === 'property') && id) {
    return { type, id };
  }
  return null;
}

export function formatEnumLabel(value: string): string {
  return value
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatPropertyAddress(property: NonNullable<PortalContactProperty['properties']>): string {
  return `${property.address_line_1}, ${property.city}, ${property.state} ${property.zip}`;
}
