BEGIN;

CREATE TEMP TABLE artist_update_test_ids (name text PRIMARY KEY, id uuid NOT NULL DEFAULT gen_random_uuid());
INSERT INTO artist_update_test_ids (name) VALUES ('admin'), ('editor'), ('viewer'), ('artist'), ('work'), ('client');
GRANT SELECT ON artist_update_test_ids TO authenticated;

INSERT INTO auth.users (id, email)
SELECT id, name || '-' || id || '@artist-update-test.invalid'
FROM artist_update_test_ids WHERE name IN ('admin', 'editor', 'viewer');
UPDATE public.profiles SET role = CASE
  WHEN id = (SELECT id FROM artist_update_test_ids WHERE name = 'admin') THEN 'Administrator'
  WHEN id = (SELECT id FROM artist_update_test_ids WHERE name = 'editor') THEN 'Editor'
  ELSE 'Viewer' END
WHERE id IN (SELECT id FROM artist_update_test_ids WHERE name IN ('admin', 'editor', 'viewer'));
INSERT INTO public.artists (id, last_name, source, legacy_no)
SELECT id, 'Original', 'access_import',
  (SELECT LEAST(COALESCE(MIN(legacy_no), 0), 0) - 1 FROM public.artists)
FROM artist_update_test_ids WHERE name = 'artist';
INSERT INTO public.artworks (id, title, artist_id)
SELECT work.id, 'Artist update test', artist.id
FROM artist_update_test_ids work CROSS JOIN artist_update_test_ids artist
WHERE work.name = 'work' AND artist.name = 'artist';
INSERT INTO public.contacts (id, company_name)
SELECT id, 'Artist update test' FROM artist_update_test_ids WHERE name = 'client';
INSERT INTO public.artwork_proposals (artwork_id, contact_id)
SELECT work.id, client.id FROM artist_update_test_ids work CROSS JOIN artist_update_test_ids client
WHERE work.name = 'work' AND client.name = 'client';
INSERT INTO public.contact_users (contact_id, user_id, invited)
SELECT client.id, viewer.id, true FROM artist_update_test_ids client CROSS JOIN artist_update_test_ids viewer
WHERE client.name = 'client' AND viewer.name = 'viewer';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM artist_update_test_ids WHERE name = 'editor'), true);
DO $$
DECLARE affected integer;
BEGIN
  UPDATE public.artists SET last_name = 'Editor update' WHERE id = (SELECT id FROM artist_update_test_ids WHERE name = 'artist');
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Editor cannot update artist'; END IF;
END;
$$;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM artist_update_test_ids WHERE name = 'admin'), true);
DO $$
DECLARE affected integer;
BEGIN
  UPDATE public.artists SET last_name = 'Admin update' WHERE id = (SELECT id FROM artist_update_test_ids WHERE name = 'artist');
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Administrator cannot update artist'; END IF;
END;
$$;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM artist_update_test_ids WHERE name = 'viewer'), true);
DO $$
DECLARE affected integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.artists WHERE id = (SELECT id FROM artist_update_test_ids WHERE name = 'artist')) THEN
    RAISE EXCEPTION 'Viewer must be able to read the test artist';
  END IF;
  UPDATE public.artists SET last_name = 'Viewer update' WHERE id = (SELECT id FROM artist_update_test_ids WHERE name = 'artist');
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Viewer was able to update artist'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.artists WHERE id = (SELECT id FROM artist_update_test_ids WHERE name = 'artist') AND last_name = 'Admin update') THEN
    RAISE EXCEPTION 'Artist update did not persist';
  END IF;
END;
$$;
ROLLBACK;
