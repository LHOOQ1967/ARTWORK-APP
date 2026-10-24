ALTER TABLE public.artworks ADD COLUMN quality integer
  CONSTRAINT artworks_quality_check CHECK (quality BETWEEN 1 AND 10);

COMMENT ON COLUMN public.artworks.quality IS
  'Optional quality rating, selected as an integer from 1 to 10.';

CREATE TABLE public.artwork_quality_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artwork_id uuid NOT NULL REFERENCES public.artworks(id) ON DELETE CASCADE,
  old_quality integer CHECK (old_quality BETWEEN 1 AND 10),
  new_quality integer CHECK (new_quality BETWEEN 1 AND 10),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_artwork_quality_history_artwork_created
  ON public.artwork_quality_history (artwork_id, created_at DESC, id DESC);

ALTER TABLE public.artwork_quality_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.artwork_quality_history FROM anon, authenticated;
GRANT SELECT ON public.artwork_quality_history TO authenticated;

CREATE POLICY artwork_quality_history_select
  ON public.artwork_quality_history FOR SELECT TO authenticated
  USING (security.is_admin_or_editor() OR security.can_view_artwork(artwork_id));

CREATE FUNCTION public.capture_artwork_quality_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.quality IS NOT NULL THEN
      INSERT INTO public.artwork_quality_history (artwork_id, old_quality, new_quality, actor_id)
      VALUES (NEW.id, NULL, NEW.quality, auth.uid());
    END IF;
  ELSIF OLD.quality IS DISTINCT FROM NEW.quality THEN
    INSERT INTO public.artwork_quality_history (artwork_id, old_quality, new_quality, actor_id)
    VALUES (NEW.id, OLD.quality, NEW.quality, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_artwork_quality_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_capture_artwork_quality_change
  AFTER INSERT OR UPDATE ON public.artworks
  FOR EACH ROW EXECUTE FUNCTION public.capture_artwork_quality_change();

DO $$
DECLARE
  view_name text;
  view_definition text;
BEGIN
  FOREACH view_name IN ARRAY ARRAY['artworks_full_admin', 'viewer_artworks_full_secure']
  LOOP
    view_definition := rtrim(
      pg_get_viewdef(format('public.%I', view_name)::regclass, true),
      E'; \n\r\t'
    );
    EXECUTE format(
      'CREATE OR REPLACE VIEW public.%I WITH (security_invoker = true) AS
       SELECT existing.*, artwork.quality
       FROM (%s) AS existing
       JOIN public.artworks AS artwork ON artwork.id = existing.id',
      view_name, view_definition
    );
  END LOOP;
END;
$$;
