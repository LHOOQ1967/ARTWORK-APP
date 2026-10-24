ALTER TABLE public.artworks
  ADD COLUMN certificate_location_address_id uuid
    REFERENCES public.contact_addresses(id) ON DELETE SET NULL;

CREATE TABLE public.artwork_certificate_location_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artwork_id uuid NOT NULL REFERENCES public.artworks(id) ON DELETE CASCADE,
  old_location text,
  new_location text,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_email text,
  is_initial boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX idx_certificate_location_history_artwork_created
  ON public.artwork_certificate_location_history (artwork_id, created_at DESC, id DESC);
ALTER TABLE public.artwork_certificate_location_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.artwork_certificate_location_history FROM anon, authenticated;
GRANT SELECT ON public.artwork_certificate_location_history TO authenticated;
CREATE POLICY artwork_certificate_location_history_select
  ON public.artwork_certificate_location_history FOR SELECT TO authenticated
  USING (security.is_admin_or_editor() OR security.can_view_artwork(artwork_id));

CREATE FUNCTION public.certificate_location_label(p_contact_id uuid, p_address_id uuid)
RETURNS text LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT nullif(concat_ws(' / ',
    nullif(coalesce(nullif(btrim(c.company_name), ''), nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), '')), ''),
    nullif(concat_ws(', ', a.label, a.address,
      nullif(concat_ws(' ', a.postal_code, a.city), ''), a.country), '')
  ), '')
  FROM public.contacts c
  LEFT JOIN public.contact_addresses a ON a.id = p_address_id AND a.contact_id = c.id
  WHERE c.id = p_contact_id;
$$;
REVOKE ALL ON FUNCTION public.certificate_location_label(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.validate_certificate_location()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.certificate_location_contact_id IS NULL THEN
    NEW.certificate_location_address_id := NULL;
  ELSIF NEW.certificate_location_address_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contact_addresses
    WHERE id = NEW.certificate_location_address_id
      AND contact_id = NEW.certificate_location_contact_id
  ) THEN
    RAISE EXCEPTION 'Certificate address must belong to the selected contact';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_certificate_location() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_validate_certificate_location
  BEFORE INSERT OR UPDATE OF certificate_location_contact_id, certificate_location_address_id
  ON public.artworks FOR EACH ROW EXECUTE FUNCTION public.validate_certificate_location();

CREATE FUNCTION public.capture_certificate_location_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  previous_location text;
  initial boolean := TG_OP = 'INSERT';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.certificate_location_contact_id IS NULL THEN RETURN NEW; END IF;
  ELSE
    IF OLD.certificate_location_contact_id IS NOT DISTINCT FROM NEW.certificate_location_contact_id
      AND OLD.certificate_location_address_id IS NOT DISTINCT FROM NEW.certificate_location_address_id THEN
      RETURN NEW;
    END IF;
    -- Reuse the stored snapshot so renamed or deleted contacts do not erase history.
    SELECT new_location INTO previous_location
    FROM public.artwork_certificate_location_history
    WHERE artwork_id = NEW.id ORDER BY created_at DESC, id DESC LIMIT 1;
    IF NOT FOUND THEN
      previous_location := public.certificate_location_label(
        OLD.certificate_location_contact_id, OLD.certificate_location_address_id);
    END IF;
  END IF;
  INSERT INTO public.artwork_certificate_location_history
    (artwork_id, old_location, new_location, actor_id, actor_email, is_initial)
  VALUES (NEW.id, previous_location,
    public.certificate_location_label(NEW.certificate_location_contact_id, NEW.certificate_location_address_id),
    auth.uid(), (SELECT email FROM public.profiles WHERE id = auth.uid()), initial);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_certificate_location_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_capture_certificate_location_change
  AFTER INSERT OR UPDATE ON public.artworks
  FOR EACH ROW EXECUTE FUNCTION public.capture_certificate_location_change();

INSERT INTO public.artwork_certificate_location_history (artwork_id, new_location, is_initial)
SELECT id, public.certificate_location_label(certificate_location_contact_id, NULL), true
FROM public.artworks WHERE certificate_location_contact_id IS NOT NULL;

DO $$
DECLARE
  view_name text;
  view_definition text;
BEGIN
  FOREACH view_name IN ARRAY ARRAY['artworks_full_admin', 'viewer_artworks_full_secure']
  LOOP
    view_definition := rtrim(pg_get_viewdef(format('public.%I', view_name)::regclass, true), E'; \n\r\t');
    EXECUTE format(
      'CREATE OR REPLACE VIEW public.%I WITH (security_invoker = true) AS
       SELECT existing.*, artwork.certificate_location_address_id
       FROM (%s) AS existing JOIN public.artworks AS artwork ON artwork.id = existing.id',
      view_name, view_definition);
  END LOOP;
END;
$$;
