# Capture & Ingestion Pipeline Spec

How content flows from the moment it's captured (mic press, photo snap, inbound text) to being a fully-indexed, entity-linked vault item.

## Overview

```
┌─────────────┐
│  Capture    │  Mobile mic, Plaud, inbound SMS/email/call, manual upload
└──────┬──────┘
       │ POST to /api/v1/captures (includes current GPS location)
       ▼
┌─────────────┐
│  Receive    │  Validate, store raw asset, create vault_item (status='pending')
└──────┬──────┘
       │ DB trigger: enrich_vault_item_from_location() fires
       ▼
┌──────────────┐
│ Geofence     │  If location is inside an active geofence, auto-populate
│ enrichment   │  customer_id + property_id + job_id at HIGH confidence
└──────┬───────┘  (99%; no AI guessing needed)
       │ enqueue background job
       ▼
┌─────────────┐
│  Transcribe │  (audio only) Whisper or Deepgram
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Diarize    │  (audio only) speaker labels
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Classify   │  Claude Haiku: type, entities mentioned, sentiment
│             │  (lower confidence threshold since geofence already pre-linked)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Resolve    │  Match remaining mentioned entities; merge with geofence-resolved
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Summarize  │  Claude Sonnet: structured summary using template for type
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Embed      │  text-embedding-3-large → store in pgvector
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Auto-route │  Apply suggested attachments (with low-confidence flags)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Automation │  Fire 'capture_uploaded' trigger; matching rules run
└──────┬──────┘  (e.g., auto-tag rule uses geofence data for high confidence)
       │
       ▼
┌─────────────┐
│  Notify     │  Push notification: "Recording processed, X actions suggested"
└─────────────┘
```

**Key integration: geofence enrichment happens BEFORE AI classification.** When a recording is captured inside a property geofence, `customer_id`, `property_id`, and `job_id` are already set on the vault_item by the time Claude sees it. This dramatically reduces ambiguity in entity resolution — instead of guessing "which Emily" from the transcript, the system already knows. The AI classifier only has to fill in what the location context didn't determine (action items, sentiment, dollar amounts, etc.).

## Capture sources

### A. Mobile quick-capture (Phase 2 priority)

The mobile app exposes a tap-and-hold record button on the home screen and inside any job detail view.

**Flow:**
1. User taps and holds → recording starts, haptic feedback
2. Audio waveform visualizes in UI
3. Release → upload begins immediately (chunked, resumable)
4. Optional context tagging: a chip strip appears with: "site walk", "client call", "debrief", "quote dictation", "supplier call", "general note"
5. Optional entity tagging: if user is currently viewing a job, that job is pre-attached
6. Optional photo attachments while recording (for "this is what I'm describing")

**Tech:**
- Expo AV for recording (mobile)
- Web Audio API for browser-based capture
- Direct multipart upload to Supabase Storage
- Optimistic UI: vault_item appears in user's feed instantly with "processing..." status

### B. Plaud integration (Phase 4)

Plaud doesn't have a public webhook API as of April 2026. Two integration paths:

**Path 1 (recommended): Plaud Cloud → Premier import**
- User connects Plaud account in Premier settings
- Premier polls Plaud's user-facing API endpoints (reverse-engineered from their app) every 15 minutes
- New recordings download to Premier and run through the same pipeline
- Mark imported recordings to avoid double-processing

**Path 2: Manual export → upload**
- User exports audio from Plaud app
- Uploads to Premier via web or mobile
- Pipeline same as quick-capture

Path 1 requires reverse engineering the Plaud API or using their export-to-cloud feature. Path 2 works today with no integration work.

### C. Inbound SMS (Phase 1)

Twilio number → webhook to /api/twilio/inbound-sms

**Flow:**
1. SMS arrives at your business number
2. Twilio POSTs to webhook with from, to, body, media URLs
3. Match `from` to a customer (by phone)
4. If matched: create `communication` row, link to most recent open job for that customer
5. If no match: create lead (orphan customer record), notify user
6. SMS body becomes a `vault_item` (type='sms_body') for searchability
7. Media (photos) → `vault_item` per image with AI captioning
8. Auto-classify: is this an action item? A question? A scheduling request?

### D. Inbound email (Phase 1)

Resend (or Postmark) inbound email parsing → webhook

**Flow:** Same as SMS but with email-specific parsing (subject line, threading via In-Reply-To, attachment handling)

### E. Inbound call (Phase 5)

Two modes:

**Mode 1: Voicemail transcription**
- Twilio voicemail → audio file → transcription pipeline → vault_item

**Mode 2: AI receptionist (Vapi or Retell)**
- AI agent answers call, qualifies, books, or transfers
- Full transcript + structured data (caller intent, callback info) → vault_item + lead/job

### F. Photos (Phase 1)

Photo upload from mobile app or via SMS. EXIF data preserved (geotag, timestamp).

**Flow:**
1. Upload to Supabase Storage
2. Create `vault_item` (type='photo')
3. Claude Sonnet vision generates caption
4. If geo-tagged, attempt to match to known property by location
5. Auto-attach to currently-viewed job if applicable

### G. Receipts (Phase 4)

Photo of a receipt → OCR + line item extraction.

**Flow:**
1. User snaps receipt photo (or forwards email receipt)
2. Vault item created with type='receipt'
3. Claude Sonnet vision extracts: vendor, date, line items (description + qty + price), total
4. Cross-reference line items against `materials` catalog (fuzzy match)
5. Create `material_prices` rows for matched items (source='receipt')
6. Suggest creating `job_material_uses` rows if a job is open and matches the receipt date/location
7. User confirms or edits

## Processing pipeline details

### Step 1: Receive

Endpoint: `POST /api/v1/captures`

```typescript
// Request body
{
  type: 'recording' | 'photo' | 'document' | 'note',
  source: 'mobile_quick_capture' | 'plaud' | 'manual_upload' | ...,
  
  // For files
  file_url?: string,           // pre-uploaded to storage, or
  file_data?: base64,           // small files inline
  mime_type?: string,
  
  // For text-only
  content?: string,
  
  // Context
  occurred_at?: string,         // ISO timestamp, defaults to now
  location?: { lat: number, lng: number },
  
  // Pre-attached entities
  customer_id?: string,
  property_id?: string,
  job_id?: string,
  
  // User-provided tags
  tags?: string[],
  context_label?: string,       // 'site_walk', 'client_call', etc.
}

// Response
{
  vault_item_id: string,
  status: 'pending',
  estimated_processing_seconds: number,
}
```

Implementation: Route handler at `app/api/v1/captures/route.ts`. Validates, creates row, enqueues background job via pg_net (see DECISIONS.md — no external queue).

### Step 2: Transcribe (audio only)

Provider abstraction layer in `packages/ai/transcription/providers/`. Default to Deepgram (fast, accurate, ~$0.0043/min) with Whisper fallback.

```typescript
async function transcribe(audioUrl: string, options: TranscribeOptions) {
  const provider = pickProvider(options);  // deepgram | whisper | local
  
  return provider.transcribe(audioUrl, {
    model: 'nova-3',                       // deepgram
    diarize: true,
    smart_format: true,
    punctuate: true,
    paragraphs: true,
    utterances: true,
    detect_language: true,
  });
}
```

Output stored in `vault_item.content` (full transcript) and `vault_item.speakers` (diarized segments).

### Step 3: Classify

Cheap Haiku call with structured output:

```typescript
const classification = await claude.messages.create({
  model: 'claude-haiku-4-5',
  max_tokens: 1000,
  system: CLASSIFICATION_SYSTEM_PROMPT,
  messages: [{
    role: 'user',
    content: `Classify this content from a contractor's day.

Content: ${transcript_or_content}

Source: ${source}
Geo: ${location ? 'yes' : 'no'}
Pre-attached: customer=${customer_id ? 'yes' : 'no'} job=${job_id ? 'yes' : 'no'}
`
  }],
  tools: [{
    name: 'classify',
    description: 'Submit classification',
    input_schema: {
      type: 'object',
      properties: {
        content_type: {
          type: 'string',
          enum: ['client_meeting', 'phone_call_outbound', 'phone_call_inbound', 
                 'site_walk', 'job_debrief', 'quote_dictation', 'supplier_call',
                 'personal_note', 'voicemail', 'general_observation', 'other'],
        },
        primary_topic: { type: 'string' },
        mentioned_customers: {
          type: 'array',
          items: { type: 'object', properties: {
            name: { type: 'string' },
            confidence: { type: 'number' },
          }},
        },
        mentioned_addresses: {
          type: 'array',
          items: { type: 'string' },
        },
        mentioned_dollar_amounts: {
          type: 'array',
          items: { type: 'object', properties: {
            amount: { type: 'number' },
            context: { type: 'string' },
            is_quote: { type: 'boolean' },
          }},
        },
        mentioned_dates: {
          type: 'array',
          items: { type: 'object', properties: {
            date_text: { type: 'string' },
            interpreted_iso: { type: 'string' },
            context: { type: 'string' },
          }},
        },
        action_items: {
          type: 'array',
          items: { type: 'object', properties: {
            text: { type: 'string' },
            assignee: { type: 'string', enum: ['me', 'crew', 'customer', 'supplier', 'unknown'] },
            due_hint: { type: 'string' },
          }},
        },
        sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative', 'urgent', 'mixed'] },
        suggested_tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['content_type', 'primary_topic', 'sentiment'],
    },
  }],
  tool_choice: { type: 'tool', name: 'classify' },
});
```

### Step 4: Resolve entities

For each mentioned customer/address, attempt to match to existing records:

```typescript
async function resolveEntities(classification, orgId) {
  const resolved = {
    customers: [],
    properties: [],
    jobs: [],
  };
  
  for (const mention of classification.mentioned_customers) {
    // Try fuzzy match on name + recent activity
    const matches = await db.rpc('lookup_customer_fuzzy', {
      org_id: orgId,
      query: mention.name,
      limit: 3,
    });
    
    if (matches.length === 1 && matches[0].score > 0.85) {
      resolved.customers.push({ ...mention, customer_id: matches[0].id, auto_resolved: true });
    } else if (matches.length > 0) {
      resolved.customers.push({ ...mention, candidates: matches, needs_confirmation: true });
    } else {
      resolved.customers.push({ ...mention, needs_creation: true });
    }
  }
  
  // Similar for addresses → properties
  // Similar for properties → recent open jobs
  
  return resolved;
}
```

### Step 5: Summarize

Sonnet call with template-based prompts. Templates per content_type:

- `site_walk` → site conditions, scope discussed, customer concerns, follow-ups
- `client_meeting` → topics covered, decisions, next steps, sentiment
- `job_debrief` → what went well, what didn't, materials used, time spent, lessons
- `quote_dictation` → structured quote data ready for create_quote tool
- `supplier_call` → vendor, items discussed, pricing, lead times, action items

These templates live in `packages/ai/prompts/summary-templates/` as Markdown files with placeholders.

### Step 6: Embed

```typescript
const embedding = await openai.embeddings.create({
  model: 'text-embedding-3-large',
  input: vaultItem.ai_summary || vaultItem.content,
  dimensions: 1536,
});

await db.update('vault_items')
  .set({ embedding: embedding.data[0].embedding })
  .where({ id: vaultItem.id });
```

### Step 7: Auto-route

Apply resolved entity links. Distinguish high-confidence (auto-attach) from low-confidence (suggest, require user confirm).

```typescript
const updates = {
  status: 'completed',
  processed_at: new Date(),
  ai_extracted_entities: resolved,
  ai_action_items: classification.action_items,
};

// Only attach if we're confident
if (resolved.customers.length === 1 && resolved.customers[0].auto_resolved) {
  updates.customer_id = resolved.customers[0].customer_id;
}

if (resolved.jobs.length === 1 && resolved.jobs[0].auto_resolved) {
  updates.job_id = resolved.jobs[0].job_id;
}

await db.update('vault_items').set(updates).where({ id: vaultItem.id });

// Create suggested action items as tasks (status='open' or 'proposed')
for (const ai of classification.action_items) {
  if (ai.assignee === 'me') {
    await db.insert('tasks').values({
      org_id: orgId,
      title: ai.text,
      ai_generated: true,
      due_at: parseDateHint(ai.due_hint),
      source_vault_id: vaultItem.id,
      customer_id: updates.customer_id,
      job_id: updates.job_id,
    });
  }
}

// If quote_dictation, draft a quote
if (classification.content_type === 'quote_dictation') {
  await proposeQuoteFromDictation(vaultItem, classification);
}
```

### Step 8: Notify

Push notification + in-app feed update:

```
"Recording from 2:34pm processed.
3 action items detected.
Suggested attaching to Emily / storm window job.
[Review] [Approve all]"
```

## Cost estimates

For a contractor doing ~5 recordings/day, 3 photos/day, 10 inbound SMS/day:

| Item | Per-event cost | Daily | Monthly |
|------|---------------|-------|---------|
| Transcription (avg 3 min recording) | $0.013 | $0.065 | $2 |
| Classification (Haiku) | $0.001 | $0.005 | $0.15 |
| Summary (Sonnet) | $0.005 | $0.025 | $0.75 |
| Photo caption (Sonnet vision) | $0.004 | $0.012 | $0.40 |
| Embedding | $0.0001 | $0.001 | $0.03 |
| **Total per user** | | | **~$3.50** |

Very affordable. Even with heavy use (20 recordings/day) it's under $20/mo.

## Failure modes & retry

- Transcription failure → retry once with alternate provider
- Classification failure → fallback to keyword-based heuristics, mark for manual classification
- Embedding failure → retry, eventually skip (item still searchable via full-text)
- Entity resolution low-confidence → never auto-attach, always show as suggestion

All failures logged to `vault_items.processing_error` and visible in admin UI.

## Privacy considerations

Recordings contain customer voices. Required handling:

- All recordings stored in your Supabase storage (not third-party AI providers)
- Anthropic API: ZDR mode enabled
- Deepgram: opt out of training
- User can delete any recording → soft delete in DB, hard delete from storage after 30 days
- Customer-facing disclosure on website: "We may record conversations for service quality"
- State law compliance: two-party consent states require explicit verbal consent at start of recording (UI prompts user)
