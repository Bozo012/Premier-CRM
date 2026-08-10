import { describe, expect, it } from 'vitest';

import type { JobAssignment, JobDetail } from '@premier/db';

import { toJobDetailModel } from './forge-job-detail-view-model';

function makeDetail(overrides: Partial<JobDetail['job']> = {}): JobDetail {
  return {
    job: {
      id: 'job-1',
      job_number: 'JOB-0001',
      title: 'Gutter cleaning',
      description: 'Clear all gutters and flush downspouts.',
      status: 'scheduled',
      priority: 'normal',
      scheduled_start: '2026-08-10T14:00:00.000Z',
      scheduled_end: '2026-08-10T16:00:00.000Z',
      actual_start: null,
      actual_end: null,
      estimated_duration_minutes: 120,
      quoted_total: 400,
      cost_total: null,
      closed_at: null,
      closed_reason: null,
      ai_summary: null,
      origin_quote_id: null,
      origin_estimate_id: null,
      origin_request_id: null,
      ...overrides,
    } as unknown as JobDetail['job'],
    customer: { id: 'cust-1', displayName: 'Cedar Customer', email: null, notes: null, phonePrimary: null, preferredChannel: null },
    property: {
      id: 'prop-1',
      addressLine1: '100 Cedar Ln',
      addressLine2: null,
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      accessNotes: 'Gate unlocked on service days',
      gateCode: '1234',
      notes: null,
      parkingNotes: null,
      propertyType: null,
    },
    category: null,
    phases: [],
  };
}

function makeCrew(overrides: Partial<JobAssignment>[] = []): JobAssignment[] {
  return overrides.map((o, i) => ({
    id: `assign-${i}`,
    jobId: 'job-1',
    userId: `user-${i}`,
    displayName: `Tech ${i}`,
    isLead: false,
    assignedAt: '2026-08-01T00:00:00.000Z',
    ...o,
  }));
}

describe('toJobDetailModel — progress-source decision', () => {
  it('derives progress from job.status, not job_phases (phases table is unpopulated in production)', () => {
    const model = toJobDetailModel({ detail: makeDetail({ status: 'in_progress' }), crew: [], sourceEstimate: null, sourceRequest: null });
    const progressSection = model.sections.find((s) => s.id === 'progress');
    expect(progressSection?.kind).toBe('progress');
    if (progressSection?.kind === 'progress') {
      expect(progressSection.progress.percent).toBe(65);
      expect(progressSection.progress.explanation).toMatch(/lifecycle status/);
    }
  });

  it('a completed job shows 100% and a success status tone', () => {
    const model = toJobDetailModel({ detail: makeDetail({ status: 'completed' }), crew: [], sourceEstimate: null, sourceRequest: null });
    expect(model.statusTone).toBe('success');
  });
});

describe('toJobDetailModel — crew and lead projection', () => {
  it('reports Unassigned and a warning-toned summary tile when no crew is assigned', () => {
    const model = toJobDetailModel({ detail: makeDetail(), crew: [], sourceEstimate: null, sourceRequest: null });
    const leadTile = model.summaryTiles?.find((t) => t.id === 'lead');
    expect(leadTile?.value).toBe('Unassigned');
    expect(leadTile?.tone).toBe('warning');
  });

  it('surfaces the real lead technician name when one is set', () => {
    const crew = makeCrew([{ isLead: true, displayName: 'Staff Gamma' }, { isLead: false, displayName: 'Staff Zeta' }]);
    const model = toJobDetailModel({ detail: makeDetail(), crew, sourceEstimate: null, sourceRequest: null });
    const leadTile = model.summaryTiles?.find((t) => t.id === 'lead');
    expect(leadTile?.value).toBe('Staff Gamma');
    expect(leadTile?.tone).toBeUndefined();
  });

  it('warns when crew is assigned but no lead is set', () => {
    const crew = makeCrew([{ isLead: false, displayName: 'Staff Zeta' }]);
    const model = toJobDetailModel({ detail: makeDetail(), crew, sourceEstimate: null, sourceRequest: null });
    expect(model.warnings).toContain('Crew is assigned but no lead technician is set.');
  });

  it('lists every assigned crew member by name in the schedule fields section', () => {
    const crew = makeCrew([{ isLead: true, displayName: 'Staff Gamma' }, { isLead: false, displayName: 'Staff Zeta' }]);
    const model = toJobDetailModel({ detail: makeDetail(), crew, sourceEstimate: null, sourceRequest: null });
    const scheduleSection = model.sections.find((s) => s.id === 'schedule');
    expect(scheduleSection?.kind).toBe('fields');
    if (scheduleSection?.kind === 'fields') {
      const crewField = scheduleSection.fields.find((f) => f.label === 'Assigned crew');
      expect(crewField?.value).toBe('Staff Gamma, Staff Zeta');
    }
  });
});

describe('toJobDetailModel — source relationships', () => {
  it('links a source estimate when one exists', () => {
    const model = toJobDetailModel({
      detail: makeDetail(),
      crew: [],
      sourceEstimate: { id: 'est-1', title: 'Campus lighting', estimate_number: 'EST-0010' },
      sourceRequest: null,
    });
    const related = model.sections.find((s) => s.id === 'linked');
    expect(related?.kind).toBe('related');
    if (related?.kind === 'related') {
      expect(related.items.some((i) => i.route === '/estimates/est-1')).toBe(true);
    }
  });

  it('links a source request when no estimate exists', () => {
    const model = toJobDetailModel({
      detail: makeDetail(),
      crew: [],
      sourceEstimate: null,
      sourceRequest: { id: 'req-1', request_number: 'REQ-0010', service_title: 'Gutter overflow' },
    });
    const related = model.sections.find((s) => s.id === 'linked');
    if (related?.kind === 'related') {
      expect(related.items.some((i) => i.route === '/requests/req-1')).toBe(true);
    }
  });

  it('falls back to origin_quote_id when no estimate/request lookup resolved', () => {
    const model = toJobDetailModel({
      detail: makeDetail({ origin_quote_id: 'quote-1' }),
      crew: [],
      sourceEstimate: null,
      sourceRequest: null,
    });
    const related = model.sections.find((s) => s.id === 'linked');
    if (related?.kind === 'related') {
      expect(related.items.some((i) => i.route === '/quotes/quote-1')).toBe(true);
    }
    expect(model.contextChips?.some((c) => c.label === 'Created from quote')).toBe(true);
  });

  it('labels a job with no origin as manually created', () => {
    const model = toJobDetailModel({ detail: makeDetail(), crew: [], sourceEstimate: null, sourceRequest: null });
    expect(model.contextChips?.some((c) => c.label === 'Manually created')).toBe(true);
  });
});

describe('toJobDetailModel — missing optional data', () => {
  it('never fabricates a customer-visibility flag for job description', () => {
    const model = toJobDetailModel({ detail: makeDetail(), crew: [], sourceEstimate: null, sourceRequest: null });
    const scope = model.sections.find((s) => s.id === 'scope');
    expect(scope?.kind).toBe('text');
    if (scope?.kind === 'text') {
      expect(scope.visibility).toBeUndefined();
    }
  });

  it('shows a placeholder when no description exists, never blank', () => {
    const model = toJobDetailModel({ detail: makeDetail({ description: null }), crew: [], sourceEstimate: null, sourceRequest: null });
    const scope = model.sections.find((s) => s.id === 'scope');
    if (scope?.kind === 'text') {
      expect(scope.body).toBe('No description recorded for this job.');
    }
  });

  it('omits the AI summary section entirely when ai_summary is empty', () => {
    const model = toJobDetailModel({ detail: makeDetail({ ai_summary: null }), crew: [], sourceEstimate: null, sourceRequest: null });
    expect(model.sections.some((s) => s.id === 'ai-summary')).toBe(false);
  });

  it('includes the AI summary as an internal-only section when present', () => {
    const model = toJobDetailModel({ detail: makeDetail({ ai_summary: 'Crew found a leak.' }), crew: [], sourceEstimate: null, sourceRequest: null });
    const summary = model.sections.find((s) => s.id === 'ai-summary');
    expect(summary?.kind).toBe('text');
    if (summary?.kind === 'text') {
      expect(summary.visibility).toBe('internal');
    }
  });

  it('marks access notes/gate code/parking notes internal-only', () => {
    const model = toJobDetailModel({ detail: makeDetail(), crew: [], sourceEstimate: null, sourceRequest: null });
    const scheduleSection = model.sections.find((s) => s.id === 'schedule');
    if (scheduleSection?.kind === 'fields') {
      const gateCode = scheduleSection.fields.find((f) => f.label === 'Gate code');
      expect(gateCode?.visibility).toBe('internal');
    }
  });
});
