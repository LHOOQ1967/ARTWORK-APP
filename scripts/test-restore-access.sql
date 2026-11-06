SAVEPOINT access_probes;

GRANT USAGE ON SCHEMA public, security TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA security TO authenticated;
GRANT UPDATE (id) ON public.artworks, public.documents TO authenticated;

CREATE TEMP TABLE access_test_identities (
  kind text PRIMARY KEY,
  user_id uuid NOT NULL,
  contact_id uuid
) ON COMMIT DROP;
INSERT INTO access_test_identities (kind, user_id)
VALUES ('Administrator', gen_random_uuid()), ('Editor', gen_random_uuid()),
       ('Viewer', gen_random_uuid()), ('Unlinked', gen_random_uuid());

-- Fixtures live only inside this savepoint; no Auth account is created.
INSERT INTO public.profiles (id, email, role, is_active)
SELECT user_id, 'restore-' || lower(kind) || '@example.invalid', kind, true
FROM access_test_identities WHERE kind <> 'Unlinked';
UPDATE access_test_identities
SET contact_id = (
  SELECT ap.contact_id FROM public.artwork_proposals ap
  JOIN public.documents d ON d.artwork_id = ap.artwork_id
  WHERE d.visibility = 'all_clients'
     OR (d.visibility = 'selected_client' AND d.recipient_contact_id = ap.contact_id)
  ORDER BY ap.contact_id, ap.artwork_id LIMIT 1
)
WHERE kind = 'Viewer';
DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM access_test_identities WHERE kind = 'Viewer' AND contact_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Missing archived proposal/document fixture; do not treat empty access as a passing viewer test';
  END IF;
END;
$check$;
INSERT INTO public.contact_users (contact_id, user_id, invited)
SELECT contact_id, user_id, true FROM access_test_identities WHERE kind = 'Viewer';

CREATE TEMP TABLE access_test_expected (
  kind text NOT NULL,
  relation_name text NOT NULL,
  ids uuid[] NOT NULL,
  PRIMARY KEY (kind, relation_name)
) ON COMMIT DROP;

-- Build expected sets as postgres from relationships, without calling access helpers.
INSERT INTO access_test_expected
SELECT i.kind, 'artworks', COALESCE(array_agg(a.id ORDER BY a.id), ARRAY[]::uuid[])
FROM access_test_identities i
LEFT JOIN public.artworks a ON i.kind IN ('Administrator', 'Editor')
  OR (i.kind = 'Viewer' AND EXISTS (
    SELECT 1 FROM public.artwork_proposals ap
    WHERE ap.artwork_id = a.id AND ap.contact_id = i.contact_id
  ))
GROUP BY i.kind;
INSERT INTO access_test_expected
SELECT i.kind, 'artwork_proposals', COALESCE(array_agg(ap.id ORDER BY ap.id), ARRAY[]::uuid[])
FROM access_test_identities i
LEFT JOIN public.artwork_proposals ap ON i.kind IN ('Administrator', 'Editor')
  OR (i.kind = 'Viewer' AND ap.contact_id = i.contact_id)
GROUP BY i.kind;
INSERT INTO access_test_expected
SELECT i.kind, 'contact_users', COALESCE(array_agg(cu.id ORDER BY cu.id), ARRAY[]::uuid[])
FROM access_test_identities i
LEFT JOIN public.contact_users cu ON i.kind IN ('Administrator', 'Editor') OR cu.user_id = i.user_id
GROUP BY i.kind;
INSERT INTO access_test_expected
SELECT i.kind, 'documents', COALESCE(array_agg(d.id ORDER BY d.id), ARRAY[]::uuid[])
FROM access_test_identities i
LEFT JOIN public.documents d ON i.kind IN ('Administrator', 'Editor')
  OR (d.market_section_item_id IS NOT NULL AND d.visibility = 'all_clients')
  OR (i.kind = 'Viewer'
    AND (d.visibility = 'all_clients'
      OR (d.visibility = 'selected_client' AND d.recipient_contact_id = i.contact_id))
    AND EXISTS (
      SELECT 1 FROM public.artwork_proposals ap
      WHERE ap.artwork_id = d.artwork_id AND ap.contact_id = i.contact_id
    ))
GROUP BY i.kind;

-- LEFT JOIN aggregates must not include their null placeholder.
UPDATE access_test_expected SET ids = array_remove(ids, NULL);
DO $check$
BEGIN
  IF EXISTS (
    SELECT 1 FROM access_test_expected WHERE kind = 'Viewer'
    AND relation_name IN ('artworks', 'artwork_proposals', 'documents', 'contact_users')
    AND cardinality(ids) = 0
  ) THEN RAISE EXCEPTION 'Viewer positive-access fixtures are empty'; END IF;
  IF (SELECT cardinality(ids) FROM access_test_expected
      WHERE kind = 'Viewer' AND relation_name = 'artworks') >= (SELECT count(*) FROM public.artworks) THEN
    RAISE EXCEPTION 'Viewer fixture must include inaccessible artworks as well as accessible ones';
  END IF;
  IF EXISTS (
    SELECT 1 FROM access_test_expected WHERE kind = 'Unlinked'
    AND relation_name IN ('artworks', 'artwork_proposals', 'contact_users') AND cardinality(ids) <> 0
  ) THEN RAISE EXCEPTION 'Unexpected unlinked fixture access'; END IF;
END;
$check$;
GRANT SELECT ON access_test_identities, access_test_expected TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL row_security = on;
DO $probes$
DECLARE
  identity_record record;
  expected_record record;
  actual_ids uuid[];
  actual_count bigint;
  probe_id uuid;
  checked_sets integer := 0;
  checked_updates integer := 0;
BEGIN
  IF current_user <> 'authenticated' OR EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) THEN RAISE EXCEPTION 'Access probes must run as non-bypassing authenticated'; END IF;
  FOR identity_record IN SELECT * FROM access_test_identities ORDER BY kind LOOP
    PERFORM set_config('request.jwt.claim.sub', identity_record.user_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
      'sub', identity_record.user_id::text, 'role', 'authenticated'
    )::text, true);
    IF auth.uid() IS DISTINCT FROM identity_record.user_id THEN
      RAISE EXCEPTION 'JWT identity simulation failed';
    END IF;
    IF security.is_admin() IS DISTINCT FROM (identity_record.kind = 'Administrator')
       OR security.is_admin_or_editor() IS DISTINCT FROM (identity_record.kind IN ('Administrator', 'Editor')) THEN
      RAISE EXCEPTION 'Role helper mismatch for %', identity_record.kind;
    END IF;
    FOR expected_record IN SELECT * FROM access_test_expected WHERE kind = identity_record.kind LOOP
      EXECUTE format('SELECT COALESCE(array_agg(id ORDER BY id), ARRAY[]::uuid[]) FROM public.%I',
                     expected_record.relation_name) INTO actual_ids;
      IF actual_ids IS DISTINCT FROM expected_record.ids THEN
        RAISE EXCEPTION 'Visible ID set mismatch for % / %', identity_record.kind, expected_record.relation_name;
      END IF;
      checked_sets := checked_sets + 1;
    END LOOP;
    FOR expected_record IN
      SELECT relation_name FROM access_test_expected
      WHERE kind = 'Administrator' AND relation_name IN ('artworks', 'documents')
    LOOP
      SELECT COALESCE(
        (SELECT ids[1] FROM access_test_expected
         WHERE kind = identity_record.kind AND relation_name = expected_record.relation_name),
        (SELECT ids[1] FROM access_test_expected
         WHERE kind = 'Administrator' AND relation_name = expected_record.relation_name)
      ) INTO probe_id;
      IF probe_id IS NULL THEN RAISE EXCEPTION 'Missing update probe fixture'; END IF;
      EXECUTE format('UPDATE public.%I SET id = id WHERE id = $1', expected_record.relation_name) USING probe_id;
      GET DIAGNOSTICS actual_count = ROW_COUNT;
      IF actual_count <> (CASE WHEN identity_record.kind IN ('Administrator', 'Editor') THEN 1 ELSE 0 END) THEN
        RAISE EXCEPTION 'Update policy mismatch for % / %', identity_record.kind, expected_record.relation_name;
      END IF;
      checked_updates := checked_updates + 1;
    END LOOP;
  END LOOP;
  IF checked_sets <> 16 OR checked_updates <> 8 THEN
    RAISE EXCEPTION 'Incomplete probe coverage';
  END IF;
END;
$probes$;
RESET ROLE;

-- Remove fixtures, simulated identities and all temporary grants before committing the restore.
ROLLBACK TO SAVEPOINT access_probes;
RELEASE SAVEPOINT access_probes;
