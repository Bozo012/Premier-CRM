'use client'; // Every action here is a click handler (back, action buttons, related-record navigation).

// Ported from Base44 Forge-Base44-UX @ 497d0693 —
// src/components/forge/detail/RecordDetailView.tsx. Markup/layout/mobile
// sticky-action-bar behavior unchanged; `forge-*` -> existing tokens.
import { AlertTriangle, ArrowLeft, ChevronRight, Lock, SearchX } from 'lucide-react';

import { DetailSectionView } from './DetailSections';
import { DetailStatusBadge } from './DetailStatusBadge';
import type { DetailAction, RecordDetailCallbacks, RecordDetailState } from './recordDetail.types';

function BackButton({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {label}
    </button>
  );
}

function ActionButton({ action, onAction, primary }: { action: DetailAction; onAction: (id: string) => void; primary?: boolean }) {
  const base =
    'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-bold transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const style = primary
    ? 'bg-primary text-primary-foreground hover:opacity-90'
    : action.kind === 'danger'
      ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-300'
      : 'border border-border bg-secondary text-secondary-foreground hover:bg-muted';
  return (
    <button
      type="button"
      disabled={action.disabled}
      title={action.unavailableReason}
      aria-describedby={action.disabled && action.unavailableReason ? `${action.id}-reason` : undefined}
      onClick={() => onAction(action.id)}
      className={`${base} ${style}`}
    >
      {action.label}
    </button>
  );
}

/**
 * Portable record-detail presentation. Every field, status, action, warning and
 * related record is supplied through `state.model` — this component holds no
 * fixtures, routing, calculation, permission or workflow logic.
 */
export function RecordDetailView({ state, callbacks }: { state: RecordDetailState; callbacks: RecordDetailCallbacks }) {
  const { model, isLoading, error } = state;

  if (isLoading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <p role="status" className="text-sm font-semibold text-muted-foreground">
          Loading record…
        </p>
        <div className="mt-4 space-y-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          <h1 className="mt-2 text-lg font-bold">This record could not be shown</h1>
          <p className="mt-1 text-sm">{error}</p>
        </div>
        <div className="mt-4">
          <BackButton label="Back" onBack={callbacks.onBack} />
        </div>
      </main>
    );
  }

  if (!model) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div role="alert" className="rounded-2xl border border-border bg-card p-5 text-center">
          <SearchX className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden="true" />
          <h1 className="mt-2 text-lg font-bold text-card-foreground">Record not found</h1>
          <p className="mt-1 text-sm text-muted-foreground">This record does not exist, or the link used an unknown ID.</p>
          <div className="mt-4 flex justify-center">
            <BackButton label="Back to list" onBack={callbacks.onBack} />
          </div>
        </div>
      </main>
    );
  }

  const secondary = model.secondaryActions || [];

  return (
    <main className="mx-auto max-w-5xl px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-10">
      <BackButton label={model.backLabel} onBack={callbacks.onBack} />

      {/* Header: identity, plain-language title, status, context, next action */}
      <header className="mt-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">{model.recordType}</span>
          <span className="font-mono text-xs font-bold text-muted-foreground">{model.identity}</span>
          <DetailStatusBadge label={model.statusLabel} tone={model.statusTone} />
        </div>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-foreground">{model.title}</h1>

        {model.contextChips && model.contextChips.length > 0 && (
          <nav aria-label="Record context" className="mt-2 flex flex-wrap gap-2">
            {model.contextChips.map((chip) =>
              chip.route ? (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => callbacks.onOpenRelated({ id: chip.id, label: chip.label, route: chip.route })}
                  className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border bg-card px-3 text-xs font-bold text-card-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {chip.label} <ChevronRight className="h-3 w-3" aria-hidden="true" />
                </button>
              ) : (
                <span key={chip.id} className="inline-flex min-h-9 items-center rounded-full bg-muted px-3 text-xs font-bold text-muted-foreground">
                  {chip.label}
                </span>
              )
            )}
          </nav>
        )}
      </header>

      {model.readOnlyNotice && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-muted px-3 py-2.5 text-xs font-semibold text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {model.readOnlyNotice}
        </p>
      )}

      {model.warnings && model.warnings.length > 0 && (
        <ul className="mt-3 space-y-2">
          {model.warnings.map((w) => (
            <li
              key={w}
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-800"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {w}
            </li>
          ))}
        </ul>
      )}

      {model.summaryTiles && model.summaryTiles.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {model.summaryTiles.map((t) => (
            <div key={t.id} className="rounded-xl border border-border bg-card px-3 py-2.5">
              <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t.label}</dt>
              <dd
                className={`mt-0.5 text-sm font-bold ${t.tone === 'warning' ? 'text-amber-700 dark:text-amber-400' : t.tone === 'danger' ? 'text-red-700 dark:text-red-400' : 'text-card-foreground'}`}
              >
                {t.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {model.nextAction && (
        <div className="mt-4 rounded-2xl border border-border bg-muted/30 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Next action</p>
          <p className="mt-0.5 text-sm font-bold text-card-foreground">{model.nextAction.label}</p>
          {model.nextAction.detail && <p className="mt-0.5 text-xs text-muted-foreground">{model.nextAction.detail}</p>}
        </div>
      )}

      {/* Desktop actions live with the record; mobile uses the sticky bar below. */}
      {(model.primaryAction || secondary.length > 0) && (
        <div className="mt-4 hidden flex-wrap items-center gap-2 lg:flex">
          {model.primaryAction && <ActionButton action={model.primaryAction} onAction={callbacks.onAction} primary />}
          {secondary.map((a) => (
            <ActionButton key={a.id} action={a} onAction={callbacks.onAction} />
          ))}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {model.sections.map((s) => (
          <DetailSectionView key={s.id} section={s} onOpenRelated={callbacks.onOpenRelated} />
        ))}
      </div>

      {/* Mobile: secondary actions inline (never hidden behind the sticky bar). */}
      {secondary.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 lg:hidden">
          {secondary.map((a) => (
            <ActionButton key={a.id} action={a} onAction={callbacks.onAction} />
          ))}
        </div>
      )}

      {model.primaryAction && (
        <div className="fixed inset-x-0 bottom-[max(4rem,calc(3.75rem+env(safe-area-inset-bottom)))] z-30 border-t border-border bg-card px-4 py-2.5 shadow-lg lg:hidden">
          <button
            type="button"
            disabled={model.primaryAction.disabled}
            onClick={() => callbacks.onAction(model.primaryAction!.id)}
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {model.primaryAction.label}
          </button>
        </div>
      )}
    </main>
  );
}
