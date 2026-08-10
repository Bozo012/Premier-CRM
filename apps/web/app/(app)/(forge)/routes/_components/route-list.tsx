// Presentation component (Layer 1-equivalent for this originated slice — see
// the report's "no Base44 reference" note: Forge-Base44-UX has no routes/map
// page at this pinned commit, so this markup is originated in the same
// forge design language as every other ported page rather than ported
// verbatim). Props-driven only — no Supabase/action/fixture/auth/provider
// imports; renders real `<Link href>` navigation per stop, never a
// toast-only action.
import Link from 'next/link';
import { AlertTriangle, Briefcase, ClipboardCheck, ExternalLink, MapPinOff, Users } from 'lucide-react';

import type { RouteStopModel } from '../_lib/forge-routes-view-model';

export interface RouteStopDisplayModel extends RouteStopModel {
  mapsUrl: string | null;
}

const STATUS_BADGE_CLASS = 'inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-semibold text-muted-foreground';

function LocationBadge({ status }: { status: RouteStopModel['locationStatus'] }) {
  if (status === 'geocoded') return null;
  const label = status === 'missing-address' ? 'Missing address' : 'Location unavailable';
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
      <MapPinOff className="h-3 w-3" aria-hidden="true" /> {label}
    </span>
  );
}

function StopRow({ stop, isSelected, onSelect }: { stop: RouteStopDisplayModel; isSelected: boolean; onSelect: (id: string) => void }) {
  return (
    <li
      className={`rounded-xl border p-3 transition ${isSelected ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/50'}`}
      aria-current={isSelected ? 'true' : undefined}
    >
      <button type="button" onClick={() => onSelect(stop.id)} className="flex w-full items-start gap-3 text-left" aria-label={`Select stop ${stop.order}: ${stop.title}`}>
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
          {stop.order}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            {stop.kind === 'job' ? <Briefcase className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> : <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
            <span className="text-sm font-semibold text-foreground">{stop.title}</span>
            {stop.isPriority ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" /> {stop.priorityLabel}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {stop.scheduledTimeLabel} · {stop.customerName}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{stop.addressLabel ?? 'No address on file'}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={STATUS_BADGE_CLASS}>{stop.statusLabel}</span>
            <LocationBadge status={stop.locationStatus} />
            {stop.crewNames.length > 0 ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Users className="h-3 w-3" aria-hidden="true" /> {stop.crewNames.join(', ')}
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Unassigned</span>
            )}
          </span>
        </span>
      </button>
      <div className="mt-2 flex items-center gap-3 pl-9 text-xs font-semibold">
        <Link href={stop.detailHref} className="text-primary hover:underline">
          {stop.kind === 'job' ? 'Open job' : 'Open site visit'}
        </Link>
        {stop.mapsUrl ? (
          <a href={stop.mapsUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline">
            Open in Maps <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </li>
  );
}

export function RouteList({
  stops,
  unscheduledStops,
  selectedId,
  onSelectStop,
}: {
  stops: RouteStopDisplayModel[];
  unscheduledStops: RouteStopDisplayModel[];
  selectedId: string | null;
  onSelectStop: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="mb-2 text-sm font-bold text-foreground">Today&apos;s route ({stops.length})</h2>
        {stops.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">Nothing scheduled for this date.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {stops.map((stop) => (
              <StopRow key={stop.id} stop={stop} isSelected={stop.id === selectedId} onSelect={onSelectStop} />
            ))}
          </ul>
        )}
      </div>

      {unscheduledStops.length > 0 ? (
        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-foreground">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" /> Unscheduled ({unscheduledStops.length})
          </h2>
          <p className="mb-2 text-xs text-muted-foreground">Active work with no scheduled time yet — kept visible rather than dropped.</p>
          <ul className="flex flex-col gap-2">
            {unscheduledStops.map((stop) => (
              <StopRow key={stop.id} stop={stop} isSelected={stop.id === selectedId} onSelect={onSelectStop} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
