# AutoBay Lister

AI-powered eBay listing generator. Upload 1–8 photos of an item, get an editable listing draft, then publish (mock or real eBay).

## Setup

### Prerequisites

| Requirement | Notes |
|---|---|
| Node 22+ | Check with `node -v` |
| pnpm 10+ | Check with `pnpm -v` |
| LM Studio | Download at [lmstudio.ai](https://lmstudio.ai) — required for AI generation |

### 1. Install dependencies

```bash
# From the repo root
pnpm install
```

### 2. Configure environment

```bash
cp apps/autobay/.env.example apps/autobay/.env.local
```

Edit `apps/autobay/.env.local`:

```
LM_STUDIO_MODEL="your-model-name"   # must match model loaded in LM Studio
```

### 3. Set up the database

```bash
cd apps/autobay
pnpm db:push      # Creates prisma/dev.db (SQLite)
pnpm db:generate  # Generates Prisma client types
```

Or combined: `pnpm db:push && pnpm db:generate`

### 4. Start LM Studio

1. Open LM Studio on your PC
2. Load a **vision/multimodal** model — recommended:
   - `llama-3.2-11b-vision-instruct` (Meta, good quality)
   - `minicpm-v-2_6` (smaller, faster)
   - `llava-v1.6-mistral-7b`
3. Go to **Local Server** tab → **Start Server**
4. LM Studio listens on `http://localhost:1234` by default
5. Copy the model name exactly into `LM_STUDIO_MODEL` in `.env.local`

> **Text-only models won't analyze photos.** They'll return errors or hallucinations.
> If LM Studio is unreachable, the app generates a **mock draft** so you can still test the full UI flow.

### 5. Run the app

```bash
# From repo root:
pnpm --filter @premier/autobay dev

# Or from apps/autobay/:
pnpm dev
```

Open **http://localhost:3001**

---

## Core Flow

```
Dashboard → New Listing → Upload Photos (1-8)
→ Generate Listing (AI) → Review & Edit Draft
→ Save Draft → Publish to eBay (Mock)
```

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/listings` | GET | List all listings |
| `/api/listings/generate` | POST | Upload photos + generate AI draft |
| `/api/listings/[id]` | GET | Get single listing |
| `/api/listings/[id]` | PATCH | Update any fields |
| `/api/listings/[id]` | DELETE | Delete listing + photos |
| `/api/listings/[id]/generate` | POST | Re-run AI on existing listing |
| `/api/listings/[id]/publish` | POST | Mock-publish to eBay |

## Database

SQLite at `apps/autobay/prisma/dev.db`. View with:

```bash
cd apps/autobay && pnpm db:studio
```

Photos are stored locally at `apps/autobay/public/uploads/[listingId]/`.

## AI Output Contract

The AI always returns this JSON shape:

```json
{
  "title": "max 80 chars",
  "short_title": "max 40 chars",
  "category_guess": "eBay category",
  "condition_guess": "New|Like New|Very Good|Good|Acceptable|For Parts or Not Working",
  "description": "full description",
  "item_specifics": { "Brand": "Nike", "Size": "uncertain" },
  "visible_defects": ["scratch on left side"],
  "what_cannot_be_verified": ["working condition", "authenticity"],
  "suggested_price_range": { "low": 15, "high": 25, "reasoning": "..." },
  "shipping_recommendation": "USPS Priority Mail",
  "confidence_score": 0.72,
  "questions_for_user": ["Is this the 2021 or 2022 model?"],
  "search_keywords": ["nike", "sneaker", "size 10"]
}
```

Fields marked `"uncertain"` mean the AI couldn't confirm from photos — **review before publishing**.

## TODO: Real eBay Integration

1. Create a free developer account at https://developer.ebay.com
2. Create an app to get `Client ID` and `Client Secret`
3. Complete OAuth flow to get a user token
4. Add credentials to `.env.local`:
   ```
   EBAY_CLIENT_ID=...
   EBAY_CLIENT_SECRET=...
   EBAY_OAUTH_TOKEN=...
   ```
5. Replace `mockPublishToEbay` in `lib/ebay.ts` with the real implementation stub in the same file

## Assumptions Made

- **No auth**: All listings are local, no login required. Add Supabase auth later if multi-user is needed.
- **Local storage**: Photos stored in `public/uploads/`. In production, migrate to S3/Supabase Storage.
- **SQLite**: Single-user local database. Swap for Postgres/Supabase when deploying to cloud.
- **LM Studio**: Requires a vision model. Text-only models cannot analyze photos.
- **eBay mock**: No real eBay calls. The mock generates a fake listing ID and URL for UI testing.
- **Mobile-first**: Max-width 512px container, large touch targets, phone camera support.
