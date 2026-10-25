BEGIN;

CREATE TEMP TABLE list_test_ids (name text PRIMARY KEY, id uuid NOT NULL DEFAULT gen_random_uuid());
INSERT INTO list_test_ids (name) VALUES
  ('editor'), ('viewer'), ('revoked'), ('unrelated'), ('client'), ('work'), ('other_work'),
  ('private_image'), ('first_image'), ('last_image'), ('null_image');
GRANT SELECT ON list_test_ids TO authenticated;

INSERT INTO auth.users (id, email)
SELECT id, name || '-' || id || '@list-test.invalid' FROM list_test_ids
WHERE name IN ('editor', 'viewer', 'revoked', 'unrelated');
UPDATE public.profiles SET role = CASE
  WHEN id = (SELECT id FROM list_test_ids WHERE name = 'editor') THEN 'Editor' ELSE 'Viewer' END
WHERE id IN (SELECT id FROM list_test_ids WHERE name IN ('editor', 'viewer', 'revoked', 'unrelated'));
INSERT INTO public.contacts (id, company_name)
SELECT id, 'Rollback-only list client' FROM list_test_ids WHERE name = 'client';
INSERT INTO public.artworks (id, title, notes, status, quality, year_execution, year_execution_start)
SELECT id, 'Rollback-only list artwork', repeat('Detail-only text ', 1000), 'Viewed', 7, 1950, 1948
FROM list_test_ids WHERE name IN ('work', 'other_work');
INSERT INTO public.artwork_proposals (artwork_id, contact_id)
SELECT w.id, c.id FROM list_test_ids w CROSS JOIN list_test_ids c
WHERE w.name = 'work' AND c.name = 'client';
INSERT INTO public.contact_users (contact_id, user_id, invited)
SELECT c.id, u.id, u.name <> 'revoked' FROM list_test_ids c CROSS JOIN list_test_ids u
WHERE c.name = 'client' AND u.name IN ('viewer', 'revoked');
INSERT INTO public.documents (id, artwork_id, document_type, url, position, visibility)
SELECT d.id, w.id, 'image', 'https://example.invalid/' || d.name,
  CASE d.name WHEN 'private_image' THEN -1 WHEN 'first_image' THEN 0 WHEN 'last_image' THEN 2 END,
  CASE d.name WHEN 'private_image' THEN 'internal' ELSE 'all_clients' END
FROM list_test_ids d CROSS JOIN list_test_ids w
WHERE d.name IN ('private_image', 'first_image', 'last_image', 'null_image') AND w.name = 'work';
INSERT INTO public.documents (artwork_id, document_type, label, url)
SELECT w.id, 'link', 'Large documentation ' || n, 'https://example.invalid/' || n
FROM list_test_ids w CROSS JOIN generate_series(1, 50) n WHERE w.name = 'work';

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.artworks_list_admin', 'SELECT')
    OR has_table_privilege('anon', 'public.viewer_artworks_list_secure', 'SELECT') THEN
    RAISE EXCEPTION 'Anonymous access to list views';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class WHERE oid IN
      ('public.artworks_list_admin'::regclass, 'public.viewer_artworks_list_secure'::regclass)
      AND NOT ('security_invoker=true' = ANY(reloptions))
  ) THEN RAISE EXCEPTION 'List views must enforce caller RLS'; END IF;
END;
$$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  member text;
  source_name text;
  list_name text;
  work uuid := (SELECT id FROM list_test_ids WHERE name = 'work');
  expected_image uuid;
  actual_image text;
  matches boolean;
  projected jsonb;
  full_row jsonb;
BEGIN
  FOREACH member IN ARRAY ARRAY['editor', 'viewer', 'revoked', 'unrelated']
  LOOP
    PERFORM set_config('request.jwt.claim.sub', (SELECT id::text FROM list_test_ids WHERE name = member), true);
    FOR source_name, list_name IN SELECT * FROM (VALUES
      ('artworks_full_admin', 'artworks_list_admin'),
      ('viewer_artworks_full_secure', 'viewer_artworks_list_secure')
    ) sources(source_name, list_name)
    LOOP
      EXECUTE format(
        'SELECT NOT EXISTS (
           (SELECT id FROM public.%I EXCEPT SELECT id FROM public.%I)
           UNION ALL
           (SELECT id FROM public.%I EXCEPT SELECT id FROM public.%I)
         )', source_name, list_name, list_name, source_name) INTO matches;
      IF NOT matches THEN RAISE EXCEPTION 'Artwork access changed for %, %', member, list_name; END IF;
      EXECUTE format('SELECT to_jsonb(a) FROM public.%I a WHERE id = $1', list_name) INTO projected USING work;
      IF projected IS NULL THEN CONTINUE; END IF;
      EXECUTE format('SELECT to_jsonb(a) FROM public.%I a WHERE id = $1', source_name) INTO full_row USING work;
      IF EXISTS (
        SELECT 1 FROM jsonb_each(projected - 'images') item
        WHERE item.value IS DISTINCT FROM full_row -> item.key
      ) THEN RAISE EXCEPTION 'List values changed for %, %', member, list_name; END IF;
      IF projected ?| ARRAY['documents', 'notes', 'changed_diff', 'proposals', 'provenance'] THEN
        RAISE EXCEPTION 'Detail-only fields leaked into list payload';
      END IF;
      SELECT id INTO expected_image FROM public.documents
        WHERE artwork_id = work AND document_type = 'image'
        ORDER BY COALESCE(position, 9999), id LIMIT 1;
      IF jsonb_array_length(projected->'images') <> (CASE WHEN expected_image IS NULL THEN 0 ELSE 1 END) THEN
        RAISE EXCEPTION 'List must return at most one accessible gallery image for %, %', member, list_name;
      END IF;
      actual_image := projected #>> '{images,0,id}';
      IF actual_image IS DISTINCT FROM expected_image::text THEN
        RAISE EXCEPTION 'Incorrect first accessible image for %', member;
      END IF;
      IF member = 'viewer' AND actual_image IS DISTINCT FROM
        (SELECT id::text FROM list_test_ids WHERE name = 'first_image') THEN
        RAISE EXCEPTION 'Viewer must skip the internal image';
      END IF;
      IF octet_length(projected::text) >= octet_length(full_row::text) / 2 THEN
        RAISE EXCEPTION 'Fixture list payload was not reduced by at least 50 percent';
      END IF;
    END LOOP;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub', (SELECT id::text FROM list_test_ids WHERE name = 'editor'), true);
  IF (SELECT images FROM public.artworks_list_admin
    WHERE id = (SELECT id FROM list_test_ids WHERE name = 'other_work')) IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'Artwork without images must return an empty array';
  END IF;
END;
$$;

ROLLBACK;
