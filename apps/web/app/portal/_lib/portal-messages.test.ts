import { describe, expect, it } from 'vitest';

import { extractCategory, extractSubject } from './portal-messages';

describe('extractSubject', () => {
  it('pulls the Subject line out of the stored activity_log message', () => {
    const message = [
      'Portal contact PC-ABC123',
      'Category: Billing question',
      'Subject: Question about my invoice',
      'Reply by: Email',
      'Message: When is my invoice due?',
    ].join('\n');

    expect(extractSubject(message)).toBe('Question about my invoice');
  });

  it('falls back to a generic label when there is no message or no Subject line', () => {
    expect(extractSubject(null)).toBe('Portal message');
    expect(extractSubject('Category: General')).toBe('Portal message');
  });
});

describe('extractCategory', () => {
  it('pulls the Category line out of the stored activity_log message', () => {
    const message = ['Portal contact PC-XYZ', 'Category: Scheduling', 'Subject: Reschedule'].join('\n');
    expect(extractCategory(message)).toBe('Scheduling');
  });

  it('returns null when there is no Category line', () => {
    expect(extractCategory(null)).toBeNull();
    expect(extractCategory('Subject: Hello')).toBeNull();
  });
});
