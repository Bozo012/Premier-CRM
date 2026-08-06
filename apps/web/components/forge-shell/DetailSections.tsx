// Ported from Base44 Forge-Base44-UX @ 497d0693 —
// src/components/forge/detail/DetailSections.tsx. Markup unchanged;
// `forge-*` -> existing tokens; Base44's `@/components/ui/image` wrapper
// (not present in this project) replaced with a plain `<img>` for the
// `media` section kind — Customers doesn't use this section kind, so it is
// unexercised by this PR but kept for parity with the generic detail kit.
import { ChevronRight, Eye, Lock } from 'lucide-react';

import { DetailStatusBadge } from './DetailStatusBadge';
import type { DetailField, DetailSection, RelatedRecord } from './recordDetail.types';

function VisibilityTag({ visibility }: { visibility?: 'internal' | 'customer' }) {
  if (!visibility) return null;
  const internal = visibility === 'internal';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${internal ? 'bg-muted text-muted-foreground' : 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'}`}
    >
      {internal ? <Lock className="h-3 w-3" aria-hidden="true" /> : <Eye className="h-3 w-3" aria-hidden="true" />}
      {internal ? 'Internal only' : 'Customer-visible'}
    </span>
  );
}

function FieldRow({ field }: { field: DetailField }) {
  const tone = field.tone === 'warning' ? 'text-amber-700 dark:text-amber-400' : field.tone === 'danger' ? 'text-red-700 dark:text-red-400' : 'text-card-foreground';
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/60 py-2 last:border-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{field.label}</dt>
      <dd className={`flex items-center gap-2 text-sm font-semibold sm:text-right ${tone}`}>
        <span>{field.value}</span>
        <VisibilityTag visibility={field.visibility} />
      </dd>
    </div>
  );
}

function RelatedRow({ item, onOpen }: { item: RelatedRecord; onOpen: (i: RelatedRecord) => void }) {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-card-foreground">{item.label}</span>
        {item.sublabel && <span className="block truncate text-xs text-muted-foreground">{item.sublabel}</span>}
      </span>
      {item.badge && <DetailStatusBadge label={item.badge} tone={item.badgeTone || 'neutral'} />}
    </>
  );
  if (!item.route) {
    return <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">{inner}</div>;
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={`Open ${item.recordType || 'record'} ${item.label}`}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {inner}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

/** Renders one supplied detail section. Presentation only — no calculation. */
export function DetailSectionView({ section, onOpenRelated }: { section: DetailSection; onOpenRelated: (i: RelatedRecord) => void }) {
  const headingId = `section-${section.id}`;
  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 id={headingId} className="text-sm font-bold text-card-foreground">
        {section.title}
      </h2>

      {section.kind === 'fields' && (
        <>
          <dl className="mt-2">
            {section.fields.map((f) => (
              <FieldRow key={f.label} field={f} />
            ))}
          </dl>
          {section.note && <p className="mt-2 text-xs text-muted-foreground">{section.note}</p>}
        </>
      )}

      {section.kind === 'related' && (
        <div className="mt-3 space-y-2">
          {section.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{section.emptyMessage || 'Nothing linked yet.'}</p>
          ) : (
            section.items.map((i) => <RelatedRow key={i.id} item={i} onOpen={onOpenRelated} />)
          )}
        </div>
      )}

      {section.kind === 'timeline' && (
        <ol className="mt-3 space-y-3">
          {section.entries.map((e) => (
            <li key={e.id} className="relative border-l-2 border-border pl-4">
              <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
              <p className="text-sm font-semibold text-card-foreground">{e.label}</p>
              {e.detail && <p className="text-xs text-muted-foreground">{e.detail}</p>}
              <p className="mt-0.5 text-xs text-muted-foreground">{[e.author, e.timestamp].filter(Boolean).join(' · ')}</p>
            </li>
          ))}
        </ol>
      )}

      {section.kind === 'notes' && (
        <ul className="mt-3 space-y-2">
          {section.notes.map((n) => (
            <li key={n.id} className="rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-card-foreground">{n.author}</span>
                <span className="text-xs text-muted-foreground">{n.timestamp}</span>
                <VisibilityTag visibility={n.visibility} />
              </div>
              <p className="mt-1.5 text-sm text-card-foreground">{n.body}</p>
            </li>
          ))}
        </ul>
      )}

      {section.kind === 'media' && (
        <div className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- section.imageUrl is arbitrary/adapter-supplied, not a static local asset next/image can optimize here */}
          <img src={section.imageUrl} alt={section.alt} className="h-56 w-full rounded-xl object-cover sm:h-80" />
          {section.caption && <p className="mt-2 text-sm font-semibold text-card-foreground">{section.caption}</p>}
          {section.fields && (
            <dl className="mt-2">
              {section.fields.map((f) => (
                <FieldRow key={f.label} field={f} />
              ))}
            </dl>
          )}
        </div>
      )}

      {section.kind === 'progress' && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-bold text-card-foreground">{section.progress.stageLabel}</span>
            <span className="text-sm font-bold text-primary">{section.progress.percentLabel}</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`Progress: ${section.progress.percentLabel}`}>
            <div className="h-full rounded-full bg-primary" style={{ width: `${section.progress.percent}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{section.progress.explanation}</p>
          {section.progress.steps && (
            <ul className="mt-3 space-y-1.5">
              {section.progress.steps.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  <span
                    className={`grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold ${s.done ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}
                    aria-hidden="true"
                  >
                    {s.done ? '✓' : ''}
                  </span>
                  <span className={s.done ? 'text-muted-foreground line-through' : 'text-card-foreground'}>{s.label}</span>
                  <span className="sr-only">{s.done ? 'complete' : 'not complete'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {section.kind === 'text' && (
        <div className="mt-2">
          <VisibilityTag visibility={section.visibility} />
          <p className="mt-1.5 whitespace-pre-line text-sm text-card-foreground">{section.body}</p>
        </div>
      )}

      {section.kind === 'lines' && (
        <div className="mt-3 space-y-2">
          {section.lines.map((l) => (
            <div key={l.id} className="flex items-start justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-card-foreground">{l.label}</span>
                {l.sublabel && <span className="block text-xs text-muted-foreground">{l.sublabel}</span>}
              </span>
              <span className="shrink-0 text-sm font-bold text-card-foreground">{l.amountLabel}</span>
            </div>
          ))}
          {section.totals && (
            <dl className="mt-2 border-t border-border pt-2">
              {section.totals.map((t) => (
                <div key={t.label} className="flex justify-between py-1 text-sm">
                  <dt className={t.emphasis ? 'font-bold text-card-foreground' : 'text-muted-foreground'}>{t.label}</dt>
                  <dd className={t.emphasis ? 'font-bold text-card-foreground' : 'font-semibold text-card-foreground'}>{t.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </section>
  );
}
