CREATE TABLE public.artwork_acquisition_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  artwork_id uuid NOT NULL REFERENCES public.artworks(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_artwork_acquisition_events_created_at
  ON public.artwork_acquisition_events (created_at DESC);

ALTER TABLE public.artwork_acquisition_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.artwork_acquisition_events TO authenticated;

CREATE POLICY artwork_acquisition_events_select
  ON public.artwork_acquisition_events
  FOR SELECT
  TO authenticated
  USING (security.can_view_artwork(artwork_id));

CREATE OR REPLACE FUNCTION public.capture_artwork_acquisition_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.acquired IS TRUE)
    OR (TG_OP = 'UPDATE' AND NEW.acquired IS TRUE AND OLD.acquired IS DISTINCT FROM TRUE) THEN
    INSERT INTO public.artwork_acquisition_events (artwork_id, actor_id)
    VALUES (NEW.id, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_artwork_acquisition_event() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_capture_artwork_acquisition_event
  AFTER INSERT OR UPDATE ON public.artworks
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_artwork_acquisition_event();