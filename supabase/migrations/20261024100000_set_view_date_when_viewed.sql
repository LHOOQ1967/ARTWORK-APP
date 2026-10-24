CREATE FUNCTION public.set_artwork_view_date_when_viewed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status = 'Viewed' AND NEW.view_date IS NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.view_date := (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Zurich')::date;
    ELSIF OLD.status IS DISTINCT FROM 'Viewed' THEN
      NEW.view_date := COALESCE(
        OLD.view_date,
        (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Zurich')::date
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_artwork_view_date_when_viewed() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_set_artwork_view_date_when_viewed
  BEFORE INSERT OR UPDATE OF status ON public.artworks
  FOR EACH ROW EXECUTE FUNCTION public.set_artwork_view_date_when_viewed();
