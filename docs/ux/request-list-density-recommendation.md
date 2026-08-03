# Request List Density — Recommendation (Base44-Ready, Not Implemented)

Status: **recommendation for Base44's redesign pass.** This document does not implement a redesign. Per instruction, only a tiny containment fix would be made now if trivially necessary — none was found to be necessary, so `apps/web/app/(app)/requests/page.tsx` is unchanged in this batch.

## Current layout (as of this pass)

`RequestRow` (`apps/web/app/(app)/requests/page.tsx:97-177`) renders each request as a ~4-line stacked block:

1. Title + service line, with a badge cluster (status, priority if non-normal, estimate/job-created link, intake-path label) wrapping to its own line on narrow screens.
2. A 3-column grid of customer name / phone / email — each only shown if present, so the grid is uneven row-to-row.
3. "Received `<date>`" as a trailing line.

This is a reasonable list today at low volume, but every row always pays the full "customer block" and "received" line even when scanning for status/next-action is the actual task. Nothing here is broken — this is a density/scannability recommendation, not a defect report.

## Problems worth addressing in a redesign

1. **Status and next-action aren't visually dominant.** The status badge is same-size/same-weight as priority and intake-path badges — a reviewer scanning for "what needs action" has to read every badge in the cluster rather than immediately locating the one that matters most.
2. **Contact details are always fully expanded**, even though on this list the far more common need is "who is this and what's the next step," not "what's their phone number." Phone/email are useful but arguably belong behind a tap/expand rather than always-on.
3. **Repeated metadata across rows adds vertical weight** without adding scanability — three lines of customer/phone/email per row, at 100 requests, is a lot of scrolling.
4. **Property/service-type is under-emphasized.** `item.serviceLine` is a single muted line under the title; property address isn't shown on the list at all today (only on the detail page) — for a service business, "what and where" is often as important as "who."
5. **Mobile tap targets are the whole `<li>`... except they aren't.** The row currently has no single tap target at all — only the title and the customer name are links; tapping anywhere else on the card does nothing, which is a common mobile-friction pattern (user taps the card body expecting navigation, nothing happens).

## Recommended direction for Base44

- **Compact summary row, expand-on-tap for contact details.** Collapse phone/email into a single "Contact" affordance (icon + tap-to-reveal, or a slide-out) rather than always-rendered text lines — reclaims 1-2 lines per row without losing the information.
- **Elevate status to the primary visual anchor** — leftmost or most prominent position, larger or color-differentiated from secondary badges (priority, intake path), so "what's the state of this request" is readable at a glance without parsing a badge cluster.
- **Make the whole row a tap target** on mobile (`<Link>` wrapping the row, or a full-row `onClick`/`href`), not just the title text — the current partial-tap-target pattern is the concrete mobile friction point most worth fixing regardless of broader density changes.
- **Show property/customer/service type as a compact one-line summary**, e.g. `Dana Whitfield · 1 Queue Way · Deck repair` — a single scannable line rather than a stacked grid, deferring full contact detail to the expand affordance or the detail page.
- **De-emphasize "Received `<date>`"** — useful but lowest-priority information on this list; candidate for right-aligned relative time (`"2h ago"`) rather than a full formatted date on its own line.
- **Consider a secondary "next action" affordance** directly on the row for the most common single action per status (e.g. "Review" for `new`, "Create estimate" for `reviewing` with a triage decision pending) — mirrors the same "make the actionable thing obvious" principle behind the new Today action queue, though this is a larger change and likely belongs to Base44's broader pass rather than a quick tweak.

## What this recommendation does NOT propose

- No change to `listRequests()` query shape, `REVIEWED_STATUSES`, or the show-filter (`open`/`done`/`all`) behavior — this is presentation-only.
- No change to what data is fetched — only how it's laid out and which parts are always-visible vs. expand-on-demand.
- Not a redesign of the request detail page (`/requests/[taskId]`) — scoped to the list view only.

## Why no containment fix was made in this pass

The instruction allowed a tiny containment fix now "if trivially necessary." Reviewing the current list rendering, there's no overflow/wrapping defect analogous to the mobile bottom-nav badge crowding — the flex-wrap badge cluster and grid-based contact block both degrade gracefully on narrow viewports today. The issues above are density/emphasis recommendations for Base44's pass, not currently-broken containment, so nothing was changed here.
