-- Crée automatiquement un transport quand une oeuvre passe à acquired = true,
-- sauf si la destination est identique à la localisation actuelle.
CREATE OR REPLACE FUNCTION public.create_transport_on_acquisition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.acquired IS TRUE
    AND (TG_OP = 'INSERT' OR OLD.acquired IS DISTINCT FROM TRUE)
    AND (
      NEW.destination_contact_id IS NULL
      OR NEW.destination_contact_id IS DISTINCT FROM NEW.location_contact_id
      OR NEW.destination_address_id IS DISTINCT FROM NEW.location_address_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.artwork_transports t
      WHERE t.artwork_id = NEW.id AND t.arrival_date IS NULL
    ) THEN
    INSERT INTO public.artwork_transports (
      artwork_id,
      origin_contact_id,
      destination_contact_id,
      origin_address_id,
      destination_address_id,
      created_by
    )
    VALUES (
      NEW.id,
      NEW.location_contact_id,
      NEW.destination_contact_id,
      NEW.location_address_id,
      NEW.destination_address_id,
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_transport_on_acquisition() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_create_transport_on_acquisition ON public.artworks;
CREATE TRIGGER trg_create_transport_on_acquisition
  AFTER INSERT OR UPDATE OF acquired ON public.artworks
  FOR EACH ROW
  EXECUTE FUNCTION public.create_transport_on_acquisition();
