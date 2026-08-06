// Ported from Base44 Forge-Base44-UX @ 497d0693 — src/contracts/recordDetail.ts,
// unchanged. Generic, reusable across all future detail routes, not just
// Customers.
//
// Every value here is SUPPLIED by the adapter layer (Forge query results,
// mapped by a route's _lib/*-view-model.ts): labels, statuses, totals,
// percentages, action eligibility, visibility boundaries. The presentation
// components in this file's siblings never calculate, decide permissions,
// or own workflow authority.
export type DetailTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface DetailAction {
  id: string;
  label: string;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  unavailableReason?: string;
}

export interface DetailField {
  label: string;
  value: string;
  tone?: DetailTone;
  visibility?: 'internal' | 'customer';
}

/** A navigable related record. `route` is supplied by the adapter. */
export interface RelatedRecord {
  id: string;
  label: string;
  sublabel?: string;
  badge?: string;
  badgeTone?: DetailTone;
  route?: string;
  recordType?: string;
}

export interface TimelineEntry {
  id: string;
  label: string;
  detail?: string;
  author?: string;
  timestamp: string;
  tone?: DetailTone;
}

export interface NoteEntry {
  id: string;
  author: string;
  timestamp: string;
  body: string;
  visibility: 'internal' | 'customer';
}

export interface ProgressModel {
  percent: number;
  percentLabel: string;
  stageLabel: string;
  explanation: string;
  steps?: { id: string; label: string; done: boolean }[];
}

export type DetailSection =
  | { kind: 'fields'; id: string; title: string; fields: DetailField[]; note?: string }
  | { kind: 'related'; id: string; title: string; items: RelatedRecord[]; emptyMessage?: string }
  | { kind: 'timeline'; id: string; title: string; entries: TimelineEntry[] }
  | { kind: 'notes'; id: string; title: string; notes: NoteEntry[] }
  | { kind: 'media'; id: string; title: string; imageUrl: string; alt: string; caption?: string; fields?: DetailField[] }
  | { kind: 'progress'; id: string; title: string; progress: ProgressModel }
  | { kind: 'text'; id: string; title: string; body: string; visibility?: 'internal' | 'customer' }
  | {
      kind: 'lines';
      id: string;
      title: string;
      lines: { id: string; label: string; sublabel?: string; amountLabel: string }[];
      totals?: { label: string; value: string; emphasis?: boolean }[];
    };

export interface RecordDetailModel {
  recordType: string;
  identity: string;
  title: string;
  statusLabel: string;
  statusTone: DetailTone;
  contextChips?: { id: string; label: string; route?: string }[];
  summaryTiles?: { id: string; label: string; value: string; tone?: DetailTone }[];
  nextAction?: { label: string; detail?: string; actionId?: string } | null;
  warnings?: string[];
  readOnlyNotice?: string | null;
  primaryAction?: DetailAction | null;
  secondaryActions?: DetailAction[];
  sections: DetailSection[];
  backLabel: string;
}

export interface RecordDetailCallbacks {
  onBack: () => void;
  onAction: (actionId: string) => void;
  onOpenRelated: (item: RelatedRecord) => void;
}

export interface RecordDetailState {
  model: RecordDetailModel | null;
  isLoading?: boolean;
  error?: string | null;
}
