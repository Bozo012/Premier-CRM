ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS estimate_id UUID REFERENCES public.estimates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS quotes_estimate_id_idx ON public.quotes(estimate_id)
  WHERE estimate_id IS NOT NULL;
