BEGIN;

CREATE TEMPORARY TABLE certificate_location_test (
  id uuid PRIMARY KEY,
  certificate_location_contact_id uuid,
  certificate_location_address_id uuid
);
CREATE TRIGGER validate_location BEFORE INSERT OR UPDATE
  ON certificate_location_test FOR EACH ROW
  EXECUTE FUNCTION public.validate_certificate_location();
CREATE TRIGGER capture_location AFTER INSERT OR UPDATE
  ON certificate_location_test FOR EACH ROW
  EXECUTE FUNCTION public.capture_certificate_location_change();

DO $$
DECLARE
  work_id uuid := (SELECT id FROM public.artworks ORDER BY id LIMIT 1);
  contact uuid := (SELECT id FROM public.contacts ORDER BY id LIMIT 1);
  other_contact uuid := (SELECT id FROM public.contacts ORDER BY id OFFSET 1 LIMIT 1);
  first_address uuid := gen_random_uuid();
  second_address uuid := gen_random_uuid();
  other_address uuid := gen_random_uuid();
  saved_label text;
BEGIN
  IF work_id IS NULL OR contact IS NULL OR other_contact IS NULL THEN
    RAISE EXCEPTION 'Certificate history tests require one artwork and two contacts';
  END IF;
  DELETE FROM public.artwork_certificate_location_history WHERE artwork_id = work_id;
  INSERT INTO public.contact_addresses (id, contact_id, label) VALUES
    (first_address, contact, 'Certificate test address A'),
    (second_address, contact, 'Certificate test address B'),
    (other_address, other_contact, 'Certificate test address C');
  INSERT INTO certificate_location_test VALUES (work_id, NULL, NULL);
  IF EXISTS (SELECT 1 FROM public.artwork_certificate_location_history WHERE artwork_id = work_id) THEN
    RAISE EXCEPTION 'Empty insert must not create history';
  END IF;
  UPDATE certificate_location_test SET certificate_location_contact_id = contact,
    certificate_location_address_id = first_address;
  UPDATE certificate_location_test SET certificate_location_contact_id = contact;
  IF (SELECT count(*) FROM public.artwork_certificate_location_history WHERE artwork_id = work_id) <> 1 THEN
    RAISE EXCEPTION 'Unchanged save must not create history';
  END IF;
  BEGIN
    UPDATE certificate_location_test SET certificate_location_address_id = other_address;
    RAISE EXCEPTION 'Mismatched address was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Certificate address must belong to the selected contact' THEN RAISE; END IF;
  END;
  UPDATE certificate_location_test SET certificate_location_address_id = second_address;
  IF (SELECT count(*) FROM public.artwork_certificate_location_history WHERE artwork_id = work_id) <> 2 THEN
    RAISE EXCEPTION 'Address-only change must create history';
  END IF;
  SELECT new_location INTO saved_label FROM public.artwork_certificate_location_history
    WHERE artwork_id = work_id ORDER BY created_at DESC, id DESC LIMIT 1;
  UPDATE public.contact_addresses SET label = 'Renamed certificate address' WHERE id = second_address;
  UPDATE certificate_location_test SET certificate_location_contact_id = NULL;
  IF (SELECT certificate_location_address_id FROM certificate_location_test) IS NOT NULL THEN
    RAISE EXCEPTION 'Clearing contact must clear address';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.artwork_certificate_location_history
    WHERE artwork_id = work_id AND new_location IS NULL AND old_location = saved_label
  ) THEN
    RAISE EXCEPTION 'Removal must preserve prior snapshot and record empty location';
  END IF;
  IF (SELECT count(*) FROM public.artwork_certificate_location_history WHERE artwork_id = work_id) <> 3 THEN
    RAISE EXCEPTION 'Expected exactly three actual changes';
  END IF;
  DELETE FROM certificate_location_test;
  INSERT INTO certificate_location_test VALUES (work_id, contact, first_address);
  IF NOT EXISTS (
    SELECT 1 FROM public.artwork_certificate_location_history
    WHERE artwork_id = work_id AND is_initial AND new_location LIKE '%Certificate test address A%'
  ) THEN
    RAISE EXCEPTION 'Insert with location must create initial record';
  END IF;
END;
$$;
ROLLBACK;
