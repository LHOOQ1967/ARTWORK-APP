BEGIN;

CREATE TEMPORARY TABLE artwork_view_date_test (
  id integer PRIMARY KEY,
  status text,
  view_date date
);

CREATE TRIGGER test_view_date
  BEFORE INSERT OR UPDATE OF status ON artwork_view_date_test
  FOR EACH ROW EXECUTE FUNCTION public.set_artwork_view_date_when_viewed();

DO $$
DECLARE
  today date := (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Zurich')::date;
BEGIN
  INSERT INTO artwork_view_date_test VALUES
    (1, 'Draft', NULL),
    (2, 'Draft', DATE '2025-01-01'),
    (3, 'Viewed', NULL),
    (4, 'Viewed', DATE '2025-02-01');

  UPDATE artwork_view_date_test SET status = 'Viewed' WHERE id IN (1, 2);
  IF (SELECT view_date FROM artwork_view_date_test WHERE id = 1) IS DISTINCT FROM today THEN
    RAISE EXCEPTION 'Transition must fill empty view date';
  END IF;
  IF (SELECT view_date FROM artwork_view_date_test WHERE id = 2) IS DISTINCT FROM DATE '2025-01-01' THEN
    RAISE EXCEPTION 'Existing view date must be preserved';
  END IF;
  IF (SELECT view_date FROM artwork_view_date_test WHERE id = 3) IS DISTINCT FROM today THEN
    RAISE EXCEPTION 'Viewed insert must fill empty view date';
  END IF;
  IF (SELECT view_date FROM artwork_view_date_test WHERE id = 4) IS DISTINCT FROM DATE '2025-02-01' THEN
    RAISE EXCEPTION 'Explicit insert date must be preserved';
  END IF;

  UPDATE artwork_view_date_test SET status = 'Draft' WHERE id = 2;
  UPDATE artwork_view_date_test SET status = 'Viewed', view_date = NULL WHERE id = 2;
  IF (SELECT view_date FROM artwork_view_date_test WHERE id = 2) IS DISTINCT FROM DATE '2025-01-01' THEN
    RAISE EXCEPTION 'Re-entering Viewed must preserve the previous date';
  END IF;

  UPDATE artwork_view_date_test SET status = 'Draft' WHERE id = 1;
  UPDATE artwork_view_date_test SET status = 'Viewed', view_date = DATE '2024-01-01' WHERE id = 1;
  IF (SELECT view_date FROM artwork_view_date_test WHERE id = 1) IS DISTINCT FROM DATE '2024-01-01' THEN
    RAISE EXCEPTION 'Explicit transition date must be preserved';
  END IF;

  UPDATE artwork_view_date_test SET view_date = NULL WHERE id = 3;
  UPDATE artwork_view_date_test SET status = 'Viewed' WHERE id = 3;
  IF (SELECT view_date FROM artwork_view_date_test WHERE id = 3) IS NOT NULL THEN
    RAISE EXCEPTION 'Unchanged Viewed status must not backfill dates';
  END IF;

  INSERT INTO artwork_view_date_test VALUES (5, 'Negotiation', NULL);
  IF (SELECT view_date FROM artwork_view_date_test WHERE id = 5) IS NOT NULL THEN
    RAISE EXCEPTION 'Other statuses must not fill dates';
  END IF;
END;
$$;

ROLLBACK;
