# Base44 Presentation Contracts

Status: **planning document only** — companion to `docs/ux/base44-builder-readiness-plan.md`. Defines the portable presentation-contract package Base44 designs against inside the (not-yet-created) `Forge-Base44-UX` repository. These are **presentation contracts, not backend implementations**: every field below is data Forge Layer 1/2 has *already computed, authorized, and decided* by the time it reaches a Layer 3 component. No contract in this document performs authorization, Supabase writes, lifecycle-eligibility checks, accounting calculations, org-selection rules, validation authority, or trusted mutation logic — Forge remains authoritative for all of that, always.

`TodayViewModel` is grounded directly in the real, merged Today implementation (`apps/web/app/(app)/today/_lib/view-model.ts`, `apps/web/app/(app)/today/_components/quick-actions.tsx`, `packages/db/queries/today-actions.ts` — verified by direct read, not inference). `EstimateViewModel` and `SiteInspectionViewModel` are **forward-looking** — Estimates and Site Inspection redesigns have not started — derived from the requirements already recorded in `docs/ux/forge-v1.1-ux-modernization-plan.md` §6.2/§6.3 and clearly labeled as planned, not built.

---

## 1. Callback contract names (shared across all three ViewModels, as applicable)

`onNavigate`, `onSwitchOrganization`, `onSignOut`, `onOpenAction`, `onSubmitForPricingReview`, `onApprovePricing`, `onReturnForChanges`, `onCreateQuote`, `onSendQuote`, `onStartInspection`, `onUpdateField`, `onAddPhoto`, `onRetryPhoto`, `onRemovePhoto`, `onCompleteInspection`, `onStartDictation`, `onStopDictation`.

Every callback is a plain function prop. A Layer 3 component never knows what happens after it's called — it does not know if the call succeeded, whether it was authorized, or what Forge did as a result. It only knows whether the *prop offering that action* was present (its absence, driven by Forge's own capability/lifecycle logic, is how a component knows an action isn't currently available).

---

## 2. `TodayViewModel` (grounded in the real, merged implementation)

```ts
// Organization / identity — supplied by Forge's org-context layer, never
// computed or selected by the presentation layer.
interface OrgIdentity {
  orgId: string;
  orgName: string;
  greeting: string;       // e.g. "Good morning" — derived from server time, not client-guessed
  firstName: string;      // already resolved by Forge (profile name, else email localpart, else "there")
}

// Attention items — a role/capability-filtered union already decided by
// Forge Layer 1 (packages/db/queries/today-actions.ts: getTodayActionItems()).
// The presentation layer sorts/labels only; it never decides which kind of
// task a user is allowed to see.
type TodayActionItem =
  | { kind: 'pricing_review_requested'; estimateId: string; estimateNumber: string; title: string; customerName: string | null; proposedTotal: number; submittedByName: string | null; submittedAt: string }
  | { kind: 'create_quote'; estimateId: string; estimateNumber: string; title: string; customerName: string | null; approvedAt: string }
  | { kind: 'send_quote'; quoteId: string; quoteNumber: string | null; title: string | null; customerName: string | null; createdAt: string };

// Quote-response activity — the "still actionable" decision is made in
// Forge's getTodayQuoteActivity(), never in presentation.
interface QuoteActivityItem {
  id: string;
  quoteId: string;
  label: string;
  message: string | null;
  isAccepted: boolean;
}

// Scheduled work — jobs and site visits already merged into one
// chronological list by Forge Layer 2 (buildTodaySchedule).
interface ScheduleEntry {
  id: string;
  href: string;
  title: string;
  subtitle: string | null;
  timeLabel: string;
  kind: 'job' | 'site_visit';
}

// Operational snapshot — actionable counts only, never revenue/accounting
// totals (Kevin's explicit product decision). Exactly three items today:
// New requests, Today's work, Invoices needing action.
interface SnapshotItem {
  label: string;
  value: string;
  helper: string;
  href: string;
}

// Quick actions — already capability-filtered by Forge (e.g. "New estimate"
// only present if the signed-in user has canCreateEstimates).
interface QuickActionItem {
  id: string;
  href: string;
  label: string;
}

interface TodayViewModel {
  org: OrgIdentity;
  attentionItems: TodayActionItem[];
  quoteActivity: QuoteActivityItem[];
  schedule: ScheduleEntry[];
  snapshot: SnapshotItem[];
  quickActions: QuickActionItem[];
  adminLinks: Array<{ href: string; label: string }>;  // e.g. "Website content" — admin/owner only, pre-filtered
  state: 'loading' | 'empty' | 'error' | 'loaded';
  errorMessage: string | null;  // present only when state === 'error'; always human-safe text

  onNavigate: (href: string) => void;
  onSwitchOrganization: (orgId: string) => void;
  onSignOut: () => void;
  onOpenAction: (item: TodayActionItem) => void;
}
```

---

## 3. `EstimateViewModel` (planned — Estimates redesign not started)

Derived from `forge-v1.1-ux-modernization-plan.md` §6.2's requirements. Field names are illustrative pending actual Layer 2 implementation; the shape/boundary is what matters for Base44 to design against now.

```ts
interface EstimateLineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;             // e.g. "hr", "ea", "sq ft" — display unit only
  laborValue: string;       // pre-formatted currency string supplied by Forge — never computed client-side
  materialValue: string;    // pre-formatted currency string supplied by Forge
  editable: boolean;        // Forge-decided, based on estimate status + capability
}

interface EstimateViewModel {
  customerName: string;
  propertyAddress: string | null;
  estimateNumber: string;
  status: 'draft' | 'pending_pricing_review' | 'changes_requested' | 'pricing_approved' | 'quote_ready' | 'quote_sent';
  pricingReviewStatus: string | null;   // human-readable label, Forge-supplied
  editableSections: string[];           // which sections the current user/status combination may edit — Forge-decided
  lineItems: EstimateLineItem[];
  totals: { laborTotal: string; materialTotal: string; grandTotal: string };  // pre-formatted, Forge-computed
  notes: string | null;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  availableActions: Array<'submit_for_pricing_review' | 'approve_pricing' | 'return_for_changes' | 'create_quote' | 'send_quote'>;  // Forge-filtered by role + lifecycle state
  activity: Array<{ id: string; label: string; timestamp: string; actorName: string | null }>;
  validationMessages: Array<{ fieldId: string; message: string }>;  // presentation only — Forge is the validation authority; this is just what to show
  state: 'loading' | 'empty' | 'error' | 'loaded';
  errorMessage: string | null;

  onUpdateField: (fieldId: string, value: string) => void;
  onSubmitForPricingReview: () => void;
  onApprovePricing: () => void;
  onReturnForChanges: (reason: string) => void;
  onCreateQuote: () => void;
  onSendQuote: () => void;
}
```

**Boundary note**: `onUpdateField` never persists anything itself — it's a callback Forge wires to its own autosave/validation logic. A ported Layer 3 Estimates component must never contain its own save timer, its own total-calculation, or its own status-transition rules; all three stay in Forge Layer 1/2 exactly as `getTodayQuoteActivity()`-style logic already does for Today.

---

## 4. `SiteInspectionViewModel` (planned — Site Inspection redesign not started)

Derived from `forge-v1.1-ux-modernization-plan.md` §6.3, and from the existing, functional, unmodified photo pipeline (`apps/web/app/(app)/site-visits/_components/photo-upload.tsx`, `apps/web/lib/site-visit-attachments.ts`).

```ts
interface InspectionPhoto {
  id: string;
  thumbnailUrl: string;               // Forge-supplied, already finalized/signed as appropriate
  uploadState: 'uploading' | 'uploaded' | 'failed';
  visibility: 'internal' | 'customer_visible';  // Forge-decided, never set by the presentation layer
}

interface SiteInspectionViewModel {
  appointment: { id: string; scheduledStart: string };
  customerName: string;
  propertyAddress: string | null;
  accessInfo: string | null;
  progress: { completedSections: number; totalSections: number };
  sections: Array<{ id: string; title: string; complete: boolean }>;
  hazards: Array<{ id: string; label: string; notes: string | null }>;
  measurements: Array<{ id: string; label: string; value: string; unit: string }>;
  materials: Array<{ id: string; name: string; quantity: string }>;
  notes: string | null;
  photos: InspectionPhoto[];
  autosaveState: 'idle' | 'saving' | 'saved' | 'error';
  completionReady: boolean;           // Forge-decided (e.g. required fields present) — presentation only reflects it
  availableActions: Array<'start_inspection' | 'complete_inspection'>;  // Forge-filtered
  dictationState: 'idle' | 'permission_requested' | 'listening' | 'processing' | 'transcript_ready' | 'permission_denied' | 'unsupported';
  transcript: string | null;
  interruptionError: string | null;

  onUpdateField: (fieldId: string, value: string) => void;
  onAddPhoto: (file: File) => void;
  onRetryPhoto: (photoId: string) => void;
  onRemovePhoto: (photoId: string) => void;
  onStartInspection: () => void;
  onCompleteInspection: () => void;
  onStartDictation: () => void;
  onStopDictation: () => void;
}
```

**Photo boundary, restated exactly**: a ported `InspectionPhoto` component only ever renders `thumbnailUrl`/`uploadState`/`visibility` and calls `onAddPhoto`/`onRetryPhoto`/`onRemovePhoto`. It never touches Supabase Storage, never signs an upload URL, never strips EXIF, never decides `visibility` itself — all of that stays exactly as already implemented in `photo-upload.tsx`/`site-visit-attachments.ts`, untouched by this whole program.

**Dictation boundary, restated exactly**: `dictationState`/`transcript` are read-only presentation inputs; `onStartDictation`/`onStopDictation` are the only two callbacks a Layer 3 component may call. It never requests microphone access itself, never stores audio, never calls a transcription API, and never writes `transcript` into a field directly — appending/replacing a field's value from a transcript is a decision Forge makes, exposed back to presentation only as an updated `transcript`/field value after the fact.

---

## 5. Fictional mock states (for `Forge-Base44-UX` fixtures — no production or Demo data)

All names, addresses, amounts, and images below are fictional placeholders for fixture design — not literal required content, just the required *state coverage*.

### Today
Owner full queue · employee queue · viewer no-write · empty queue · no scheduled work · multi-org switcher · org switch shows different data · controlled error state · phone / tablet / desktop viewports.

### Estimates
New draft · site-visit-generated draft · employee editing · pending pricing review · changes requested · pricing approved · quote ready · quote sent · saving · saved · validation error · empty line items · long line-item list · phone / tablet / desktop viewports.

### Site Inspection
Scheduled · ready to start · active · partially completed · missing required info · hazards present · no hazards observed · measurement/material-heavy · photo uploading · photo finalizing · photo failed-with-retry · ready to complete · completed · dictation idle · dictation permission-requested · dictation listening · dictation transcript-ready · dictation permission-denied · dictation unsupported-browser · phone / tablet / desktop viewports.

Every fixture in `Forge-Base44-UX` must use invented customer names, invented addresses, invented dollar amounts, and placeholder/stock images only — never anything copied from Forge's real Demo data or any real customer record.
