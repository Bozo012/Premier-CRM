-- Premier CRM — Search Functions
-- Migration: 0004_search_functions
--
-- The semantic + structured hybrid search functions the assistant uses.

-- ============================================================================
-- Hybrid vault search
-- ============================================================================
-- Combines vector similarity, full-text search, and structured filters.
-- This is the single most important function for the assistant.

CREATE OR REPLACE FUNCTION search_vault(
  search_org_id     UUID,
  query_text        TEXT DEFAULT NULL,
  query_embedding   VECTOR(1536) DEFAULT NULL,
  
  -- Filters
  filter_customer_id UUID DEFAULT NULL,
  filter_property_id UUID DEFAULT NULL,
  filter_job_id     UUID DEFAULT NULL,
  filter_types      vault_item_type[] DEFAULT NULL,
  filter_tags       TEXT[] DEFAULT NULL,
  filter_after      TIMESTAMPTZ DEFAULT NULL,
  filter_before     TIMESTAMPTZ DEFAULT NULL,
  
  -- Tuning
  semantic_weight   NUMERIC DEFAULT 0.7,
  text_weight       NUMERIC DEFAULT 0.3,
  similarity_threshold NUMERIC DEFAULT 0.5,
  
  result_limit      INTEGER DEFAULT 20
)
RETURNS TABLE (
  id              UUID,
  type            vault_item_type,
  title           TEXT,
  content         TEXT,
  ai_summary      TEXT,
  customer_id     UUID,
  property_id     UUID,
  job_id          UUID,
  occurred_at     TIMESTAMPTZ,
  semantic_score  NUMERIC,
  text_score      NUMERIC,
  combined_score  NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH semantic AS (
    SELECT 
      v.id,
      CASE 
        WHEN query_embedding IS NOT NULL 
        THEN 1 - (v.embedding <=> query_embedding)
        ELSE 0
      END AS score
    FROM vault_items v
    WHERE v.org_id = search_org_id
      AND v.embedding IS NOT NULL
      AND (query_embedding IS NULL OR 1 - (v.embedding <=> query_embedding) > similarity_threshold)
  ),
  textual AS (
    SELECT 
      v.id,
      CASE 
        WHEN query_text IS NOT NULL 
        THEN GREATEST(
          similarity(v.content, query_text),
          similarity(COALESCE(v.title, ''), query_text),
          similarity(COALESCE(v.ai_summary, ''), query_text)
        )
        ELSE 0
      END AS score
    FROM vault_items v
    WHERE v.org_id = search_org_id
      AND query_text IS NOT NULL
  ),
  combined AS (
    SELECT 
      COALESCE(s.id, t.id) AS id,
      COALESCE(s.score, 0) AS sem_score,
      COALESCE(t.score, 0) AS txt_score,
      (COALESCE(s.score, 0) * semantic_weight + COALESCE(t.score, 0) * text_weight) AS combined
    FROM semantic s
    FULL OUTER JOIN textual t ON s.id = t.id
  )
  SELECT 
    v.id,
    v.type,
    v.title,
    v.content,
    v.ai_summary,
    v.customer_id,
    v.property_id,
    v.job_id,
    v.occurred_at,
    c.sem_score,
    c.txt_score,
    c.combined
  FROM vault_items v
  JOIN combined c ON c.id = v.id
  WHERE v.org_id = search_org_id
    AND (filter_customer_id IS NULL OR v.customer_id = filter_customer_id)
    AND (filter_property_id IS NULL OR v.property_id = filter_property_id)
    AND (filter_job_id IS NULL OR v.job_id = filter_job_id)
    AND (filter_types IS NULL OR v.type = ANY(filter_types))
    AND (filter_tags IS NULL OR v.tags && filter_tags)
    AND (filter_after IS NULL OR v.occurred_at >= filter_after)
    AND (filter_before IS NULL OR v.occurred_at <= filter_before)
  ORDER BY c.combined DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- Find similar past jobs (for "we've done this before" memory)
-- ============================================================================

CREATE OR REPLACE FUNCTION find_similar_jobs(
  search_org_id     UUID,
  query_embedding   VECTOR(1536),
  exclude_job_id    UUID DEFAULT NULL,
  result_limit      INTEGER DEFAULT 5
)
RETURNS TABLE (
  job_id          UUID,
  title           TEXT,
  customer_name   TEXT,
  property_address TEXT,
  completed_at    TIMESTAMPTZ,
  total_quoted    NUMERIC,
  total_invoiced  NUMERIC,
  similarity      NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.id,
    j.title,
    c.display_name,
    p.address_line_1,
    j.actual_end,
    j.quoted_total,
    j.invoiced_total,
    1 - (j.embedding <=> query_embedding)
  FROM jobs j
  JOIN customers c ON c.id = j.customer_id
  JOIN properties p ON p.id = j.property_id
  WHERE j.org_id = search_org_id
    AND j.embedding IS NOT NULL
    AND (exclude_job_id IS NULL OR j.id != exclude_job_id)
    AND j.status IN ('completed', 'invoiced', 'paid')
  ORDER BY j.embedding <=> query_embedding
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- Pricing intelligence query
-- ============================================================================
-- Given a service and a zip, return historical pricing stats.

CREATE OR REPLACE FUNCTION get_pricing_intelligence(
  search_org_id   UUID,
  search_service_id UUID,
  search_zip      TEXT,
  lookback_months INTEGER DEFAULT 12
)
RETURNS TABLE (
  sample_size     INTEGER,
  median_price    NUMERIC,
  p25_price       NUMERIC,
  p75_price       NUMERIC,
  min_price       NUMERIC,
  max_price       NUMERIC,
  win_rate        NUMERIC,
  avg_won_price   NUMERIC,
  avg_lost_price  NUMERIC,
  last_quoted_at  TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER AS sample_size,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY q.unit_price)::NUMERIC AS median_price,
    percentile_cont(0.25) WITHIN GROUP (ORDER BY q.unit_price)::NUMERIC AS p25_price,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY q.unit_price)::NUMERIC AS p75_price,
    MIN(q.unit_price) AS min_price,
    MAX(q.unit_price) AS max_price,
    AVG(CASE WHEN q.outcome = 'won' THEN 1.0 ELSE 0.0 END) AS win_rate,
    AVG(q.unit_price) FILTER (WHERE q.outcome = 'won') AS avg_won_price,
    AVG(q.unit_price) FILTER (WHERE q.outcome = 'lost') AS avg_lost_price,
    MAX(q.quoted_at) AS last_quoted_at
  FROM quote_line_items q
  WHERE q.org_id = search_org_id
    AND q.service_id = search_service_id
    AND (search_zip IS NULL OR q.zip_code = search_zip)
    AND q.quoted_at > now() - (lookback_months || ' months')::INTERVAL;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- Customer 360 — everything about a customer in one query
-- ============================================================================

CREATE OR REPLACE FUNCTION get_customer_360(
  search_org_id   UUID,
  search_customer_id UUID
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'customer', to_jsonb(c.*),
    'properties', (
      SELECT jsonb_agg(to_jsonb(p.*))
      FROM properties p
      JOIN customer_properties cp ON cp.property_id = p.id
      WHERE cp.customer_id = c.id
    ),
    'recent_jobs', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', j.id,
        'title', j.title,
        'status', j.status,
        'scheduled_start', j.scheduled_start,
        'total', j.invoiced_total
      ) ORDER BY j.created_at DESC)
      FROM jobs j
      WHERE j.customer_id = c.id
      LIMIT 10
    ),
    'open_quotes', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', q.id,
        'job_title', j.title,
        'total', q.total,
        'sent_at', q.sent_at
      ))
      FROM quotes q
      JOIN jobs j ON j.id = q.job_id
      WHERE j.customer_id = c.id
        AND q.status IN ('sent', 'viewed')
    ),
    'unpaid_invoices', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id,
        'amount_due', i.amount_due,
        'due_date', i.due_date,
        'days_overdue', GREATEST(0, CURRENT_DATE - i.due_date)
      ))
      FROM invoices i
      JOIN jobs j ON j.id = i.job_id
      WHERE j.customer_id = c.id
        AND i.status NOT IN ('paid', 'void')
    ),
    'recent_communications', (
      SELECT jsonb_agg(jsonb_build_object(
        'channel', cm.channel,
        'direction', cm.direction,
        'subject', cm.subject,
        'body_preview', LEFT(cm.body, 200),
        'occurred_at', cm.occurred_at,
        'sentiment', cm.sentiment
      ) ORDER BY cm.occurred_at DESC)
      FROM (
        SELECT * FROM communications
        WHERE customer_id = c.id
        ORDER BY occurred_at DESC
        LIMIT 10
      ) cm
    ),
    'open_tasks', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'due_at', t.due_at,
        'priority', t.priority
      ))
      FROM tasks t
      WHERE t.customer_id = c.id
        AND t.status IN ('open', 'in_progress')
    ),
    'stats', jsonb_build_object(
      'total_jobs', c.total_jobs,
      'total_revenue', c.total_revenue,
      'last_contact_at', c.last_contact_at,
      'last_job_completed_at', c.last_job_completed_at
    )
  ) INTO result
  FROM customers c
  WHERE c.id = search_customer_id
    AND c.org_id = search_org_id;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- Property memory — what's been done at this address
-- ============================================================================

CREATE OR REPLACE FUNCTION get_property_memory(
  search_org_id   UUID,
  search_property_id UUID
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'property', to_jsonb(p.*),
    'all_owners', (
      SELECT jsonb_agg(jsonb_build_object(
        'customer', to_jsonb(c.*),
        'relationship', cp.relationship,
        'is_primary', cp.is_primary
      ))
      FROM customer_properties cp
      JOIN customers c ON c.id = cp.customer_id
      WHERE cp.property_id = p.id
    ),
    'all_jobs', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', j.id,
        'title', j.title,
        'description', j.description,
        'status', j.status,
        'completed_at', j.actual_end,
        'total', j.invoiced_total,
        'category', sc.name
      ) ORDER BY j.created_at DESC)
      FROM jobs j
      LEFT JOIN service_categories sc ON sc.id = j.category_id
      WHERE j.property_id = p.id
    ),
    'recent_photos', (
      SELECT jsonb_agg(jsonb_build_object(
        'url', v.image_url,
        'caption', v.ai_caption,
        'job_id', v.job_id,
        'occurred_at', v.occurred_at
      ) ORDER BY v.occurred_at DESC)
      FROM (
        SELECT * FROM vault_items
        WHERE property_id = p.id 
          AND type = 'photo'
        ORDER BY occurred_at DESC
        LIMIT 20
      ) v
    ),
    'notes_and_recordings', (
      SELECT jsonb_agg(jsonb_build_object(
        'type', v.type,
        'title', v.title,
        'summary', v.ai_summary,
        'content_preview', LEFT(v.content, 300),
        'occurred_at', v.occurred_at
      ) ORDER BY v.occurred_at DESC)
      FROM (
        SELECT * FROM vault_items
        WHERE property_id = p.id 
          AND type IN ('recording', 'transcript', 'note', 'job_summary')
        ORDER BY occurred_at DESC
        LIMIT 30
      ) v
    )
  ) INTO result
  FROM properties p
  WHERE p.id = search_property_id
    AND p.org_id = search_org_id;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- Anomaly detection — jobs that need attention
-- ============================================================================

CREATE OR REPLACE FUNCTION find_job_anomalies(search_org_id UUID)
RETURNS TABLE (
  job_id          UUID,
  job_title       TEXT,
  anomaly_type    TEXT,
  severity        TEXT,
  details         JSONB
) AS $$
BEGIN
  RETURN QUERY
  -- Jobs over labor budget
  SELECT 
    j.id,
    j.title,
    'labor_overrun'::TEXT,
    CASE 
      WHEN labor_pct > 1.5 THEN 'high'
      WHEN labor_pct > 1.2 THEN 'medium'
      ELSE 'low'
    END,
    jsonb_build_object(
      'estimated_minutes', j.estimated_duration_minutes,
      'actual_minutes', actual_minutes,
      'pct_over', ROUND((labor_pct - 1) * 100, 1)
    )
  FROM jobs j
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(duration_minutes), 0) AS actual_minutes
    FROM time_entries WHERE job_id = j.id
  ) te
  CROSS JOIN LATERAL (
    SELECT CASE 
      WHEN j.estimated_duration_minutes > 0 
      THEN te.actual_minutes::NUMERIC / j.estimated_duration_minutes 
      ELSE 0 
    END AS labor_pct
  ) calc
  WHERE j.org_id = search_org_id
    AND j.status = 'in_progress'
    AND j.estimated_duration_minutes IS NOT NULL
    AND labor_pct > 1.1
  
  UNION ALL
  
  -- Stale leads (no contact in 7+ days)
  SELECT 
    j.id,
    j.title,
    'stale_lead'::TEXT,
    'medium'::TEXT,
    jsonb_build_object(
      'days_since_contact', EXTRACT(DAY FROM now() - j.updated_at)::INTEGER
    )
  FROM jobs j
  WHERE j.org_id = search_org_id
    AND j.status = 'lead'
    AND j.updated_at < now() - INTERVAL '7 days'
  
  UNION ALL
  
  -- Quotes sent but not viewed in 3+ days
  SELECT 
    j.id,
    j.title,
    'quote_unviewed'::TEXT,
    'medium'::TEXT,
    jsonb_build_object(
      'quote_id', q.id,
      'sent_at', q.sent_at,
      'days_since_sent', EXTRACT(DAY FROM now() - q.sent_at)::INTEGER
    )
  FROM quotes q
  JOIN jobs j ON j.id = q.job_id
  WHERE q.org_id = search_org_id
    AND q.status = 'sent'
    AND q.sent_at < now() - INTERVAL '3 days'
  
  UNION ALL
  
  -- Overdue invoices
  SELECT 
    j.id,
    j.title,
    'invoice_overdue'::TEXT,
    CASE 
      WHEN i.due_date < CURRENT_DATE - INTERVAL '30 days' THEN 'high'
      WHEN i.due_date < CURRENT_DATE - INTERVAL '14 days' THEN 'medium'
      ELSE 'low'
    END,
    jsonb_build_object(
      'invoice_id', i.id,
      'amount_due', i.amount_due,
      'days_overdue', CURRENT_DATE - i.due_date
    )
  FROM invoices i
  JOIN jobs j ON j.id = i.job_id
  WHERE i.org_id = search_org_id
    AND i.status NOT IN ('paid', 'void')
    AND i.due_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql STABLE;
