# Starter Data & Cold Start

How Premier goes from empty database to useful from day 1, including importing from Jobber.

## The cold start problem

A brand new Premier install has:
- Zero customers
- Zero properties  
- Zero quotes or invoices
- Zero vault items
- Zero automation history

Every "intelligent" feature (semantic search, similar-job lookup, win-rate analysis, anomaly detection) requires data. So either:
- We're honest about empty state and degrade gracefully (table-stakes)
- We bootstrap with real data on day 1 (huge accelerator)

For Kevin, we're doing both.

## Phase 0.5: Jobber import (between deploy and first use)

Kevin currently uses Jobber. Jobber supports CSV exports for:
- Clients (customers + their addresses)
- Properties (their address book)
- Quotes (line items, totals, status)
- Invoices (line items, payments, balances)
- Jobs (scheduling, status, notes)
- Visits (time entries on jobs)

The import flow:

```
1. Kevin exports from Jobber:
   Settings → Integrations → Data Export → CSV
   Selects all entities, downloads ZIP

2. Upload via Premier setup wizard:
   /setup/import → drag and drop ZIP
   System detects which CSVs are present

3. Import preview:
   Shows count per entity
   Field mapping (auto-detected, user can adjust)
   "I see 47 customers, 62 properties, 23 active jobs..."

4. Validation pass:
   Checks for duplicates (same email, same address)
   Flags rows that won't import cleanly (missing required fields)
   Kevin reviews/fixes inline

5. Import execution:
   Customers first (no dependencies)
   Properties next (depend on customers via customer_properties)
   Jobs (depend on customer + property)
   Quotes (depend on job)
   Invoices (depend on quote + job)
   Time entries (depend on job)
   
6. Post-import enrichment:
   Geocode all property addresses (creates auto-geofences via trigger)
   Classify customer archetypes via AI (residential vs landlord, based on number of properties owned)
   Embed historical quote line items for similarity search
   
7. Done — full dashboard with real data
```

## Implementation: the importer

Lives in `apps/web/app/setup/import/`:

```
import/
├── page.tsx              Setup wizard UI
├── actions.ts            Server actions for upload + execute
└── lib/
    ├── jobber-parser.ts  Parses Jobber CSV format → normalized
    ├── field-mapper.ts   Auto-detects field correspondences
    ├── deduplicator.ts   Finds likely duplicates
    └── executor.ts       Batch insert with progress tracking
```

Key implementation notes for Claude Code:

- **Use a transaction per entity batch** — if customers fail, don't import properties
- **Show progress UI** — Kevin will be watching it import 100+ records
- **Stream results to client** via Server-Sent Events or Supabase realtime
- **Idempotent** — running the import twice should not create duplicates (use a `jobber_id` field for matching)
- **Rollback option** — within 24 hours of import, allow "undo this import" that nukes everything imported in that batch

### Adding `jobber_id` to imported tables

Add to migration 0009 (or whenever the importer is built):

```sql
ALTER TABLE customers   ADD COLUMN jobber_id TEXT UNIQUE;
ALTER TABLE properties  ADD COLUMN jobber_id TEXT UNIQUE;
ALTER TABLE jobs        ADD COLUMN jobber_id TEXT UNIQUE;
ALTER TABLE quotes      ADD COLUMN jobber_id TEXT UNIQUE;
ALTER TABLE invoices    ADD COLUMN jobber_id TEXT UNIQUE;
ALTER TABLE time_entries ADD COLUMN jobber_id TEXT UNIQUE;
```

This lets us:
- Detect duplicates on re-import
- Trace back to original Jobber record if something looks wrong
- Eventually do incremental sync if desired (probably not, one-time export is enough)

## Manual data entry as fallback

If Jobber export is unavailable or inadequate, the system falls back to:

### AI-assisted customer entry

Kevin tells the AI: *"Add Emily Henderson, 1247 Maple Lane Ft Wright, phone 555-1234, has hired me 4 times for handyman stuff."*

AI extracts entities, calls `create_customer` + `create_property` + `create_customer_property` tools, sets archetype to `residential_repeat`, and confirms.

### CSV import for ad-hoc data

Generic CSV import accepts any reasonable format. Field mapper UI lets Kevin map columns to fields visually.

### Bulk paste from contacts

iPhone Contacts → share → paste → AI parses and creates customers.

## What doesn't import (and how to handle it)

Some Jobber data won't carry over cleanly:

| Data | Why not | Workaround |
|------|---------|------------|
| Jobber's internal notes | Free text, hard to attribute | Import as vault items (`type='note'`, `source='import'`) attached to right entity |
| Photos in Jobber | Format/links uncertain | If exportable, ZIP upload to vault separately |
| Custom fields | Jobber-specific, no equivalent | Capture in customer notes field |
| Recurring schedule templates | Different model | Recreate manually in Premier |
| Time entries with no GPS | Pre-Premier | Import without location data, mark `auto_generated=false, user_confirmed=true` |

## Gradual data accumulation strategy

After import, the system will be useful but still data-thin in some dimensions. Here's how it gets richer:

### Week 1-2 of real use

Premier has imported customers/properties/past jobs. Vault is empty. Embeddings unbuilt.

- Use system normally for new quotes/invoices
- Capture starts adding to vault
- Each new vault item triggers embedding
- "Find similar jobs" works based on imported quote line items + new captures

### Week 3-4

Vault has 20-50 items, automation history starting.

- Daily briefing becomes useful (real "what changed yesterday" content)
- Search returns relevant results
- AI can reference past jobs in chat

### Month 2

Premier has multiple weeks of fresh data + historical Jobber import.

- Pricing intelligence has enough data points to flag anomalies
- Win rate per service starts being meaningful
- AI suggestions for catalog additions become valuable

### Month 3+

Full system value emerging. Confidence-tracked rates start auto-promoting from `unconfirmed` to `medium`/`high`.

## Demo data for development

For local development without using Premier's real data, `supabase/seed.sql` provides a representative demo set:

- 1 fake org (TestCo Maintenance)
- 8 fake customers across all archetypes
- 12 fake properties
- ~30 historical jobs spanning 6 months
- ~50 quotes (mix of won/lost/pending)
- ~40 invoices
- ~20 vault items (synthetic transcripts, photos)
- Geofences, automations, full coverage

This is for development only — never run against production.

## What Claude Code should do

When implementing the importer in Phase 0.5:

1. Start with a single entity (customers) to validate the architecture
2. Use Zod schemas in `@premier/shared/schemas/import` for validation
3. Server action handles upload, parses CSV in chunks (don't load 10k rows into memory)
4. Insert in batches of 100 with `INSERT ... ON CONFLICT (jobber_id) DO NOTHING`
5. Report counts: imported, skipped (duplicates), failed (with reasons)
6. After all entities done, enqueue background jobs for:
   - Geocoding properties without location
   - Embedding existing quote line items
   - AI archetype classification for customers
7. Show import summary + "what's next" guide

## What Kevin should do tomorrow

1. Export from Jobber (Settings → Data → Export)
2. Wait for email with download link (Jobber sends async)
3. Have ZIP file ready for when Phase 0.5 importer is built
4. Don't manually enter customers — wait for import
