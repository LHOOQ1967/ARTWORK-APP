BEGIN;
CREATE TEMP TABLE page_test_ids (name text PRIMARY KEY, id uuid NOT NULL DEFAULT gen_random_uuid());
INSERT INTO page_test_ids (name) VALUES ('editor'), ('viewer'), ('outsider'), ('revoked'), ('client'), ('artist');
CREATE TEMP TABLE page_test_works (n integer PRIMARY KEY, id uuid DEFAULT gen_random_uuid());
INSERT INTO page_test_works(n) SELECT generate_series(1, 45);
GRANT SELECT ON page_test_ids, page_test_works TO authenticated;
INSERT INTO auth.users (id, email)
SELECT id, name || '-' || id || '@page-test.invalid' FROM page_test_ids
WHERE name IN ('editor', 'viewer', 'outsider', 'revoked');
UPDATE public.profiles SET role = CASE WHEN id = (SELECT id FROM page_test_ids WHERE name = 'editor')
  THEN 'Editor' ELSE 'Viewer' END
WHERE id IN (SELECT id FROM page_test_ids WHERE name IN ('editor', 'viewer', 'outsider', 'revoked'));
INSERT INTO public.contacts(id, company_name)
SELECT id, 'Pagination fixture client' FROM page_test_ids WHERE name = 'client';
INSERT INTO public.artists(id, last_name)
SELECT id, 'Pagination fixture artist' FROM page_test_ids WHERE name = 'artist';
INSERT INTO public.contact_users (contact_id, user_id, invited)
SELECT c.id, u.id, u.name <> 'revoked' FROM page_test_ids c CROSS JOIN page_test_ids u
WHERE c.name = 'client' AND u.name IN ('viewer', 'revoked');
INSERT INTO public.artworks(id, title, status, priority, asking_price, date_proposition, artist_id, quality)
SELECT id, 'Pagination fixture ' || lpad(n::text, 3, '0'), 'Viewed', 'High', n,
  '2026-01-01'::date + n, (SELECT id FROM page_test_ids WHERE name = 'artist'),
  CASE WHEN n > 40 THEN NULL ELSE 8 END
FROM page_test_works;
INSERT INTO public.artwork_proposals(artwork_id, contact_id)
SELECT w.id, c.id FROM page_test_works w CROSS JOIN page_test_ids c WHERE c.name = 'client';
INSERT INTO public.documents(artwork_id, document_type, url, visibility)
SELECT id, 'image', 'https://example.invalid/private', 'internal' FROM page_test_works;
INSERT INTO public.documents(artwork_id, document_type, url, position)
SELECT id, 'image', 'https://example.invalid/public', 1 FROM page_test_works;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM page_test_ids WHERE name = 'editor'), true);
DO $$
DECLARE
  filters jsonb := jsonb_build_object('artistId', (SELECT id FROM page_test_ids WHERE name = 'artist'));
  first_page jsonb;
  second_page jsonb;
  last_page jsonb;
  filtered jsonb;
BEGIN
  first_page := public.artwork_list_page(filters);
  second_page := public.artwork_list_page(filters, '{}', 'market-High-others', 20);
  last_page := public.artwork_list_page(filters, '{}', 'market-High-others', 40);
  IF (first_page->>'total')::int <> 45 OR
    jsonb_array_length(first_page#>'{groups,0,rows}') <> 20 OR
    jsonb_array_length(second_page#>'{groups,0,rows}') <> 20 OR
    jsonb_array_length(last_page#>'{groups,0,rows}') <> 5 THEN
    RAISE EXCEPTION 'Incorrect page sizes or totals';
  END IF;
  IF first_page#>>'{groups,0,rows,0,title}' <> 'Pagination fixture 045'
    OR last_page#>>'{groups,0,rows,4,title}' <> 'Pagination fixture 001' THEN
    RAISE EXCEPTION 'Default date sorting is not global';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(first_page#>'{groups,0,rows}') a
    JOIN jsonb_array_elements(second_page#>'{groups,0,rows}') b ON a->>'id' = b->>'id') THEN
    RAISE EXCEPTION 'Pages overlap';
  END IF;
  filtered := public.artwork_list_page(filters, '{"market-High-others":{"sortKey":"asking","sortDirection":"asc"}}');
  IF filtered#>>'{groups,0,rows,0,title}' <> 'Pagination fixture 001' THEN
    RAISE EXCEPTION 'Server sort must cover rows beyond the initial page';
  END IF;
  filtered := public.artwork_list_page(filters || '{"search":"Pagination fixture 001"}');
  IF (filtered->>'total')::int <> 1 THEN RAISE EXCEPTION 'Search ignored unloaded rows'; END IF;
  IF jsonb_array_length(filtered->'artists') = 0 OR jsonb_array_length(filtered->'recipients') = 0 THEN
    RAISE EXCEPTION 'Filter options must include the whole scoped dataset';
  END IF;
  filtered := public.artwork_list_page(filters, '{"market-High-others":{"sortKey":"quality","sortDirection":"desc"}}');
  IF filtered#>'{groups,0,rows,0,quality}' = 'null'::jsonb THEN
    RAISE EXCEPTION 'Unrated works must sort last';
  END IF;
  IF (first_page#>'{groups,0,rows,0}') ? 'documents' THEN
    RAISE EXCEPTION 'Full documentation included in paginated rows';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM page_test_ids WHERE name = 'viewer'), true);
DO $$
DECLARE result jsonb;
BEGIN
  result := public.artwork_list_page(jsonb_build_object('artistId', (SELECT id FROM page_test_ids WHERE name = 'artist')));
  IF (result->>'total')::int <> 45 OR result->'recipients' <> '[]'::jsonb OR
    result#>'{groups,0,rows,0,proposals}' <> '[]'::jsonb OR
    result#>>'{groups,0,rows,0,images,0,url}' <> 'https://example.invalid/public' THEN
    RAISE EXCEPTION 'Viewer artwork/image/recipient isolation failed';
  END IF;
END;
$$;
DO $$
DECLARE member text; result jsonb;
BEGIN
  FOREACH member IN ARRAY ARRAY['outsider']
  LOOP
    PERFORM set_config('request.jwt.claim.sub', (SELECT id::text FROM page_test_ids WHERE name = member), true);
    result := public.artwork_list_page(jsonb_build_object('artistId', (SELECT id FROM page_test_ids WHERE name = 'artist')));
    IF (result->>'total')::int <> 0 OR result->'groups' <> '[]'::jsonb OR
      result->'artists' <> '[]'::jsonb OR result->'recipients' <> '[]'::jsonb THEN
      RAISE EXCEPTION 'Pagination leaked unauthorized data to %', member;
    END IF;
  END LOOP;
END;
$$;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM page_test_ids WHERE name = 'revoked'), true);
DO $$
DECLARE result jsonb; expected integer;
BEGIN
  SELECT count(*) INTO expected FROM public.viewer_artworks_list_secure
    WHERE artist_id = (SELECT id FROM page_test_ids WHERE name = 'artist');
  result := public.artwork_list_page(jsonb_build_object('artistId', (SELECT id FROM page_test_ids WHERE name = 'artist')));
  IF (result->>'total')::int <> expected THEN
    RAISE EXCEPTION 'Pagination changed existing artwork eligibility';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(result->'groups') g,
    jsonb_array_elements(g->'rows') r WHERE r->'images' <> '[]'::jsonb) THEN
    RAISE EXCEPTION 'Revoked document access leaked gallery images';
  END IF;
END;
$$;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM page_test_ids WHERE name = 'editor'), true);
UPDATE public.artworks SET status = 'Bought', date_acquisition = '2026-03-01',
  buyer_contact_id = (SELECT id FROM page_test_ids WHERE name = 'client')
WHERE id = (SELECT id FROM page_test_works WHERE n = 1);
DELETE FROM public.artwork_proposals WHERE artwork_id = (SELECT id FROM page_test_works WHERE n = 1);
UPDATE public.artworks SET status = 'Archived', date_proposition = NULL, sale_date = '2026-03-02'
WHERE id = (SELECT id FROM page_test_works WHERE n = 2);
UPDATE public.artworks SET status = 'Draft', auctions = true, priority = 'Low'
WHERE id = (SELECT id FROM page_test_works WHERE n = 3);
DO $$
DECLARE
  filters jsonb := jsonb_build_object('artistId', (SELECT id FROM page_test_ids WHERE name = 'artist'));
  result jsonb;
BEGIN
  result := public.artwork_list_page(filters);
  IF jsonb_array_length(result->'groups') <> 4 THEN
    RAISE EXCEPTION 'Market/draft/auction/bought/archived grouping changed';
  END IF;
  result := public.artwork_list_page(filters || '{"fromDate":"2026-04-01"}');
  IF (result->>'total')::int <> 43 THEN RAISE EXCEPTION 'Date filter must preserve active works'; END IF;
  result := public.artwork_list_page(filters || '{"fromDate":"2026-03-01","status":"Archived"}');
  IF (result->>'total')::int <> 1 THEN RAISE EXCEPTION 'Archived sale-date fallback lost'; END IF;
  result := public.artwork_list_page(filters || jsonb_build_object('status', 'Bought',
    'client', (SELECT id FROM page_test_ids WHERE name = 'client')));
  IF (result->>'total')::int <> 1 THEN RAISE EXCEPTION 'Global client filter must include buyer without proposal'; END IF;
  result := public.artwork_list_page(filters || jsonb_build_object('status', 'Bought',
    'proposedTo', (SELECT id FROM page_test_ids WHERE name = 'client')));
  IF (result->>'total')::int <> 0 THEN RAISE EXCEPTION 'Fixed recipient filter was ignored'; END IF;
  BEGIN
    PERFORM public.artwork_list_page(filters, '{}', NULL, -1);
    RAISE EXCEPTION 'Negative offset accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Invalid page offset' THEN RAISE; END IF;
  END;
  IF has_function_privilege('anon', 'public.artwork_list_page(jsonb,jsonb,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous pagination execution was granted';
  END IF;
END;
$$;
ROLLBACK;
