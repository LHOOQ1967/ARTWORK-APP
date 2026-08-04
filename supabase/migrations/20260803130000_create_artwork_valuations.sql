CREATE TABLE public.artwork_valuations (
  id                uuid                     DEFAULT gen_random_uuid() NOT NULL,
  artwork_id        uuid                     NOT NULL,
  expert_contact_id uuid                     NOT NULL,
  valuation_date    date                     NOT NULL,
  amount            numeric(14,2)            NOT NULL,
  currency          text                     DEFAULT 'EUR'::text NOT NULL,
  notes             text,
  created_by        uuid,
  created_at        timestamp with time zone DEFAULT now() NOT NULL,
  updated_at        timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT artwork_valuations_pkey PRIMARY KEY (id),
  CONSTRAINT artwork_valuations_artwork_id_fkey
    FOREIGN KEY (artwork_id) REFERENCES public.artworks(id) ON DELETE CASCADE,
  CONSTRAINT artwork_valuations_expert_contact_id_fkey
    FOREIGN KEY (expert_contact_id) REFERENCES public.contacts(id) ON DELETE RESTRICT,
  CONSTRAINT artwork_valuations_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT artwork_valuations_amount_check CHECK (amount >= 0),
  CONSTRAINT artwork_valuations_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT artwork_valuations_artwork_expert_date_key
    UNIQUE (artwork_id, expert_contact_id, valuation_date)
);

ALTER TABLE public.artwork_valuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artwork_valuations FORCE ROW LEVEL SECURITY;

CREATE INDEX artwork_valuations_artwork_date_idx
  ON public.artwork_valuations (artwork_id, valuation_date DESC);

CREATE INDEX artwork_valuations_expert_date_idx
  ON public.artwork_valuations (expert_contact_id, valuation_date DESC);

CREATE TRIGGER set_artwork_valuations_updated_at
  BEFORE UPDATE ON public.artwork_valuations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON public.artwork_valuations TO authenticated;
GRANT ALL ON public.artwork_valuations TO service_role;

CREATE POLICY artwork_valuations_select
  ON public.artwork_valuations
  FOR SELECT
  TO authenticated
  USING (security.is_admin_or_editor() OR security.can_view_artwork(artwork_id));

CREATE POLICY artwork_valuations_insert_admin_editor
  ON public.artwork_valuations
  FOR INSERT
  TO authenticated
  WITH CHECK (security.is_admin_or_editor());

CREATE POLICY artwork_valuations_update_admin_editor
  ON public.artwork_valuations
  FOR UPDATE
  TO authenticated
  USING (security.is_admin_or_editor())
  WITH CHECK (security.is_admin_or_editor());

CREATE POLICY artwork_valuations_delete_admin_editor
  ON public.artwork_valuations
  FOR DELETE
  TO authenticated
  USING (security.is_admin_or_editor());
