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
INSERT INTO public.documents(artwork_id, document_type, url, visibility, position)
SELECT id, 'image', 'https://example.invalid/private', 'internal', 0 FROM page_test_works;
INSERT INTO public.documents(artwork_id, document_type, url, position)
SELECT id, 'image', 'https://example.invalid/public', 1 FROM page_test_works;
INSERT INTO public.documents(artwork_id, document_type, url, position)
SELECT id, 'image', 'https://example.invalid/later', position
FROM page_test_works CROSS JOIN (VALUES (2), (NULL::integer)) positions(position);

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
  IF cardinality(public.artwork_category_ids('market', filters)) <> 45 OR
    public.artwork_category_ids('market', filters) <>
      (SELECT array_agg(id ORDER BY n DESC) FROM page_test_works) THEN
    RAISE EXCEPTION 'Category identifiers must include all rows in default list order';
  END IF;
  IF public.artwork_category_ids('market-High-others', filters,
      '{"market-High-others":{"sortKey":"asking","sortDirection":"asc"}}') <>
      (SELECT array_agg(id ORDER BY n) FROM page_test_works) THEN
    RAISE EXCEPTION 'Category identifiers must preserve global custom sort';
  END IF;
  IF cardinality(public.artwork_category_ids('market', filters || '{"search":"Pagination fixture 001"}')) <> 1 THEN
    RAISE EXCEPTION 'Category identifiers ignored search';
  END IF;
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
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(first_page->'groups') g,
      jsonb_array_elements(g->'rows') r
    WHERE jsonb_array_length(r->'images') <> 1
      OR r#>>'{images,0,url}' <> 'https://example.invalid/private'
  ) THEN RAISE EXCEPTION 'Staff pages must retain only the first accessible gallery image'; END IF;
  IF first_page->'artists' IS DISTINCT FROM second_page->'artists'
    OR first_page->'proposers' IS DISTINCT FROM second_page->'proposers'
    OR first_page->'recipients' IS DISTINCT FROM second_page->'recipients'
    OR first_page->'statuses' IS DISTINCT FROM second_page->'statuses' THEN
    RAISE EXCEPTION 'Named pages must preserve complete scoped filter options';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM page_test_ids WHERE name = 'viewer'), true);
DO $$
DECLARE result jsonb;
BEGIN
  result := public.artwork_list_page(jsonb_build_object('artistId', (SELECT id FROM page_test_ids WHERE name = 'artist')));
  IF cardinality(public.artwork_category_ids('market',
      jsonb_build_object('artistId', (SELECT id FROM page_test_ids WHERE name = 'artist')))) <> 45 THEN
    RAISE EXCEPTION 'Viewer category identifiers changed artwork access';
  END IF;
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
    IF cardinality(public.artwork_category_ids('market',
        jsonb_build_object('artistId', (SELECT id FROM page_test_ids WHERE name = 'artist')))) <> 0 THEN
      RAISE EXCEPTION 'Category identifiers leaked unauthorized artworks';
    END IF;
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
  result := public.artwork_list_page(filters || '{"marketType":"auction"}');
  IF (result->>'total')::int <> 1 THEN RAISE EXCEPTION 'Auction market filter returned the wrong artworks'; END IF;
  result := public.artwork_list_page(filters || '{"marketType":"market"}');
  IF (result->>'total')::int <> 44 THEN RAISE EXCEPTION 'Private market filter returned the wrong artworks'; END IF;
  result := public.artwork_list_page(filters || '{"marketType":"auction","status":"Archived"}');
  IF (result->>'total')::int <> 0 THEN RAISE EXCEPTION 'Auction filter did not scope archived artworks'; END IF;
  result := public.artwork_list_page(filters || '{"marketType":"market","status":"Archived"}');
  IF (result->>'total')::int <> 1 THEN RAISE EXCEPTION 'Private market filter did not scope archived artworks'; END IF;
  result := public.artwork_list_page(filters || '{"marketType":"none"}');
  IF (result->>'total')::int <> 0 THEN RAISE EXCEPTION 'No-market selection must return no artworks'; END IF;
  IF cardinality(public.artwork_category_ids('archived', filters)) <> 1
    OR cardinality(public.artwork_category_ids('auction', filters)) <> 1
    OR cardinality(public.artwork_category_ids('bought', filters)) <> 1
    OR cardinality(public.artwork_category_ids('market', filters || '{"marketType":"none"}')) <> 0 THEN
    RAISE EXCEPTION 'Category identifier section or market filtering changed';
  END IF;
  IF has_function_privilege('anon', 'public.artwork_category_ids(text,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous category access was granted';
  END IF;
  result := public.artwork_list_page(filters || jsonb_build_object('status', 'Bought',
    'client', (SELECT id FROM page_test_ids WHERE name = 'client')));
  IF (result->>'total')::int <> 1 THEN RAISE EXCEPTION 'Global client filter must include buyer without proposal'; END IF;
  result := public.artwork_list_page(filters || jsonb_build_object('status', 'Bought',
    'proposedTo', (SELECT id FROM page_test_ids WHERE name = 'client')));
  IF (result->>'total')::int <> 0 THEN RAISE EXCEPTION 'Fixed recipient filter was ignored'; END IF;
  BEGIN
    PERFORM public.artwork_list_page(filters || '{"marketType":"invalid"}');
    RAISE EXCEPTION 'Invalid market type accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Invalid market type filter' THEN RAISE; END IF;
  END;
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
UPDATE public.artworks SET auctions = true, sale_date = '2025-12-31', sale_time = '13:00'
WHERE id = (SELECT id FROM page_test_works WHERE n = 3);
UPDATE public.artworks SET auctions = true, sale_date = '2026-01-01', sale_time = '11:30'
WHERE id = (SELECT id FROM page_test_works WHERE n = 4);
UPDATE public.artworks SET auctions = true, sale_date = '2026-01-01', sale_time = '10:00'
WHERE id = (SELECT id FROM page_test_works WHERE n = 5);
DO $$
DECLARE
  filters jsonb := jsonb_build_object(
    'artistId', (SELECT id FROM page_test_ids WHERE name = 'artist'),
    'status', 'Active',
    'proposalSort', 'priority,status'
  );
  result jsonb;
BEGIN
  result := public.artwork_list_page(filters);
  IF jsonb_array_length(result->'groups') <> 3
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(result->'groups') g
      WHERE g->>'id' = 'market-priority-high-status-viewed')
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(result->'groups') g
      WHERE g->>'id' = 'auction-priority-high-status-viewed')
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(result->'groups') g
      WHERE g->>'id' = 'auction-priority-low-status-draft') THEN
    RAISE EXCEPTION 'Default active proposal sort must create market, priority, and status tables';
  END IF;
  result := public.artwork_list_page(filters - 'proposalSort');
  IF jsonb_array_length(result->'groups') <> 2
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(result->'groups') g WHERE g->>'id' = 'market')
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(result->'groups') g WHERE g->>'id' = 'auction') THEN
    RAISE EXCEPTION 'Active proposals without subgroup sorting must remain grouped only by market type';
  END IF;
  result := public.artwork_list_page(filters || '{"proposalSort":"priority"}');
  IF jsonb_array_length(result->'groups') <> 3
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(result->'groups') g WHERE g->>'id' = 'market-priority-high')
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(result->'groups') g WHERE g->>'id' = 'auction-priority-high')
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(result->'groups') g WHERE g->>'id' = 'auction-priority-low') THEN
    RAISE EXCEPTION 'Priority sorting must create distinct priority tables';
  END IF;
  result := public.artwork_list_page(filters || '{"proposalSort":"status"}');
  IF jsonb_array_length(result->'groups') <> 3
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(result->'groups') g WHERE g->>'id' = 'market-status-viewed')
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(result->'groups') g WHERE g->>'id' = 'auction-status-viewed')
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(result->'groups') g WHERE g->>'id' = 'auction-status-draft') THEN
    RAISE EXCEPTION 'Status sorting must create distinct status tables';
  END IF;
  result := public.artwork_list_page(filters);
  IF (SELECT g->>'total' FROM jsonb_array_elements(result->'groups') g
      WHERE g->>'id' = 'market-priority-high-status-viewed') <> '40'
    OR (SELECT g->>'total' FROM jsonb_array_elements(result->'groups') g
      WHERE g->>'id' = 'auction-priority-high-status-viewed') <> '2'
    OR (SELECT g->>'total' FROM jsonb_array_elements(result->'groups') g
      WHERE g->>'id' = 'auction-priority-low-status-draft') <> '1' THEN
    RAISE EXCEPTION 'Priority/status grouping changed active proposal totals';
  END IF;
  IF (SELECT g#>>'{rows,0,title}' FROM jsonb_array_elements(result->'groups') g
      WHERE g->>'id' = 'market-priority-high-status-viewed')
      <> 'Pagination fixture 045' THEN
    RAISE EXCEPTION 'Private market proposals must be ordered by proposal date';
  END IF;
  IF (SELECT g#>>'{rows,0,title}' FROM jsonb_array_elements(result->'groups') g
      WHERE g->>'id' = 'auction-priority-high-status-viewed')
      <> 'Pagination fixture 005'
    OR (SELECT g#>>'{rows,1,title}' FROM jsonb_array_elements(result->'groups') g
      WHERE g->>'id' = 'auction-priority-high-status-viewed')
      <> 'Pagination fixture 004'
    OR (SELECT g#>>'{rows,0,title}' FROM jsonb_array_elements(result->'groups') g
      WHERE g->>'id' = 'auction-priority-low-status-draft')
      <> 'Pagination fixture 003' THEN
    RAISE EXCEPTION 'Date/time ordering must be preserved within priority/status tables';
  END IF;
END;
$$;
UPDATE public.artworks SET status = 'Draft', priority = 'High', date_proposition = '2025-01-01'
WHERE id = (SELECT id FROM page_test_works WHERE n = 43);
UPDATE public.artworks SET status = 'Viewed', priority = 'High', date_proposition = '2026-02-14'
WHERE id = (SELECT id FROM page_test_works WHERE n = 44);
UPDATE public.artworks SET status = 'Draft', priority = 'Low', date_proposition = '2026-02-15'
WHERE id = (SELECT id FROM page_test_works WHERE n = 45);
DO $$
DECLARE
  filters jsonb := jsonb_build_object(
    'artistId', (SELECT id FROM page_test_ids WHERE name = 'artist'),
    'status', 'Active',
    'proposalSort', 'priority,status'
  );
  result jsonb;
BEGIN
  result := public.artwork_list_page(filters);
  IF (SELECT g#>>'{rows,0,title}' FROM jsonb_array_elements(result->'groups') g
      WHERE g->>'id' = 'market-priority-high-status-draft')
      <> 'Pagination fixture 043'
    OR (SELECT g#>>'{rows,0,title}' FROM jsonb_array_elements(result->'groups') g
      WHERE g->>'id' = 'market-priority-high-status-viewed')
      <> 'Pagination fixture 044' THEN
    RAISE EXCEPTION 'Priority/status tables must be grouped by both selected criteria';
  END IF;
  IF (SELECT g#>>'{rows,0,title}' FROM jsonb_array_elements(result->'groups') g
      WHERE g->>'id' = 'auction-priority-high-status-viewed')
      <> 'Pagination fixture 005'
    OR (SELECT g#>>'{rows,1,title}' FROM jsonb_array_elements(result->'groups') g
      WHERE g->>'id' = 'auction-priority-high-status-viewed')
      <> 'Pagination fixture 004' THEN
    RAISE EXCEPTION 'Sale date and time ordering must be preserved within auction tables';
  END IF;
END;
$$;
UPDATE public.artworks a SET auctions = true, status = 'Viewed', priority = 'High',
  title = 'Auction ordering fixture ' || w.n,
  sale_date = CASE WHEN w.n = 6 THEN '2026-11-16'::date
    WHEN w.n = 32 THEN '2026-11-18'::date ELSE '2026-11-17'::date END,
  sale_time = CASE WHEN w.n IN (7, 32) THEN '00:00'::time
    WHEN w.n = 8 THEN '23:59'::time ELSE NULL END,
  lot = CASE WHEN w.n BETWEEN 9 AND 30 THEN (w.n - 8)::text
    WHEN w.n = 8 THEN '1000' ELSE NULL END
FROM page_test_works w WHERE a.id = w.id AND w.n BETWEEN 6 AND 32;
DO $$
DECLARE
  filters jsonb := jsonb_build_object(
    'artistId', (SELECT id FROM page_test_ids WHERE name = 'artist'),
    'status', 'Active', 'search', 'Auction ordering fixture'
  );
  first_page jsonb;
  second_page jsonb;
  actual uuid[];
  expected uuid[];
BEGIN
  first_page := public.artwork_list_page(filters);
  second_page := public.artwork_list_page(filters, '{}', 'auction', 20);
  SELECT array_agg((r->>'id')::uuid ORDER BY page, position) INTO actual
  FROM (VALUES (0, first_page), (1, second_page)) pages(page, data),
    LATERAL jsonb_array_elements(data->'groups') g,
    LATERAL jsonb_array_elements(g->'rows') WITH ORDINALITY rows(r, position);
  SELECT array_agg(id ORDER BY n) INTO expected FROM page_test_works WHERE n BETWEEN 6 AND 32;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'Auction date/time/lot ordering must be global across page boundaries';
  END IF;
  IF public.artwork_category_ids('auction', filters) IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'Auction factsheets must preserve ascending sale order beyond the first page';
  END IF;
  first_page := public.artwork_list_page(filters,
    '{"auction":{"sortKey":"date","sortDirection":"desc"}}');
  second_page := public.artwork_list_page(filters,
    '{"auction":{"sortKey":"date","sortDirection":"desc"}}', 'auction', 20);
  SELECT array_agg((r->>'id')::uuid ORDER BY page, position) INTO actual
  FROM (VALUES (0, first_page), (1, second_page)) pages(page, data),
    LATERAL jsonb_array_elements(data->'groups') g,
    LATERAL jsonb_array_elements(g->'rows') WITH ORDINALITY rows(r, position);
  SELECT array_agg(id ORDER BY CASE n WHEN 32 THEN 0 WHEN 8 THEN 1 WHEN 7 THEN 2
    WHEN 6 THEN 100 ELSE n END) INTO expected
  FROM page_test_works WHERE n BETWEEN 6 AND 32;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'Descending auction dates must still put missing times last and sort lots numerically';
  END IF;
  IF public.artwork_category_ids('auction', filters,
    '{"auction":{"sortKey":"date","sortDirection":"desc"}}') IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'Auction factsheets must preserve descending sale order beyond the first page';
  END IF;
END;
$$;
UPDATE public.artworks a SET title = 'Category ordering fixture ' || w.n,
  auctions = w.n % 2 = 0,
  status = CASE WHEN w.n % 3 = 0 THEN 'Draft' ELSE 'Viewed' END,
  priority = CASE WHEN w.n % 4 < 2 THEN 'High' ELSE 'Low' END,
  sale_date = '2026-11-17', sale_time = CASE WHEN w.n % 3 = 0 THEN NULL ELSE '10:00'::time END,
  lot = w.n::text
FROM page_test_works w WHERE a.id = w.id AND w.n BETWEEN 33 AND 42;
DO $$
DECLARE
  filters jsonb := jsonb_build_object(
    'artistId', (SELECT id FROM page_test_ids WHERE name = 'artist'),
    'status', 'Active', 'search', 'Category ordering fixture'
  );
  mode text;
  category text;
  custom_sort boolean;
  tables jsonb;
  result jsonb;
  expected uuid[];
BEGIN
  FOREACH mode IN ARRAY ARRAY['priority,status', 'priority', 'status', ''] LOOP
    filters := filters || jsonb_build_object('proposalSort', mode);
    FOREACH custom_sort IN ARRAY ARRAY[false, true] LOOP
      tables := '{}'::jsonb;
      IF custom_sort THEN
        result := public.artwork_list_page(filters);
        SELECT jsonb_object_agg(g->>'id', '{"sortKey":"title","sortDirection":"desc"}'::jsonb)
          INTO tables FROM jsonb_array_elements(result->'groups') g;
      END IF;
      result := public.artwork_list_page(filters, tables);
      FOREACH category IN ARRAY ARRAY['market', 'auction'] LOOP
        SELECT array_agg((r->>'id')::uuid ORDER BY
          CASE WHEN strpos(mode, 'priority') > 0 THEN CASE g#>>'{rows,0,priority}'
            WHEN 'High' THEN 0 WHEN 'Low' THEN 2 ELSE 4 END END,
          (CASE WHEN strpos(mode, 'status') > 0 THEN g#>>'{rows,0,status}' END)
            COLLATE pg_catalog."fr-CH-x-icu",
          position)
        INTO expected
        FROM jsonb_array_elements(result->'groups') g,
          LATERAL jsonb_array_elements(g->'rows') WITH ORDINALITY rows(r, position)
        WHERE g->>'id' = category OR starts_with(g->>'id', category || '-');
        IF public.artwork_category_ids(category, filters, tables) IS DISTINCT FROM expected THEN
          RAISE EXCEPTION 'Factsheet order differs from Active list: category %, sorting %, custom %',
            category, mode, custom_sort;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;
ROLLBACK;
