'use client';

// Client component: multi-step decision form with conditional fields and
// server-action submission + toast/redirect feedback.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';

import { recordRequestTriageAction, correctRequestTriageAction } from '../../site-visits/actions';

type Decision = 'remote_estimate' | 'site_visit_required' | 'direct_work_order';

const DECISION_LABELS: Record<Decision, string> = {
  remote_estimate: 'Remote estimate (no visit needed)',
  site_visit_required: 'Site visit required',
  direct_work_order: 'Direct work order (owner/admin only)',
};

interface TriagePanelProps {
  requestId: string;
  triageDecision: Decision | null;
  triageReason: string | null;
  triagedAt: string | null;
  triageCorrectedFrom: string | null;
  triageCorrectionReason: string | null;
  estimateId: string | null;
  jobId: string | null;
  siteVisitId: string | null;
}

export function TriagePanel({
  requestId,
  triageDecision,
  triageReason,
  triagedAt,
  triageCorrectedFrom,
  triageCorrectionReason,
  estimateId,
  jobId,
  siteVisitId,
}: TriagePanelProps) {
  if (!triageDecision) {
    return <DecisionForm requestId={requestId} />;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Triage</h2>
      <div className="rounded-md border bg-muted/20 p-3 text-sm">
        <p>
          <span className="font-medium text-foreground">Decision:</span> {DECISION_LABELS[triageDecision]}
        </p>
        {triageReason ? <p className="mt-1 text-muted-foreground">Reason: {triageReason}</p> : null}
        {triagedAt ? <p className="mt-1 text-xs text-muted-foreground">Recorded {formatDateTime(triagedAt)}</p> : null}
        {triageCorrectedFrom ? (
          <p className="mt-1 text-xs text-[hsl(var(--st-warning-fg))]">
            Corrected from {DECISION_LABELS[triageCorrectedFrom as Decision] ?? triageCorrectedFrom}
            {triageCorrectionReason ? ` — ${triageCorrectionReason}` : ''}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {siteVisitId ? (
            <Link href={`/site-visits/${siteVisitId}`} className="text-sm font-medium underline-offset-2 hover:underline">
              View site visit →
            </Link>
          ) : null}
          {estimateId ? (
            <Link href={`/estimates/${estimateId}`} className="text-sm font-medium underline-offset-2 hover:underline">
              View estimate →
            </Link>
          ) : null}
          {jobId ? (
            <Link href={`/jobs/${jobId}`} className="text-sm font-medium underline-offset-2 hover:underline">
              View job →
            </Link>
          ) : null}
        </div>
      </div>
      <CorrectionForm requestId={requestId} currentDecision={triageDecision} />
    </div>
  );
}

function DecisionForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [decision, setDecision] = useState<Decision | ''>('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set('requestId', requestId);
    startTransition(async () => {
      const result = await recordRequestTriageAction(null, fd);
      if (result.success) {
        toast.success('Triage decision recorded.');
        if (result.data.siteVisitId) router.push(`/site-visits/${result.data.siteVisitId}`);
        else if (result.data.estimateId) router.push(`/estimates/${result.data.estimateId}`);
        else if (result.data.jobId) router.push(`/jobs/${result.data.jobId}`);
        else router.refresh();
      } else {
        toast.error(result.error ?? 'Failed to record triage decision.');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-md border bg-background p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Triage</h2>

      <div className="space-y-1">
        <label htmlFor="decision" className="text-sm font-medium text-foreground">
          Decision
        </label>
        <select
          id="decision"
          name="decision"
          required
          value={decision}
          onChange={(e) => setDecision(e.target.value as Decision)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm"
        >
          <option value="" disabled>
            Select…
          </option>
          {(Object.keys(DECISION_LABELS) as Decision[]).map((d) => (
            <option key={d} value={d}>
              {DECISION_LABELS[d]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="reason" className="text-sm font-medium text-foreground">
          Reason
        </label>
        <textarea
          id="reason"
          name="reason"
          rows={2}
          required={decision === 'direct_work_order'}
          className="flex w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm"
        />
      </div>

      {decision === 'direct_work_order' ? <AuthorizationFields /> : null}

      <button
        type="submit"
        disabled={isPending || !decision}
        className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
      >
        {isPending ? 'Recording…' : 'Record decision'}
      </button>
    </form>
  );
}

function CorrectionForm({ requestId, currentDecision }: { requestId: string; currentDecision: Decision }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [newDecision, setNewDecision] = useState<Decision | ''>('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set('requestId', requestId);
    startTransition(async () => {
      const result = await correctRequestTriageAction(null, fd);
      if (result.success) {
        toast.success('Triage decision corrected.');
        setExpanded(false);
        router.refresh();
      } else {
        toast.error(result.error ?? 'Failed to correct triage decision.');
      }
    });
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Correct this decision (owner/admin)
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-md border border-transparent bg-[hsl(var(--st-warning-bg))] p-4"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--st-warning-fg))]">
        Correct triage decision
      </p>

      <div className="space-y-1">
        <label htmlFor="newDecision" className="text-sm font-medium text-foreground">
          New decision
        </label>
        <select
          id="newDecision"
          name="newDecision"
          required
          value={newDecision}
          onChange={(e) => setNewDecision(e.target.value as Decision)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm"
        >
          <option value="" disabled>
            Select…
          </option>
          {(Object.keys(DECISION_LABELS) as Decision[])
            .filter((d) => d !== currentDecision)
            .map((d) => (
              <option key={d} value={d}>
                {DECISION_LABELS[d]}
              </option>
            ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="correctionReason" className="text-sm font-medium text-foreground">
          Reason for correction
        </label>
        <textarea
          id="correctionReason"
          name="reason"
          rows={2}
          required
          className="flex w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm"
        />
      </div>

      {newDecision === 'direct_work_order' ? <AuthorizationFields /> : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending || !newDecision}
          className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Correcting…' : 'Confirm correction'}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

const AUTHORIZATION_TYPES = [
  { value: 'internal', label: 'Internal (owner/admin discretion)' },
  { value: 'standing_agreement', label: 'Standing agreement' },
  { value: 'written_customer_authorization', label: 'Written customer authorization' },
  { value: 'verbal_customer_authorization', label: 'Verbal customer authorization' },
  { value: 'emergency', label: 'Emergency' },
] as const;

function AuthorizationFields() {
  const [authType, setAuthType] = useState('');

  const needsContact = authType === 'written_customer_authorization' || authType === 'verbal_customer_authorization';
  const needsNote = authType === 'verbal_customer_authorization';
  const needsReference = authType === 'standing_agreement';

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="space-y-1">
        <label htmlFor="authorizationType" className="text-sm font-medium text-foreground">
          Authorization type
        </label>
        <select
          id="authorizationType"
          name="authorizationType"
          required
          value={authType}
          onChange={(e) => setAuthType(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm"
        >
          <option value="" disabled>
            Select…
          </option>
          {AUTHORIZATION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {needsContact ? (
        <>
          <div className="space-y-1">
            <label htmlFor="authorizedCustomerContact" className="text-sm font-medium text-foreground">
              Authorized by (customer contact)
            </label>
            <input
              id="authorizedCustomerContact"
              name="authorizedCustomerContact"
              type="text"
              required
              className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="authorizedAt" className="text-sm font-medium text-foreground">
              Authorized at
            </label>
            <input
              id="authorizedAt"
              name="authorizedAt"
              type="datetime-local"
              required
              className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm"
            />
          </div>
        </>
      ) : null}

      {needsNote ? (
        <div className="space-y-1">
          <label htmlFor="authorizationNote" className="text-sm font-medium text-foreground">
            Note (what was said)
          </label>
          <textarea
            id="authorizationNote"
            name="authorizationNote"
            rows={2}
            required
            className="flex w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm"
          />
        </div>
      ) : null}

      {needsReference ? (
        <div className="space-y-1">
          <label htmlFor="authorizationReference" className="text-sm font-medium text-foreground">
            Agreement reference
          </label>
          <input
            id="authorizationReference"
            name="authorizationReference"
            type="text"
            required
            className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm"
          />
        </div>
      ) : null}

      <div className="space-y-1">
        <label htmlFor="notToExceedAmount" className="text-sm font-medium text-foreground">
          Not-to-exceed amount <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input
          id="notToExceedAmount"
          name="notToExceedAmount"
          type="number"
          step="0.01"
          className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm"
        />
      </div>
    </div>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
