import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, Camera, CheckCircle2, ChevronRight, ClipboardList, FileText, Package, Plus, Search, SearchX } from 'lucide-react';

import { getActiveOrgContext, type ActivityLogEntry } from '@premier/db';

import { ForgeCard, ForgePage } from '@/components/forge/presentation';
import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

export const metadata: Metadata = { title: 'Activity Logs' };

type ActivityCategory = 'all' | 'site-update' | 'field-note' | 'completion' | 'issue' | 'material';

interface ActivityLogsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface QuickLogRow {
  authorName: string;
  category: Exclude<ActivityCategory, 'all'>;
  categoryLabel: string;
  content: string;
  href: string;
  id: string;
  jobNumber: string | null;
  propertyName: string;
  timestamp: string;
}

const FILTERS: Array<{ label: string; value: ActivityCategory }> = [
  { label: 'All', value: 'all' },
  { label: 'Site updates', value: 'site-update' },
  { label: 'Field notes', value: 'field-note' },
  { label: 'Completions', value: 'completion' },
  { label: 'Issues', value: 'issue' },
  { label: 'Materials', value: 'material' },
];

const categoryConfig = {
  'site-update': { Icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
  'field-note': { Icon: ClipboardList, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  completion: { Icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  issue: { Icon: AlertTriangle, color: 'text-rose-600', bg: 'bg-rose-50' },
  material: { Icon: Package, color: 'text-amber-600', bg: 'bg-amber-50' },
} as const;

export default async function ActivityLogsPage({ searchParams }: ActivityLogsPageProps) {
  const params = await searchParams;
  const search = readStringParam(params.q);
  const activeFilter = readCategoryParam(params.category);

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/activity-logs');
  }

  const orgContext = await getActiveOrgContext(supabase, user.id);

  if (!orgContext.success) {
    return (
      <PageShell rows={[]} activeFilter={activeFilter} search={search}>
        <OrgContextError code={orgContext.code} message={orgContext.error} />
      </PageShell>
    );
  }

  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .eq('org_id', orgContext.data.orgId)
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = ((data as ActivityLogEntry[] | null) ?? []).map(toQuickLogRow);
  const visibleRows = rows.filter((row) => matchesLog(row, search, activeFilter));

  return (
    <PageShell rows={rows} activeFilter={activeFilter} search={search}>
      {error ? (
        <ForgeCard className="border-red-200 bg-red-50 text-sm text-red-700">Failed to load activity logs. Refresh and try again.</ForgeCard>
      ) : visibleRows.length === 0 ? (
        <ForgeCard className="grid min-h-[40vh] place-items-center text-center">
          <div>
            <SearchX className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 text-lg font-bold">{search || activeFilter !== 'all' ? 'No logs found' : 'No activity logged yet'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {search || activeFilter !== 'all' ? 'Try adjusting your search or filters.' : 'Field notes and site updates will appear here.'}
            </p>
          </div>
        </ForgeCard>
      ) : (
        <div className="space-y-4">
          {visibleRows.map((row) => {
            const config = categoryConfig[row.category];
            const Icon = config.Icon;
            return (
              <Link
                key={row.id}
                href={row.href}
                className="block rounded-xl border bg-card p-4 text-left shadow-sm transition hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${config.bg}`}>
                    <Icon className={`h-4 w-4 ${config.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="font-bold text-card-foreground">{row.authorName}</span>
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${config.bg} ${config.color}`}>{row.categoryLabel}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                    <p className="mt-1.5 text-sm text-card-foreground">{row.content}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>{row.timestamp}</span>
                      <span>·</span>
                      <span>{row.propertyName}</span>
                      {row.jobNumber ? <><span>·</span><span>{row.jobNumber}</span></> : null}
                      <span className="flex items-center gap-0.5 text-primary"><Camera className="h-3 w-3" />Record</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

function PageShell({
  activeFilter,
  children,
  rows,
  search,
}: {
  activeFilter: ActivityCategory;
  children: React.ReactNode;
  rows: QuickLogRow[];
  search?: string;
}) {
  return (
    <ForgePage className="max-w-4xl gap-5 md:gap-6">
      <header className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Quick Logs</h1>
            <p className="mt-1 text-sm text-muted-foreground">Daily field technician notes and site updates.</p>
          </div>
          <button
            type="button"
            disabled
            title="New quick logs need a real write model before this can save."
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground opacity-60"
          >
            <Plus className="h-4 w-4" /> New log
          </button>
        </div>
        <form action="/activity-logs" className="relative">
          <input type="hidden" name="category" value={activeFilter} />
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Search by author, property, or content..."
            className="min-h-12 w-full rounded-xl border border-input bg-card py-2.5 pl-10 pr-4 text-sm font-medium shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </form>
        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter logs">
          {FILTERS.map((filter) => {
            const count = filter.value === 'all' ? rows.length : rows.filter((row) => row.category === filter.value).length;
            return (
              <Link
                key={filter.value}
                href={`/activity-logs?category=${filter.value}${search ? `&q=${encodeURIComponent(search)}` : ''}`}
                className={[
                  'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition',
                  activeFilter === filter.value ? 'bg-primary text-primary-foreground' : 'border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                ].join(' ')}
              >
                {filter.label}
                <span className={activeFilter === filter.value ? 'rounded-full bg-primary-foreground/20 px-1.5 text-[10px]' : 'rounded-full bg-muted px-1.5 text-[10px]'}>{count}</span>
              </Link>
            );
          })}
        </nav>
      </header>
      {children}
    </ForgePage>
  );
}

function toQuickLogRow(entry: ActivityLogEntry): QuickLogRow {
  const category = classifyCategory(entry);
  return {
    authorName: 'Forge activity',
    category,
    categoryLabel: labelForCategory(category),
    content: entry.message?.trim() || labelize(entry.event_type),
    href: entityHref(entry.entity_type, entry.entity_id),
    id: entry.id,
    jobNumber: entry.entity_type === 'job' ? entry.entity_id.slice(0, 8).toUpperCase() : null,
    propertyName: labelize(entry.entity_type),
    timestamp: relativeTime(entry.created_at),
  };
}

function classifyCategory(entry: ActivityLogEntry): Exclude<ActivityCategory, 'all'> {
  const value = `${entry.entity_type} ${entry.event_type} ${entry.message ?? ''}`.toLowerCase();
  if (/complete|completed|generated/.test(value)) return 'completion';
  if (/issue|error|fail|cancel|reject|hazard|blocked/.test(value)) return 'issue';
  if (/material|expense|invoice|cost/.test(value)) return 'material';
  if (/site|visit|inspection/.test(value)) return 'site-update';
  return 'field-note';
}

function matchesLog(row: QuickLogRow, search: string | undefined, activeFilter: ActivityCategory): boolean {
  if (activeFilter !== 'all' && row.category !== activeFilter) return false;
  if (!search) return true;
  const normalized = search.toLowerCase();
  return [row.authorName, row.categoryLabel, row.content, row.propertyName, row.jobNumber ?? ''].some((value) => value.toLowerCase().includes(normalized));
}

function labelForCategory(category: Exclude<ActivityCategory, 'all'>): string {
  const labels = {
    'site-update': 'Site update',
    'field-note': 'Field note',
    completion: 'Job complete',
    issue: 'Issue flagged',
    material: 'Material logged',
  } as const;
  return labels[category];
}

function entityHref(entityType: string, entityId: string): string {
  if (entityType === 'service_request') return `/requests/${entityId}`;
  if (entityType === 'site_visit') return `/site-visits/${entityId}`;
  if (entityType === 'estimate') return `/estimates/${entityId}`;
  if (entityType === 'quote') return `/quotes/${entityId}`;
  if (entityType === 'job') return `/jobs/${entityId}`;
  if (entityType === 'invoice') return `/invoices/${entityId}`;
  return '/today';
}

function labelize(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function relativeTime(value: string): string {
  const deltaMs = Date.now() - new Date(value).getTime();
  const hours = Math.max(0, Math.floor(deltaMs / 3_600_000));
  if (hours < 1) return 'Today';
  if (hours < 24) return `Today · ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

function readStringParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 && trimmed.length <= 200 ? trimmed : undefined;
}

function readCategoryParam(value: string | string[] | undefined): ActivityCategory {
  const raw = Array.isArray(value) ? value[0] : value;
  return FILTERS.some((filter) => filter.value === raw) ? (raw as ActivityCategory) : 'all';
}
