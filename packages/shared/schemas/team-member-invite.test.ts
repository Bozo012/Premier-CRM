import { describe, expect, it } from 'vitest';

import { AcceptTeamMemberInviteSchema, TeamMemberInviteSchema } from './team-member-invite';

const UUID = '9f0d1a34-2b7c-4e5f-8a9b-0c1d2e3f4a5b';

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

describe('AcceptTeamMemberInviteSchema', () => {
  const valid = { token: UUID, fullName: 'Jane Doe', password: 'longenoughpassword' };

  it('accepts valid accept-invite input', () => {
    expect(AcceptTeamMemberInviteSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a non-uuid token', () => {
    expect(AcceptTeamMemberInviteSchema.safeParse({ ...valid, token: 'abc' }).success).toBe(
      false
    );
  });

  it('rejects a password shorter than 8 characters', () => {
    expect(AcceptTeamMemberInviteSchema.safeParse({ ...valid, password: 'short' }).success).toBe(
      false
    );
  });
});
