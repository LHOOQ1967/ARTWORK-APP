-- À l'arrivée d'un transport : la destination devient la localisation actuelle
-- de l'œuvre et la destination de l'œuvre est vidée. Le transport conserve
-- son origine et sa destination.
CREATE OR REPLACE FUNCTION public.apply_transport_arrival()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.arrival_date IS NOT NULL
    AND NEW.destination_contact_id IS NOT NULL
    AND (TG_OP = 'INSERT' OR OLD.arrival_date IS NULL) THEN
    UPDATE public.artworks
    SET location_contact_id = NEW.destination_contact_id,
        destination_contact_id = NULL
    WHERE id = NEW.artwork_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_transport_arrival() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_apply_transport_arrival
  AFTER INSERT OR UPDATE OF arrival_date ON public.artwork_transports
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_transport_arrival();
