BEGIN;

ALTER TABLE public.artwork_buyer_events DISABLE TRIGGER trg_notify_buyer_email;

CREATE TEMPORARY TABLE artwork_buyer_email_test (
  id uuid PRIMARY KEY,
  buyer_contact_id uuid,
  notes text
);
CREATE TRIGGER capture_buyer AFTER INSERT OR UPDATE OF buyer_contact_id
  ON artwork_buyer_email_test FOR EACH ROW
  EXECUTE FUNCTION public.capture_artwork_buyer_event();

DO $$
DECLARE
  work_id uuid := (SELECT id FROM public.artworks ORDER BY id LIMIT 1);
  first_buyer uuid := gen_random_uuid();
  second_buyer uuid := gen_random_uuid();
  saved_work_id uuid := gen_random_uuid();
BEGIN
  IF work_id IS NULL THEN
    RAISE EXCEPTION 'Buyer email tests require one artwork';
  END IF;
  INSERT INTO public.contacts (id, company_name, first_name, last_name) VALUES
    (first_buyer, 'Buyer email test company', 'Ignored', 'Person'),
    (second_buyer, ' ', 'Buyer', 'Person');
  DELETE FROM public.artwork_buyer_events WHERE artwork_id = work_id;

  INSERT INTO artwork_buyer_email_test VALUES (work_id, NULL, NULL);
  IF EXISTS (SELECT 1 FROM public.artwork_buyer_events WHERE artwork_id = work_id) THEN
    RAISE EXCEPTION 'Empty Buyer on creation must not send mail';
  END IF;
  UPDATE artwork_buyer_email_test SET buyer_contact_id = first_buyer;
  IF (SELECT count(*) FROM public.artwork_buyer_events WHERE artwork_id = work_id) <> 1
    OR NOT EXISTS (SELECT 1 FROM public.artwork_buyer_events
      WHERE artwork_id = work_id AND buyer_name = 'Buyer email test company') THEN
    RAISE EXCEPTION 'Adding Buyer must capture one event with company label';
  END IF;
  UPDATE artwork_buyer_email_test SET buyer_contact_id = first_buyer, notes = 'Another save';
  UPDATE artwork_buyer_email_test SET notes = 'Unrelated change';
  IF (SELECT count(*) FROM public.artwork_buyer_events WHERE artwork_id = work_id) <> 1 THEN
    RAISE EXCEPTION 'Unchanged Buyer and unrelated saves must not send mail';
  END IF;
  UPDATE artwork_buyer_email_test SET buyer_contact_id = second_buyer;
  IF (SELECT count(*) FROM public.artwork_buyer_events WHERE artwork_id = work_id) <> 2
    OR NOT EXISTS (SELECT 1 FROM public.artwork_buyer_events
      WHERE artwork_id = work_id AND buyer_name = 'Buyer Person') THEN
    RAISE EXCEPTION 'Replacing Buyer must capture another event with person label';
  END IF;
  UPDATE public.contacts SET first_name = 'Renamed' WHERE id = second_buyer;
  IF NOT EXISTS (SELECT 1 FROM public.artwork_buyer_events
    WHERE artwork_id = work_id AND buyer_name = 'Buyer Person') THEN
    RAISE EXCEPTION 'Buyer labels must remain the snapshot at assignment time';
  END IF;
  UPDATE artwork_buyer_email_test SET buyer_contact_id = NULL;
  IF (SELECT count(*) FROM public.artwork_buyer_events WHERE artwork_id = work_id) <> 2 THEN
    RAISE EXCEPTION 'Removing Buyer must not send mail';
  END IF;
  UPDATE artwork_buyer_email_test SET buyer_contact_id = first_buyer;
  DELETE FROM artwork_buyer_email_test;
  INSERT INTO artwork_buyer_email_test VALUES (work_id, second_buyer, NULL);
  IF (SELECT count(*) FROM public.artwork_buyer_events WHERE artwork_id = work_id) <> 4 THEN
    RAISE EXCEPTION 'Reassigning and creation with Buyer must each send mail';
  END IF;
  DELETE FROM public.contacts WHERE id = second_buyer;
  IF NOT EXISTS (SELECT 1 FROM public.artwork_buyer_events WHERE artwork_id = work_id
    AND buyer_contact_id IS NULL AND buyer_name = 'Buyer Person') THEN
    RAISE EXCEPTION 'Deleting a contact must preserve pending email details';
  END IF;
  IF EXISTS (SELECT 1 FROM public.artwork_buyer_events WHERE artwork_id = work_id
    AND email_sent_at IS NOT NULL) THEN
    RAISE EXCEPTION 'New events must remain pending until delivery';
  END IF;

  IF has_table_privilege('authenticated', 'public.artwork_buyer_events', 'SELECT')
    OR has_table_privilege('anon', 'public.artwork_buyer_events', 'SELECT')
    OR has_table_privilege('authenticated', 'public.artwork_buyer_events', 'INSERT')
    OR has_table_privilege('authenticated', 'public.artwork_buyer_events', 'UPDATE') THEN
    RAISE EXCEPTION 'Browser clients must not read or forge buyer notifications';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.artwork_buyer_events', 'SELECT')
    OR NOT has_column_privilege('service_role', 'public.artwork_buyer_events', 'email_sent_at', 'UPDATE') THEN
    RAISE EXCEPTION 'Email service must be able to read events and mark delivery';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.artworks'::regclass
    AND tgname = 'trg_capture_artwork_buyer_event' AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'Buyer capture must be wired to real artwork saves';
  END IF;
  INSERT INTO public.artworks (id, title, status, buyer_contact_id)
    VALUES (saved_work_id, 'Buyer email rollback test', 'Draft', first_buyer);
  UPDATE public.artworks SET title = 'Buyer email unrelated edit' WHERE id = saved_work_id;
  UPDATE public.artworks SET buyer_contact_id = first_buyer WHERE id = saved_work_id;
  IF (SELECT count(*) FROM public.artwork_buyer_events WHERE artwork_id = saved_work_id) <> 1 THEN
    RAISE EXCEPTION 'Real artwork creation with Buyer must capture exactly one event';
  END IF;
  IF EXISTS (SELECT 1 FROM public.artwork_acquisition_events WHERE artwork_id = saved_work_id) THEN
    RAISE EXCEPTION 'Assigning Buyer must not create acquisition activity';
  END IF;
  DELETE FROM public.artworks WHERE id = saved_work_id;
  IF EXISTS (SELECT 1 FROM public.artwork_buyer_events WHERE artwork_id = saved_work_id) THEN
    RAISE EXCEPTION 'Deleting artwork must cascade its pending Buyer events';
  END IF;
  IF replace(pg_get_functiondef('public.notify_buyer_email()'::regprocedure),
    'FUNCTION public.notify_buyer_email()', 'FUNCTION public.notify_acquisition_email()')
    IS DISTINCT FROM replace(pg_get_functiondef('public.notify_acquisition_email()'::regprocedure),
      '''artwork_acquisition_events''', '''artwork_buyer_events''') THEN
    RAISE EXCEPTION 'Buyer webhook must preserve the existing endpoint and authentication';
  END IF;
END;
$$;

ROLLBACK;
