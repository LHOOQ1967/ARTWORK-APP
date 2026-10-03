-- Historique des localisations
CREATE TABLE public.artwork_location_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  artwork_id uuid NOT NULL REFERENCES public.artworks(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_artwork_location_history_artwork
  ON public.artwork_location_history (artwork_id, started_at DESC);

-- Transports
CREATE TABLE public.artwork_transports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  artwork_id uuid NOT NULL REFERENCES public.artworks(id) ON DELETE CASCADE,
  origin_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  destination_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  instruction_date date,
  transport_date date,
  arrival_date date,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_artwork_transports_artwork
  ON public.artwork_transports (artwork_id);

CREATE TRIGGER trg_artwork_transports_updated_at
  BEFORE UPDATE ON public.artwork_transports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Devis de transport (plusieurs par transport)
CREATE TABLE public.artwork_transport_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  transport_id uuid NOT NULL REFERENCES public.artwork_transports(id) ON DELETE CASCADE,
  carrier_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  quote_date date,
  amount numeric(12,2),
  currency text NOT NULL DEFAULT 'CHF',
  submitted_to_buyer_date date,
  accepted_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_artwork_transport_quotes_transport
  ON public.artwork_transport_quotes (transport_id);

ALTER TABLE public.artwork_location_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artwork_transports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artwork_transport_quotes ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.artwork_location_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artwork_transports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artwork_transport_quotes TO authenticated;
GRANT ALL ON public.artwork_location_history TO service_role;
GRANT ALL ON public.artwork_transports TO service_role;
GRANT ALL ON public.artwork_transport_quotes TO service_role;

CREATE POLICY artwork_location_history_select
  ON public.artwork_location_history
  FOR SELECT TO authenticated
  USING (security.can_view_artwork(artwork_id));

CREATE POLICY artwork_transports_select
  ON public.artwork_transports
  FOR SELECT TO authenticated
  USING (security.can_view_artwork(artwork_id));

CREATE POLICY artwork_transports_write
  ON public.artwork_transports
  FOR ALL TO authenticated
  USING (security.is_admin_or_editor())
  WITH CHECK (security.is_admin_or_editor());

CREATE POLICY artwork_transport_quotes_select
  ON public.artwork_transport_quotes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.artwork_transports t
      WHERE t.id = transport_id AND security.can_view_artwork(t.artwork_id)
    )
  );

CREATE POLICY artwork_transport_quotes_write
  ON public.artwork_transport_quotes
  FOR ALL TO authenticated
  USING (security.is_admin_or_editor())
  WITH CHECK (security.is_admin_or_editor());

-- Alimentation automatique de l'historique
CREATE OR REPLACE FUNCTION public.capture_artwork_location_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.location_contact_id IS NOT NULL THEN
      INSERT INTO public.artwork_location_history (artwork_id, contact_id, actor_id)
      VALUES (NEW.id, NEW.location_contact_id, auth.uid());
    END IF;
  ELSIF NEW.location_contact_id IS DISTINCT FROM OLD.location_contact_id THEN
    UPDATE public.artwork_location_history
    SET ended_at = now()
    WHERE artwork_id = NEW.id AND ended_at IS NULL;

    IF NEW.location_contact_id IS NOT NULL THEN
      INSERT INTO public.artwork_location_history (artwork_id, contact_id, actor_id)
      VALUES (NEW.id, NEW.location_contact_id, auth.uid());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_artwork_location_history() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_capture_artwork_location_history
  AFTER INSERT OR UPDATE OF location_contact_id ON public.artworks
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_artwork_location_history();

-- Localisation actuelle comme point de départ de l'historique
INSERT INTO public.artwork_location_history (artwork_id, contact_id, started_at)
SELECT id, location_contact_id, COALESCE(created_at, now())
FROM public.artworks
WHERE location_contact_id IS NOT NULL;
