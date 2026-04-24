-- Premier CRM — Vault & Communications
-- Migration: 0003_vault_and_comms
--
-- The semantic layer of the brain. Recordings, transcripts, photos,
-- communications — everything that flows in becomes searchable here.

-- ============================================================================
-- COMMUNICATIONS — unified thread per job
-- ============================================================================

CREATE TYPE comm_channel AS ENUM ('sms', 'email', 'call', 'portal_message', 'in_person', 'other');
CREATE TYPE comm_direction AS ENUM ('inbound', 'outbound');

CREATE TABLE communications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Routing
  customer_id     UUID REFERENCES customers(id),
  job_id          UUID REFERENCES jobs(id),
  property_id     UUID REFERENCES properties(id),
  
  channel         comm_channel NOT NULL,
  direction       comm_direction NOT NULL,
  
  -- Participants
  from_address    TEXT,                            -- phone or email
  to_address      TEXT,
  cc_addresses    TEXT[],
  
  -- Content
  subject         TEXT,
  body            TEXT,
  body_html       TEXT,                            -- for emails
  
  -- Attachments (stored separately as vault_items)
  attachment_ids  UUID[],
  
  -- Provider metadata
  provider        TEXT,                            -- 'twilio', 'resend', 'manual'
  provider_message_id TEXT,
  provider_metadata   JSONB,
  
  -- AI processing
  sentiment       TEXT,                            -- 'positive', 'neutral', 'negative', 'urgent'
  summary         TEXT,
  action_items    JSONB,                            -- [{text, due_date, assignee}]
  
  -- Status
  is_read         BOOLEAN DEFAULT false,
  read_at         TIMESTAMPTZ,
  
  -- Lifecycle
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON communications (org_id, occurred_at DESC);
CREATE INDEX ON communications (customer_id, occurred_at DESC);
CREATE INDEX ON communications (job_id, occurred_at DESC);
CREATE INDEX ON communications (org_id, is_read) WHERE direction = 'inbound';
CREATE INDEX ON communications USING gin (body gin_trgm_ops);

CREATE TRIGGER communications_updated_at BEFORE UPDATE ON communications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- VAULT — the semantic memory layer
-- ============================================================================

CREATE TYPE vault_item_type AS ENUM (
  'recording',           -- audio file (raw)
  'transcript',          -- transcribed text from recording
  'photo',               -- image with optional AI caption
  'note',                -- typed note
  'email_body',          -- mirror of email content
  'sms_body',            -- mirror of sms content
  'call_summary',        -- AI summary of phone call
  'document',            -- PDF, DOC, etc.
  'receipt',             -- material receipt with extracted line items
  'quote_text',          -- quote content as searchable text
  'invoice_text',        -- invoice content as searchable text
  'job_summary',         -- AI-generated job summary
  'customer_summary',    -- AI-generated customer profile
  'manual_entry',        -- generic
  'web_extract'          -- content scraped from URL
);

CREATE TYPE vault_source AS ENUM (
  'mobile_quick_capture',
  'plaud',
  'inbound_sms',
  'inbound_email',
  'inbound_call',
  'manual_upload',
  'manual_typed',
  'system_generated',
  'web_capture'
);

CREATE TABLE vault_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Type & source
  type            vault_item_type NOT NULL,
  source          vault_source NOT NULL,
  
  -- Content
  title           TEXT,
  content         TEXT NOT NULL,                   -- the searchable text
  raw_content     TEXT,                            -- original before processing if different
  
  -- Storage refs
  audio_url       TEXT,                            -- for recordings
  image_url       TEXT,                            -- for photos
  document_url    TEXT,                            -- for documents
  thumbnail_url   TEXT,
  
  -- Audio specific
  duration_seconds INTEGER,
  speakers        JSONB,                            -- [{label: "Kevin", segments: [...]}]
  
  -- Image specific
  ai_caption      TEXT,                            -- AI-generated description
  exif_data       JSONB,                            -- camera metadata
  
  -- Geo
  location        GEOGRAPHY(POINT, 4326),
  geo_address     TEXT,                            -- reverse-geocoded
  
  -- Entity links (a vault item can be attached to multiple entities)
  customer_id     UUID REFERENCES customers(id),
  property_id     UUID REFERENCES properties(id),
  job_id          UUID REFERENCES jobs(id),
  phase_id        UUID REFERENCES job_phases(id),
  communication_id UUID REFERENCES communications(id),
  
  -- Tags & metadata
  tags            TEXT[] DEFAULT '{}',
  metadata        JSONB DEFAULT '{}'::jsonb,
  
  -- AI processing state
  processing_status TEXT DEFAULT 'pending',         -- 'pending', 'processing', 'completed', 'failed'
  processing_error  TEXT,
  classified_type   TEXT,                           -- AI's guess at what this is
  ai_summary        TEXT,
  ai_action_items   JSONB,                          -- [{text, due_date, assignee}]
  ai_extracted_entities JSONB,                      -- {customers: [...], properties: [...], etc.}
  ai_sentiment      TEXT,
  
  -- Embedding for semantic search
  embedding       VECTOR(1536),
  
  -- Lifecycle
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),  -- when the event happened (recording start, photo taken)
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),  -- when it entered the system
  processed_at    TIMESTAMPTZ,
  
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for the queries the assistant will actually run
CREATE INDEX ON vault_items (org_id, occurred_at DESC);
CREATE INDEX ON vault_items (org_id, type, occurred_at DESC);
CREATE INDEX ON vault_items (customer_id, occurred_at DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX ON vault_items (property_id, occurred_at DESC) WHERE property_id IS NOT NULL;
CREATE INDEX ON vault_items (job_id, occurred_at DESC) WHERE job_id IS NOT NULL;
CREATE INDEX ON vault_items USING gin (tags);
CREATE INDEX ON vault_items USING gin (content gin_trgm_ops);
CREATE INDEX ON vault_items USING ivfflat (embedding vector_cosine_ops) WITH (lists = 200);
CREATE INDEX ON vault_items (processing_status) WHERE processing_status != 'completed';
CREATE INDEX ON vault_items USING gist (location) WHERE location IS NOT NULL;

CREATE TRIGGER vault_items_updated_at BEFORE UPDATE ON vault_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- TASKS / ACTION ITEMS
-- ============================================================================
-- Extracted from vault items, communications, or created manually.

CREATE TYPE task_status AS ENUM ('open', 'in_progress', 'done', 'cancelled', 'snoozed');
CREATE TYPE task_priority AS ENUM ('low', 'normal', 'high', 'urgent');

CREATE TABLE tasks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  title           TEXT NOT NULL,
  description     TEXT,
  
  status          task_status NOT NULL DEFAULT 'open',
  priority        task_priority NOT NULL DEFAULT 'normal',
  
  -- Linked entities
  customer_id     UUID REFERENCES customers(id),
  property_id     UUID REFERENCES properties(id),
  job_id          UUID REFERENCES jobs(id),
  source_vault_id UUID REFERENCES vault_items(id),
  source_comm_id  UUID REFERENCES communications(id),
  
  -- Assignment
  assigned_to     UUID REFERENCES auth.users(id),
  
  -- Scheduling
  due_at          TIMESTAMPTZ,
  snoozed_until   TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  
  -- AI metadata
  ai_generated    BOOLEAN DEFAULT false,
  
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON tasks (org_id, status, due_at);
CREATE INDEX ON tasks (assigned_to, status) WHERE status IN ('open', 'in_progress');
CREATE INDEX ON tasks (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX ON tasks (job_id) WHERE job_id IS NOT NULL;

CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- ASSISTANT CONVERSATIONS
-- ============================================================================
-- The chat history with Premier Brain.

CREATE TABLE assistant_conversations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  
  title           TEXT,                            -- AI-generated short title
  context_type    TEXT,                            -- 'general', 'job', 'customer', 'briefing'
  context_id      UUID,                            -- the entity ID if scoped
  
  message_count   INTEGER DEFAULT 0,
  total_tokens_in  INTEGER DEFAULT 0,
  total_tokens_out INTEGER DEFAULT 0,
  
  archived        BOOLEAN DEFAULT false,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON assistant_conversations (user_id, updated_at DESC) WHERE NOT archived;

CREATE TRIGGER assistant_conversations_updated_at BEFORE UPDATE ON assistant_conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TYPE message_role AS ENUM ('user', 'assistant', 'tool', 'system');

CREATE TABLE assistant_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
  
  role            message_role NOT NULL,
  content         TEXT,                            -- text content
  tool_calls      JSONB,                            -- [{name, args, result}]
  
  -- Token accounting
  tokens_in       INTEGER,
  tokens_out      INTEGER,
  model           TEXT,
  cost_usd        NUMERIC(10,6),
  
  -- For audit
  ip_address      INET,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON assistant_messages (conversation_id, created_at);

-- ============================================================================
-- ASSISTANT ACTIONS — audit log of writes
-- ============================================================================
-- Every CRM write the assistant performs gets logged here for review.

CREATE TYPE action_status AS ENUM ('proposed', 'approved', 'executed', 'rejected', 'failed');

CREATE TABLE assistant_actions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES assistant_conversations(id),
  message_id      UUID REFERENCES assistant_messages(id),
  
  tool_name       TEXT NOT NULL,                   -- e.g. 'create_quote', 'send_message'
  tool_args       JSONB NOT NULL,
  tool_result     JSONB,
  
  status          action_status NOT NULL DEFAULT 'proposed',
  
  -- For mutations: the entity affected
  affected_entity_type TEXT,
  affected_entity_id   UUID,
  
  -- Approval
  approved_by     UUID REFERENCES auth.users(id),
  approved_at     TIMESTAMPTZ,
  rejected_reason TEXT,
  
  -- Execution
  executed_at     TIMESTAMPTZ,
  error_message   TEXT,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON assistant_actions (org_id, created_at DESC);
CREATE INDEX ON assistant_actions (status, created_at) WHERE status = 'proposed';

-- ============================================================================
-- DAILY BRIEFINGS — generated each morning
-- ============================================================================

CREATE TABLE daily_briefings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  
  briefing_date   DATE NOT NULL,
  
  -- Structured sections (JSON for flexibility)
  todays_jobs     JSONB,
  pending_followups JSONB,
  open_action_items JSONB,
  anomalies       JSONB,
  opportunities   JSONB,
  
  -- The full text version
  rendered_text   TEXT,
  rendered_html   TEXT,
  
  -- Delivery
  delivered_at    TIMESTAMPTZ,
  delivery_method TEXT[],                          -- ['push', 'email']
  read_at         TIMESTAMPTZ,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, briefing_date)
);

CREATE INDEX ON daily_briefings (org_id, briefing_date DESC);
CREATE INDEX ON daily_briefings (user_id, briefing_date DESC);

-- ============================================================================
-- AI USAGE TRACKING
-- ============================================================================
-- Per-feature cost tracking so we know what's expensive.

CREATE TABLE ai_usage_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id),
  
  feature         TEXT NOT NULL,                   -- 'voice_to_quote', 'autopilot', 'briefing', etc.
  model           TEXT NOT NULL,
  provider        TEXT NOT NULL,                   -- 'anthropic', 'openai', 'deepgram'
  
  tokens_in       INTEGER,
  tokens_out      INTEGER,
  audio_seconds   NUMERIC(10,2),
  cost_usd        NUMERIC(10,6),
  
  -- Reference back to what triggered it
  vault_item_id   UUID REFERENCES vault_items(id),
  conversation_id UUID REFERENCES assistant_conversations(id),
  
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON ai_usage_events (org_id, occurred_at DESC);
CREATE INDEX ON ai_usage_events (org_id, feature, occurred_at DESC);

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation_communications" ON communications
  FOR ALL USING (user_is_in_org(org_id));

CREATE POLICY "org_isolation_vault_items" ON vault_items
  FOR ALL USING (user_is_in_org(org_id));

CREATE POLICY "org_isolation_tasks" ON tasks
  FOR ALL USING (user_is_in_org(org_id));

CREATE POLICY "user_own_conversations" ON assistant_conversations
  FOR ALL USING (user_id = auth.uid() AND user_is_in_org(org_id));

CREATE POLICY "messages_via_conversation" ON assistant_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM assistant_conversations 
      WHERE id = conversation_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "org_isolation_actions" ON assistant_actions
  FOR ALL USING (user_is_in_org(org_id));

CREATE POLICY "user_own_briefings" ON daily_briefings
  FOR ALL USING (user_id = auth.uid() AND user_is_in_org(org_id));

CREATE POLICY "org_isolation_usage" ON ai_usage_events
  FOR ALL USING (user_is_in_org(org_id));
