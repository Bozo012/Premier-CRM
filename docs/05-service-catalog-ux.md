# Service Catalog UX Specification

How services are added, edited, refined, and discovered in Premier. The design principle: **the catalog should grow with you, not constrain you.** A user should never feel locked out of doing a job because it's not in the catalog yet.

## Three add-paths for three different situations

### Path 1: Mid-quote quick-add (most common)

When you're drafting a quote and need a service that isn't in the catalog yet. This needs to be near-frictionless — anything more than 30 seconds of friction here will train you to skip the catalog entirely.

```
┌────────────────────────────────────────────┐
│  Quote for Emily Henderson                 │
│                                            │
│  LINE ITEMS                                │
│  ┌────────────────────────────────────┐   │
│  │ + Add line item                    │   │
│  │ [soffit___________________] 🔍     │   │
│  └────────────────────────────────────┘   │
│                                            │
│  No matches in your catalog yet.           │
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │ ➕ Quick-add "soffit"                │  │
│  │    Add to catalog and use now        │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │ 💬 Ask AI to research this service   │  │
│  │    Get rate range + add to catalog   │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │ 🚧 Use as one-off / favor job        │  │
│  │    Custom-quote without cataloging   │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

**Quick-add inline form:**

```
┌────────────────────────────────────────────┐
│  Add: soffit                          ✕    │
│                                            │
│  Name [soffit_______________________]      │
│                                            │
│  Category                                  │
│  [Existing ▾]  or  [+ New category]        │
│  Selected: Exterior Repair                 │
│                                            │
│  Pricing model                             │
│  ( ) Flat fee                              │
│  ( ) Per square foot                       │
│  (●) Per linear foot                       │
│  ( ) Per each                              │
│  ( ) Per hour                              │
│  ( ) Custom quote                          │
│                                            │
│  Your rate                                 │
│  $ [___] per linear foot                   │
│  ☐ Not sure — give me a researched range   │
│                                            │
│  [Add and use in this quote]               │
└────────────────────────────────────────────┘
```

If they check "give me a researched range," the AI runs `get_pricing_research` first, returns a range like "$8-15/lf based on 3 comparable past jobs and current market rates," and pre-fills the form for confirmation.

### Path 2: Settings → Service catalog (curated batch)

When you're at the desk doing thoughtful catalog grooming.

```
┌────────────────────────────────────────────┐
│  ← Service catalog                         │
│                                            │
│  [+ Add service]   [+ Add category]        │
│  [Search: ___________________]             │
│                                            │
│  📊 33 services • 28 unconfirmed rates     │
│  💡 5 services need pricing review         │
│  🔍 [Suggest from my job history]          │
│                                            │
│  TRIP FEES                                 │
│  ┌────────────────────────────────────┐   │
│  │ Residential trip fee  $100  ✓ HIGH │   │
│  │ Used 12 times                      │   │
│  │ [Edit] [Pricing history]           │   │
│  └────────────────────────────────────┘   │
│                                            │
│  DRYWALL                          [+ ...]  │
│  ┌────────────────────────────────────┐   │
│  │ Patch — small (under 12")          │   │
│  │ $75-125 • UNCONFIRMED              │   │
│  │ Used 0 times    [Edit] [Archive]   │   │
│  ├────────────────────────────────────┤   │
│  │ Hang + tape + finish               │   │
│  │ $4-6/sqft • MEDIUM ✓               │   │
│  │ Used 3 times • 67% win rate        │   │
│  │ [Edit] [Archive] [History]         │   │
│  └────────────────────────────────────┘   │
│                                            │
│  TRIM & CARPENTRY                 [+ ...]  │
│  [...]                                     │
│                                            │
│  🤖 Try: "Add a service for power washing  │
│     decks at $0.75/sqft, materials at      │
│     cost"                                  │
└────────────────────────────────────────────┘
```

Key affordances on the catalog page:

- **Confidence badge** on every service so you know what's settled vs. tentative
- **Usage stats** (times used, win rate) once you have history
- **"Suggest from history" button** that runs `suggest_services_from_history` — once you've completed enough jobs, the AI proposes catalog additions based on what you've actually billed
- **"5 services need pricing review" alert** that runs `flag_services_for_review` — surfaces overpriced (low win rate), underpriced (very high win rate), or stale (last quoted >6 months ago) services
- **Per-service "Pricing history"** view that shows every quote that used this service with the rate at the time, the outcome, and lets you spot trends
- **Conversational hint** at the bottom — reminding you that everything here is also a chat command

### Path 3: Conversational

The catch-all for "I just thought of something." Examples that all work:

- *"Add a new service: pressure washing decks. $0.75/sqft, materials pass-through."* → creates new service immediately
- *"For drywall patches under 12 inches, set my rate to $100 going forward."* → updates existing service from range to confirmed rate
- *"What services am I missing from my catalog based on the last 3 months of jobs?"* → runs suggestion analysis
- *"I'm not doing exterior siding work anymore, remove it."* → archives service
- *"What's my win rate on doors?"* → returns stats across all door services
- *"Rename 'door slab swap' to 'interior door swap' — it's clearer."* → updates name

The AI always shows what it's about to do and asks for confirmation before write operations.

## Pricing confidence: how rates evolve

Every service has a `confidence` level that reflects how settled the rate is:

```
unconfirmed  →  Researched range, never used in a real quote
                Display: "$X-Y" with question-mark badge
                Behavior: AI asks user to confirm rate first time it's used

low          →  Rate confirmed but only used 1-2 times  
                Display: "$X" with caution badge
                Behavior: AI may still surface comparable rates as a sanity check

medium       →  Used 3-9 times with consistent rate
                Display: "$X" with check badge
                Behavior: Rate used directly; flags only if outcome is unusual

high         →  Used 10+ times, stable rate, validated by win rate
                Display: "$X" with green check
                Behavior: Trusted; only re-evaluated on periodic reviews
```

Confidence rises automatically as services accumulate usage. Users can also set it manually if they want to lock in a rate without waiting for usage history.

## "Quick lookup, no add" flow

Sometimes you don't want to add anything — you just want to find an existing service mid-quote. The line item picker should be aggressively forgiving:

- Searches name, description, category, and synonym list
- Fuzzy match for typos
- Common abbreviations work ("dw" → drywall)
- Recent services bubble to the top
- Services used for this customer or property type bubble to the top
- Voice input works (just dictate "drywall patch")

If a search returns 1-3 strong matches, they're shown directly and you tap one. If 4+ matches or no clear winner, you see a list. If 0 matches, the add-paths from above appear.

## Discovery: the catalog as a teacher

Especially in the first 90 days, the catalog should *teach* you what to think about, not just store what you've thought about. Three mechanisms:

1. **The "what's missing" suggestion** — pulled from your job history. After your first 5 jobs, the AI surfaces things you've mentioned in vault items, transcripts, or invoice line items that aren't in the catalog. "You've mentioned 'gutter cleaning' in 3 conversations but it's not in your catalog. Want to add it?"

2. **Win rate analysis** — once you have data, the AI flags pricing issues:
   - "Your drywall patches have a 95% win rate — you might be leaving money on the table"
   - "Your full deck repair has only a 22% win rate over 9 quotes — consider revisiting the rate or scope"

3. **Periodic catalog review** — quarterly, the AI generates a catalog health report:
   - Services that need confidence promotion (used enough times to confirm)
   - Services with stale rates (no quotes in 6 months)
   - Services with no usage at all (consider archiving)
   - Categories that might be missing based on recent work

## What this connects to in the schema

The service_catalog table from migration 0007 already supports all of this:
- `confidence` field tracks the maturity of each rate
- `times_quoted` and `times_won` track usage
- `rate_low` / `rate_high` / `rate_confirmed` represent the evolution from range to confirmed value
- `is_active` enables soft archive

The AI tools in `catalog-tools.ts` provide the conversational surface:
- `list_services`, `get_service` for lookup
- `create_service`, `update_service`, `archive_service` for management
- `suggest_services_from_history` and `flag_services_for_review` for proactive guidance
- `get_pricing_research` for the "I'm not sure what to charge" path

The mid-quote UI (Path 1) gets built in Phase 1 alongside the quoting flow. The settings page (Path 2) gets built in Phase 1 as well, expanding in Phase 3 when the AI suggestions become available. Path 3 (conversational) works as soon as the AI assistant is wired up in Phase 3.
