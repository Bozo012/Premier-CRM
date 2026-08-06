'use client';

// Client component: multi-step wizard shell with local step navigation +
// debounced autosave per field — requires local input state and timers, so
// it can't be a server component.
//
// Ported from Base44 Forge-Base44-UX @ 497d0693 —
// src/components/forge/site-inspection/InspectionWorkflow.tsx (step header,
// progress rail, sticky bottom action bar). Base44's InspectionWorkflow was
// fixture-driven with a fixed contract (arrival/findings/measurements/
// recommendations/review sub-objects with hardcoded shapes — checklist,
// hazards, findings with condition/severity, etc.) that has no real backing
// in this codebase's template-driven inspection schema (see
// packages/shared/schemas/site-visit-inspection.ts). This port keeps Base44's
// VISUAL structure (step rail, sticky Cancel/Back/Continue/Complete bar,
// StepSection cards) but distributes the REAL inspection template's field
// definitions across the 5 steps by key, and reuses the exact same
// FieldEditor/ListFieldEditor field-type rendering and
// saveSiteVisitInspectionAction/completeSiteVisitWithValidationAction
// mechanism the previous flat inspection-form.tsx used — no new persistence
// mechanism, no bypassed validation.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';

import type { InspectionFieldDefinition } from '@premier/shared';
import { validateRequiredFieldsPresent } from '@premier/shared';

import { saveSiteVisitInspectionAction, completeSiteVisitWithValidationAction } from '../actions';
import { FieldEditor, SaveIndicator, type SaveState } from './inspection-field-editor';

const STEP_ORDER = ['arrival', 'findings', 'measurements', 'recommendations', 'review'] as const;
export type InspectionStepId = (typeof STEP_ORDER)[number];

const STEP_LABEL: Record<InspectionStepId, string> = {
  arrival: 'Arrival',
  findings: 'Findings',
  measurements: 'Measurements & Photos',
  recommendations: 'Recommendations',
  review: 'Review',
};

/**
 * Real-field-key → step assignment. Grouping decision (documented in
 * docs/ux/base44-exact-requests-site-visits-report.md): arrival/context
 * fields the inspector confirms on arrival, observed-condition findings,
 * the list-type field-data-capture fields (measurements/quantities/
 * materials/photos), pricing-facing recommendations, then a read-only
 * review-and-submit step. Any future template field not in this map falls
 * back to "findings" (the closest general-purpose step) rather than being
 * silently dropped.
 */
const FIELD_STEP: Record<string, InspectionStepId> = {
  customerConcerns: 'arrival',
  accessIssues: 'arrival',
  hazards: 'arrival',
  observedConditions: 'findings',
  notes: 'findings',
  measurements: 'measurements',
  quantities: 'measurements',
  materialsNeeded: 'measurements',
  photos: 'measurements',
  laborAssumptions: 'recommendations',
  recommendations: 'recommendations',
  proposedScope: 'recommendations',
  estimatedDurationHours: 'recommendations',
  followUpNeeded: 'recommendations',
};

function stepForField(key: string): InspectionStepId {
  return FIELD_STEP[key] ?? 'findings';
}

const AUTOSAVE_DELAY_MS = 1200;

interface InspectionWorkflowProps {
  siteVisitId: string;
  visitNumber: string;
  customerName: string;
  propertyAddress: string | null;
  fieldDefinitions: InspectionFieldDefinition[];
  initialResponses: Record<string, unknown>;
  readOnly: boolean;
}

export function InspectionWorkflow({
  siteVisitId,
  visitNumber,
  customerName,
  propertyAddress,
  fieldDefinitions,
  initialResponses,
  readOnly,
}: InspectionWorkflowProps) {
  const router = useRouter();
  const [responses, setResponses] = useState<Record<string, unknown>>(initialResponses);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [isCompleting, setIsCompleting] = useState(false);
  // A read-only (already-completed) visit opens straight on the Review step
  // — that's the summary a returning staff member actually wants, and it's
  // also what makes every recorded response visible without extra clicks.
  const [activeStep, setActiveStep] = useState<InspectionStepId>(readOnly ? 'review' : 'arrival');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const fieldsByStep = useMemo(() => {
    const grouped = new Map<InspectionStepId, InspectionFieldDefinition[]>();
    for (const step of STEP_ORDER) grouped.set(step, []);
    for (const field of [...fieldDefinitions].sort((a, b) => a.displayOrder - b.displayOrder)) {
      grouped.get(stepForField(field.key))!.push(field);
    }
    return grouped;
  }, [fieldDefinitions]);

  const blockingReasons = useMemo(
    () => validateRequiredFieldsPresent(responses, fieldDefinitions).map((e) => e.message),
    [responses, fieldDefinitions]
  );
  const canComplete = blockingReasons.length === 0;

  const stepComplete = useMemo(() => {
    const result: Record<InspectionStepId, boolean> = {
      arrival: true,
      findings: true,
      measurements: true,
      recommendations: true,
      review: canComplete,
    };
    for (const step of STEP_ORDER) {
      if (step === 'review') continue;
      const fields = fieldsByStep.get(step) ?? [];
      result[step] = fields
        .filter((f) => f.required)
        .every((f) => !isEmptyValue(responses[f.key]));
    }
    return result;
  }, [fieldsByStep, responses, canComplete]);

  const scheduleAutosave = (key: string, value: unknown) => {
    if (readOnly) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void (async () => {
        setSaveState('saving');
        const result = await saveSiteVisitInspectionAction(siteVisitId, fieldDefinitions, { [key]: value });
        setSaveState(result.success ? 'saved' : 'error');
        if (!result.success) toast.error(result.error ?? 'Autosave failed.');
      })();
    }, AUTOSAVE_DELAY_MS);
  };

  const updateField = (key: string, value: unknown) => {
    setResponses((prev) => ({ ...prev, [key]: value }));
    scheduleAutosave(key, value);
  };

  const handleComplete = async () => {
    setIsCompleting(true);
    const result = await completeSiteVisitWithValidationAction(siteVisitId, fieldDefinitions, responses);
    setIsCompleting(false);
    if (result.success) {
      toast.success('Inspection completed.');
      router.push(`/site-visits/${siteVisitId}`);
    } else {
      toast.error(result.error ?? 'Cannot complete: some required fields are missing.');
    }
  };

  const index = STEP_ORDER.indexOf(activeStep);
  const isLast = index === STEP_ORDER.length - 1;
  const prevStep = index > 0 ? STEP_ORDER[index - 1] : null;
  const nextStep = !isLast ? STEP_ORDER[index + 1] : null;
  const activeFields = fieldsByStep.get(activeStep) ?? [];

  return (
    <div>
      <header className="border-b bg-card px-4 pt-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl pb-1">
          <p className="text-sm font-bold text-primary">Inspection — {visitNumber}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {customerName}
            {propertyAddress ? ` · ${propertyAddress}` : ''}
          </p>

          <nav aria-label="Inspection steps" className="mt-4 -mx-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
            <ol className="flex min-w-max items-center gap-1.5">
              {STEP_ORDER.map((step, i) => {
                const active = step === activeStep;
                const complete = stepComplete[step];
                return (
                  <li key={step} className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setActiveStep(step)}
                      aria-current={active ? 'step' : undefined}
                      className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        active
                          ? 'bg-primary text-primary-foreground'
                          : complete
                          ? 'bg-emerald-500/15 text-foreground'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <span
                        className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] ${
                          active ? 'bg-white/25' : complete ? 'bg-emerald-500 text-white' : 'bg-border'
                        }`}
                      >
                        {complete && !active ? <Check className="h-2.5 w-2.5" aria-hidden="true" /> : i + 1}
                      </span>
                      {STEP_LABEL[step]}
                    </button>
                    {i < STEP_ORDER.length - 1 && <span aria-hidden="true" className="h-px w-3 bg-border" />}
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-40 pt-5 sm:px-6 lg:px-8 lg:pb-28">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">
            Step {index + 1} of {STEP_ORDER.length} — {STEP_LABEL[activeStep]}
          </h2>
          <p className="text-xs text-muted-foreground">
            {readOnly ? 'Findings locked (visit completed).' : <SaveIndicator state={saveState} />}
          </p>
        </div>

        {activeStep === 'review' ? (
          <ReviewStep responses={responses} fieldDefinitions={fieldDefinitions} blockingReasons={blockingReasons} />
        ) : (
          <div className="space-y-4">
            {activeFields.length === 0 ? (
              <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground shadow-sm">
                No fields in this step for the current inspection template.
              </p>
            ) : (
              activeFields.map((field) => (
                <section key={field.key} className="rounded-2xl border bg-card p-4 shadow-sm">
                  <FieldEditor
                    field={field}
                    value={responses[field.key]}
                    readOnly={readOnly}
                    siteVisitId={siteVisitId}
                    onChange={(value) => updateField(field.key, value)}
                  />
                </section>
              ))
            )}
          </div>
        )}
      </main>

      {!readOnly ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg md:pb-3">
          <div className="mx-auto flex max-w-4xl items-center gap-2">
            <button
              type="button"
              onClick={() => router.push(`/site-visits/${siteVisitId}`)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border bg-secondary px-3 text-sm font-bold text-secondary-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Cancel</span>
            </button>
            {prevStep && (
              <button
                type="button"
                onClick={() => setActiveStep(prevStep)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border bg-secondary px-3 text-sm font-bold text-secondary-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Back</span>
              </button>
            )}
            {nextStep ? (
              <button
                type="button"
                onClick={() => setActiveStep(nextStep)}
                className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:opacity-90 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Continue
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleComplete}
                disabled={!canComplete || isCompleting}
                aria-describedby={!canComplete ? 'insp-complete-blocked' : undefined}
                className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {isCompleting ? 'Completing…' : 'Complete inspection'}
              </button>
            )}
          </div>
          {!canComplete && isLast && (
            <p id="insp-complete-blocked" className="mx-auto mt-1.5 max-w-4xl text-xs font-semibold text-muted-foreground">
              {blockingReasons[0] ?? 'Finish the required steps to complete.'}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ReviewStep({
  responses,
  fieldDefinitions,
  blockingReasons,
}: {
  responses: Record<string, unknown>;
  fieldDefinitions: InspectionFieldDefinition[];
  blockingReasons: string[];
}) {
  const sorted = [...fieldDefinitions].sort((a, b) => a.displayOrder - b.displayOrder);
  const filled = sorted.filter((f) => !isEmptyValue(responses[f.key]));

  return (
    <div className="space-y-4">
      {blockingReasons.length > 0 ? (
        <section className="rounded-2xl border border-amber-400/50 bg-amber-500/10 p-4">
          <h3 className="text-sm font-bold text-foreground">Not ready to complete</h3>
          <ul className="mt-2 space-y-1">
            {blockingReasons.map((r) => (
              <li key={r} className="text-sm font-semibold text-foreground">
                • {r}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            Ready to complete.
          </p>
        </section>
      )}

      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="text-sm font-bold text-card-foreground">Inspection summary</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {filled.length}/{fieldDefinitions.length} fields recorded.
        </p>
        <div className="mt-3 grid gap-3">
          {filled.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            filled.map((field) => (
              <div key={field.key} className="rounded-xl border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{field.label}</p>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      field.visibility === 'internal_and_estimate_source'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {field.visibility === 'internal_and_estimate_source' ? 'Feeds estimate' : 'Internal only'}
                  </span>
                </div>
                <div className="mt-1 text-sm text-card-foreground">
                  <FormattedValue value={responses[field.key]} />
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function FormattedValue({ value }: { value: unknown }) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <span>{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">None</span>;
    return (
      <ul className="space-y-1">
        {value.map((entry, index) => (
          <li key={index}>{formatEntry(entry)}</li>
        ))}
      </ul>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

function formatEntry(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(', ');
  }
  return 'Recorded';
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0) || (Array.isArray(value) && value.length === 0);
}
