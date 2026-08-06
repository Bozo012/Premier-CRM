import { describe, expect, it } from 'vitest';

import { toUserFacingError } from './error-translation';

describe('toUserFacingError', () => {
  it('translates a raw capability-denial RPC message into plain language', () => {
    expect(toUserFacingError('Role does not have canApproveEstimatePricing')).toBe(
      "You don't have permission to do this. Ask an owner or administrator."
    );
  });

  it('translates any capability name, not just pricing approval', () => {
    expect(toUserFacingError('Role does not have canCreateQuote')).toBe(
      "You don't have permission to do this. Ask an owner or administrator."
    );
  });

  it('never leaks the internal capability identifier in the translated message', () => {
    const translated = toUserFacingError('Role does not have canApproveEstimatePricing');
    expect(translated).not.toContain('canApproveEstimatePricing');
    expect(translated).not.toContain('role_has_capability');
  });

  it('leaves unrelated error messages unchanged', () => {
    expect(toUserFacingError('Site visit not found')).toBe('Site visit not found');
    expect(toUserFacingError('Estimate pricing is already approved')).toBe(
      'Estimate pricing is already approved'
    );
  });
});
