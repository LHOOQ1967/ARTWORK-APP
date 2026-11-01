CREATE TABLE public.artwork_buyer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  artwork_id uuid NOT NULL REFERENCES public.artworks(id) ON DELETE CASCADE,
  buyer_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  buyer_name text NOT NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  email_sent_at timestamptz
);

CREATE INDEX idx_artwork_buyer_events_created_at
  ON public.artwork_buyer_events (created_at DESC);

ALTER TABLE public.artwork_buyer_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.artwork_buyer_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE (email_sent_at) ON public.artwork_buyer_events TO service_role;

CREATE FUNCTION public.capture_artwork_buyer_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  buyer_label text;
BEGIN
  IF NEW.buyer_contact_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.buyer_contact_id IS NOT DISTINCT FROM OLD.buyer_contact_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(
    NULLIF(trim(c.company_name), ''),
    NULLIF(trim(concat_ws(' ', c.first_name, c.last_name)), ''),
    'Unnamed buyer'
  ) INTO STRICT buyer_label
  FROM public.contacts c WHERE c.id = NEW.buyer_contact_id;

  INSERT INTO public.artwork_buyer_events (artwork_id, buyer_contact_id, buyer_name, actor_id)
  VALUES (NEW.id, NEW.buyer_contact_id, buyer_label, auth.uid());
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_artwork_buyer_event() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_capture_artwork_buyer_event
  AFTER INSERT OR UPDATE OF buyer_contact_id ON public.artworks
  FOR EACH ROW EXECUTE FUNCTION public.capture_artwork_buyer_event();

-- Preserve the deployment-specific endpoint and secret without versioning either.
DO $$
DECLARE
  dispatcher regprocedure := to_regprocedure('public.notify_acquisition_email()');
  definition text;
BEGIN
  IF dispatcher IS NULL THEN
    RAISE WARNING 'Buyer email webhook is not configured. Configure notify_buyer_email() and its INSERT trigger before enabling notifications.';
    RETURN;
  END IF;

  definition := pg_get_functiondef(dispatcher);
  IF (SELECT count(*) FROM regexp_matches(definition, '''artwork_acquisition_events''', 'g')) <> 1 THEN
    RAISE EXCEPTION 'Unsupported acquisition email dispatcher. Configure the buyer webhook explicitly before applying this migration.';
  END IF;
  definition := replace(definition,
    'FUNCTION public.notify_acquisition_email()', 'FUNCTION public.notify_buyer_email()');
  definition := replace(definition, '''artwork_acquisition_events''', '''artwork_buyer_events''');
  EXECUTE definition;
  REVOKE ALL ON FUNCTION public.notify_buyer_email() FROM PUBLIC, anon, authenticated;

  CREATE TRIGGER trg_notify_buyer_email
    AFTER INSERT ON public.artwork_buyer_events
    FOR EACH ROW EXECUTE FUNCTION public.notify_buyer_email();
END;
$$;
