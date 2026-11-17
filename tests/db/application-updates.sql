BEGIN;

CREATE TEMP TABLE updates_test_users (role text PRIMARY KEY, id uuid NOT NULL DEFAULT gen_random_uuid());
INSERT INTO updates_test_users (role) VALUES ('Administrator'), ('Editor'), ('Viewer');
INSERT INTO auth.users (id, email)
SELECT id, 'updates-' || id || '@updates-test.invalid' FROM updates_test_users;
UPDATE public.profiles p SET role = u.role FROM updates_test_users u WHERE p.id = u.id;
GRANT SELECT ON updates_test_users TO authenticated;

UPDATE public.application_updates SET content = 'Initial release notes';

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  test_user record;
  changed integer;
BEGIN
  IF has_table_privilege('anon', 'public.application_updates', 'SELECT')
    OR has_table_privilege('authenticated', 'public.application_updates', 'INSERT,DELETE')
    OR has_column_privilege('authenticated', 'public.application_updates', 'updated_at', 'UPDATE') THEN
    RAISE EXCEPTION 'Unexpected Updates privileges';
  END IF;

  FOR test_user IN SELECT * FROM updates_test_users WHERE role IN ('Editor', 'Viewer') LOOP
    PERFORM set_config('request.jwt.claim.sub', test_user.id::text, true);
    IF (SELECT content FROM public.application_updates WHERE id) IS DISTINCT FROM 'Initial release notes' THEN
      RAISE EXCEPTION '% cannot read the shared updates', test_user.role;
    END IF;
    UPDATE public.application_updates SET content = 'Not authorized' WHERE id;
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 0 THEN RAISE EXCEPTION '% can edit updates', test_user.role; END IF;
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub',
    (SELECT id::text FROM updates_test_users WHERE role = 'Administrator'), true);
  UPDATE public.application_updates SET content = 'Administrator release notes' WHERE id;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 OR (SELECT content FROM public.application_updates WHERE id) <> 'Administrator release notes' THEN
    RAISE EXCEPTION 'Administrator cannot publish updates';
  END IF;
  UPDATE public.application_updates SET content = 'Stale release notes'
    WHERE id AND updated_at = '1900-01-01';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 0 THEN RAISE EXCEPTION 'Stale Updates write was accepted'; END IF;
  BEGIN
    UPDATE public.application_updates SET content = '   ' WHERE id;
    RAISE EXCEPTION 'Blank release notes were accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub',
    (SELECT id::text FROM updates_test_users WHERE role = 'Viewer'), true);
  IF (SELECT content FROM public.application_updates WHERE id) <> 'Administrator release notes' THEN
    RAISE EXCEPTION 'Published changes are not shared with Viewers';
  END IF;
END;
$$;

ROLLBACK;
