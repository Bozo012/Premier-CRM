import { describe, expect, it } from 'vitest';

import { TeamMemberInviteSchema } from './team-member-invite';

describe('TeamMemberInviteSchema', () => {
  const valid = { email: 'jane@example.com', fullName: 'Jane Doe', role: 'employee' };

  it('accepts a valid invite', () => {
    expect(TeamMemberInviteSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an invalid email', () => {
    expect(TeamMemberInviteSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(
      false
    );
  });

  it('rejects an empty full name', () => {
    expect(TeamMemberInviteSchema.safeParse({ ...valid, fullName: '' }).success).toBe(false);
  });

  it('rejects owner as an invite role — owner is never granted through invites', () => {
    expect(TeamMemberInviteSchema.safeParse({ ...valid, role: 'owner' }).success).toBe(false);
  });

  it('accepts admin/subcontractor/viewer roles', () => {
    for (const role of ['admin', 'subcontractor', 'viewer']) {
      expect(TeamMemberInviteSchema.safeParse({ ...valid, role }).success).toBe(true);
    }
  });
});
