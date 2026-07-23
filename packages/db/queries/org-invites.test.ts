import { describe, expect, it } from 'vitest';

import { ErrorCode } from '@premier/shared';

import { translateAcceptInviteError } from './org-invites';

describe('translateAcceptInviteError', () => {
  it('maps "invite not found" to VALIDATION_ERROR', () => {
    const result = translateAcceptInviteError('Invite not found.');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('maps "already been used" to VALIDATION_ERROR', () => {
    const result = translateAcceptInviteError(
      'This invite has already been used or is no longer valid.'
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('maps "expired" to VALIDATION_ERROR', () => {
    const result = translateAcceptInviteError('This invite has expired.');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('maps email-mismatch to VALIDATION_ERROR', () => {
    const result = translateAcceptInviteError(
      'This invite was issued to a different email address.'
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('maps the on-behalf-of guard to VALIDATION_ERROR', () => {
    const result = translateAcceptInviteError('Cannot accept an invite on behalf of another user.');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('treats any other database error as DB_ERROR', () => {
    const result = translateAcceptInviteError(
      'duplicate key value violates unique constraint "org_invites_token_unique"'
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe(ErrorCode.DB_ERROR);
  });
});
