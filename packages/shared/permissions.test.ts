import { describe, expect, it } from 'vitest';

import { CAPABILITIES, hasCapability, type OrgRole } from './permissions';

const ALL_ROLES: readonly OrgRole[] = ['owner', 'admin', 'employee', 'subcontractor', 'viewer'];

/**
 * `canPublishCustomerMedia` (docs/implementation/customer-safe-photo-
 * visibility-design.md, PR #141) must resolve identically here and in
 * `role_has_capability()` (20260811030000_customer_safe_photo_visibility.sql)
 * — the SQL side is the real enforcement boundary (every RPC checks it, not
 * the UI), so a mismatch is a security defect, not a UX bug. This literal
 * expected-role-set mirror is the app-side half of that parity check; the
 * SQL side is proven live (real RPC calls per role) in
 * tests/e2e/customer-safe-photo-visibility-bot.spec.ts, which is the
 * stronger of the two proofs since it exercises the actual enforcement
 * boundary rather than a second hand-copied literal.
 */
describe('canPublishCustomerMedia — owner/admin only', () => {
  const EXPECTED_ALLOWED: readonly OrgRole[] = ['owner', 'admin'];

  it.each(ALL_ROLES)('role=%s', (role) => {
    expect(hasCapability(role, 'canPublishCustomerMedia')).toBe(EXPECTED_ALLOWED.includes(role));
  });

  it('never falls back to a broader media capability like canScheduleJobs', () => {
    expect(CAPABILITIES.canPublishCustomerMedia).not.toEqual(CAPABILITIES.canScheduleJobs);
    expect(hasCapability('employee', 'canScheduleJobs')).toBe(true);
    expect(hasCapability('employee', 'canPublishCustomerMedia')).toBe(false);
    expect(hasCapability('subcontractor', 'canScheduleJobs')).toBe(true);
    expect(hasCapability('subcontractor', 'canPublishCustomerMedia')).toBe(false);
  });
});

/**
 * `canReplyToCustomers` (Customer / Staff Threaded Messaging V1, PR #144)
 * must resolve identically here and in `role_has_capability()`
 * (20260812020000_customer_reply_capability.sql) — same parity discipline as
 * canPublishCustomerMedia above. A staff reply is an outward-facing
 * communication made as Premier Property Maintenance, so subcontractor is
 * deliberately excluded despite holding canScheduleJobs/canTriageRequests;
 * viewer never gets write capabilities anywhere in this codebase. The SQL
 * side is proven live in
 * tests/e2e/customer-staff-threaded-messaging-bot.spec.ts.
 */
describe('canReplyToCustomers — owner/admin/employee only', () => {
  const EXPECTED_ALLOWED: readonly OrgRole[] = ['owner', 'admin', 'employee'];

  it.each(ALL_ROLES)('role=%s', (role) => {
    expect(hasCapability(role, 'canReplyToCustomers')).toBe(EXPECTED_ALLOWED.includes(role));
  });

  it('does not grant subcontractor customer-communication authority despite operational capabilities', () => {
    expect(hasCapability('subcontractor', 'canScheduleJobs')).toBe(true);
    expect(hasCapability('subcontractor', 'canReplyToCustomers')).toBe(false);
    expect(hasCapability('viewer', 'canReplyToCustomers')).toBe(false);
  });
});
