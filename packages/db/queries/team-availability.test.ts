import { describe, expect, it } from 'vitest';

import {
  formatTeamAvailabilityLabel,
  isTeamAvailabilityStatus,
  resolveDisplayedTeamAvailability,
} from './team-availability';

describe('team availability model', () => {
  it('lets explicit leave and off-shift override active assignments', () => {
    expect(resolveDisplayedTeamAvailability({ manualStatus: 'on_leave', activeAssignmentCount: 3 })).toBe('on_leave');
    expect(resolveDisplayedTeamAvailability({ manualStatus: 'off_shift', activeAssignmentCount: 1 })).toBe('off_shift');
  });

  it('derives on-job from real active assignments when the manual status is available', () => {
    expect(resolveDisplayedTeamAvailability({ manualStatus: 'available', activeAssignmentCount: 2 })).toBe('on_job');
    expect(resolveDisplayedTeamAvailability({ manualStatus: null, activeAssignmentCount: 0 })).toBe('available');
  });

  it('exposes the exact Base44 availability vocabulary', () => {
    expect(isTeamAvailabilityStatus('available')).toBe(true);
    expect(isTeamAvailabilityStatus('on_job')).toBe(true);
    expect(isTeamAvailabilityStatus('off_shift')).toBe(true);
    expect(isTeamAvailabilityStatus('on_leave')).toBe(true);
    expect(isTeamAvailabilityStatus('busy')).toBe(false);
    expect(formatTeamAvailabilityLabel('on_job')).toBe('On job');
  });
});
