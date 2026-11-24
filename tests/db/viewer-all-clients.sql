BEGIN;

CREATE TEMP TABLE all_clients_test_ids (name text PRIMARY KEY, id uuid NOT NULL DEFAULT gen_random_uuid());
INSERT INTO all_clients_test_ids (name) VALUES
  ('admin'), ('viewer'), ('other'), ('client_a'), ('client_b'), ('future'), ('nonclient'), ('work');
GRANT SELECT ON all_clients_test_ids TO authenticated;

INSERT INTO auth.users (id, email)
SELECT id, name || '-' || id || '@all-clients-test.invalid' FROM all_clients_test_ids
WHERE name IN ('admin', 'viewer', 'other');
UPDATE public.profiles SET role = CASE WHEN id = (SELECT id FROM all_clients_test_ids WHERE name = 'admin')
  THEN 'Administrator' ELSE 'Viewer' END
WHERE id IN (SELECT id FROM all_clients_test_ids WHERE name IN ('admin', 'viewer', 'other'));
INSERT INTO public.contacts (id, company_name, is_client)
SELECT id, name, name <> 'nonclient' FROM all_clients_test_ids
WHERE name IN ('client_a', 'client_b', 'nonclient');
INSERT INTO public.artworks (id, title)
SELECT id, 'All client access test' FROM all_clients_test_ids WHERE name = 'work';
INSERT INTO public.artwork_proposals (artwork_id, contact_id)
SELECT w.id, c.id FROM all_clients_test_ids w CROSS JOIN all_clients_test_ids c
WHERE w.name = 'work' AND c.name IN ('client_a', 'client_b', 'nonclient');
UPDATE public.artworks SET buyer_contact_id = (SELECT id FROM all_clients_test_ids WHERE name = 'client_a')
WHERE id = (SELECT id FROM all_clients_test_ids WHERE name = 'work');
INSERT INTO public.documents (artwork_id, document_type, label, url, visibility, recipient_contact_id)
SELECT w.id, 'link', v.label, 'https://example.invalid/document', v.visibility, c.id
FROM (VALUES ('Internal', 'internal', NULL), ('Client A', 'selected_client', 'client_a'),
  ('Client B', 'selected_client', 'client_b')) v(label, visibility, client_name)
JOIN all_clients_test_ids w ON w.name = 'work'
LEFT JOIN all_clients_test_ids c ON c.name = v.client_name;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM all_clients_test_ids WHERE name = 'other'), true);
DO $$
BEGIN
  BEGIN
    PERFORM public.set_viewer_client_access((SELECT id FROM all_clients_test_ids WHERE name = 'other'), true);
    RAISE EXCEPTION 'Viewer granted all-client access';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM all_clients_test_ids WHERE name = 'admin'), true);
SELECT public.set_viewer_client_access((SELECT id FROM all_clients_test_ids WHERE name = 'viewer'), true);
SELECT public.set_viewer_client_access((SELECT id FROM all_clients_test_ids WHERE name = 'other'), false,
  (SELECT id FROM all_clients_test_ids WHERE name = 'client_a'));

SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM all_clients_test_ids WHERE name = 'viewer'), true);
DO $$
DECLARE
  result jsonb;
  filters jsonb := jsonb_build_object('search', 'All client access test');
BEGIN
  IF NOT public.can_view_client_names() THEN
    RAISE EXCEPTION 'All-client Viewer cannot see client names';
  END IF;
  result := public.artwork_list_page(filters);
  IF (result->>'total')::int <> 1 OR jsonb_array_length(result->'recipients') <> 2
    OR jsonb_array_length(result#>'{groups,0,rows,0,proposals}') <> 2
    OR result#>>'{groups,0,rows,0,buyer,company_name}' IS DISTINCT FROM 'client_a' THEN
    RAISE EXCEPTION 'All-client Viewer list lost scoped recipients or buyer';
  END IF;
  IF public.artwork_category_ids('market', filters,
    '{"market-Other-others":{"sortKey":"proposed_to","sortDirection":"asc"}}')
    IS DISTINCT FROM ARRAY[(SELECT id FROM all_clients_test_ids WHERE name = 'work')] THEN
    RAISE EXCEPTION 'All-client category factsheets differ from the list';
  END IF;
  result := public.artwork_list_page(filters || jsonb_build_object('client',
    (SELECT id FROM all_clients_test_ids WHERE name = 'client_b')));
  IF (result->>'total')::int <> 1 THEN
    RAISE EXCEPTION 'All-client Viewer cannot filter to another client';
  END IF;
  result := public.artwork_list_page(filters || jsonb_build_object('client',
    (SELECT id FROM all_clients_test_ids WHERE name = 'nonclient')));
  IF (result->>'total')::int <> 0 THEN
    RAISE EXCEPTION 'All-client Viewer filter exposed an unauthorized contact';
  END IF;
  UPDATE public.artworks SET title = 'Unauthorized change'
    WHERE id = (SELECT id FROM all_clients_test_ids WHERE name = 'work');
  IF FOUND THEN RAISE EXCEPTION 'Client visibility granted artwork editing'; END IF;
  IF NOT public.user_has_any_access() OR
    (SELECT count(*) FROM public.artwork_comment_clients((SELECT id FROM all_clients_test_ids WHERE name = 'work'))) <> 2 THEN
    RAISE EXCEPTION 'All-client Viewer cannot access both client conversations';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contact_users WHERE contact_id = (SELECT id FROM all_clients_test_ids WHERE name = 'nonclient')) THEN
    RAISE EXCEPTION 'All-client Viewer received non-client access';
  END IF;
  IF (SELECT count(*) FROM public.documents WHERE artwork_id = (SELECT id FROM all_clients_test_ids WHERE name = 'work')) <> 2
    OR EXISTS (SELECT 1 FROM public.documents WHERE artwork_id = (SELECT id FROM all_clients_test_ids WHERE name = 'work') AND visibility = 'internal') THEN
    RAISE EXCEPTION 'All-client Viewer must see both client documents but not internal documents';
  END IF;
  BEGIN
    INSERT INTO public.artwork_viewer_comments (artwork_id, user_id, comment)
    VALUES ((SELECT id FROM all_clients_test_ids WHERE name = 'work'), auth.uid(), 'Internal');
    RAISE EXCEPTION 'Viewer created an internal comment';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM all_clients_test_ids WHERE name = 'other'), true);
DO $$
DECLARE result jsonb;
BEGIN
  result := public.artwork_list_page('{"search":"All client access test"}');
  IF public.can_view_client_names() OR (result->>'total')::int <> 1
    OR result->'recipients' <> '[]'::jsonb
    OR result#>'{groups,0,rows,0,proposals}' <> '[]'::jsonb
    OR result#>'{groups,0,rows,0,buyer}' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'Single-client Viewer client visibility changed';
  END IF;
END;
$$;
RESET ROLE;
INSERT INTO public.contacts (id, company_name, is_client)
SELECT id, name, true FROM all_clients_test_ids WHERE name = 'future';
UPDATE public.contacts SET is_client = true WHERE id = (SELECT id FROM all_clients_test_ids WHERE name = 'nonclient');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM all_clients_test_ids WHERE name = 'viewer'), true);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.contact_users WHERE contact_id = (SELECT id FROM all_clients_test_ids WHERE name = 'future') AND invited)
    OR NOT EXISTS (SELECT 1 FROM public.contact_users WHERE contact_id = (SELECT id FROM all_clients_test_ids WHERE name = 'nonclient') AND invited) THEN
    RAISE EXCEPTION 'Newly created or promoted client not granted';
  END IF;
END;
$$;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM all_clients_test_ids WHERE name = 'admin'), true);
SELECT public.set_viewer_client_access((SELECT id FROM all_clients_test_ids WHERE name = 'viewer'), false,
  (SELECT id FROM all_clients_test_ids WHERE name = 'client_a'));
RESET ROLE;
UPDATE public.contacts SET is_client = false WHERE id = (SELECT id FROM all_clients_test_ids WHERE name = 'nonclient');
UPDATE public.contacts SET is_client = true WHERE id = (SELECT id FROM all_clients_test_ids WHERE name = 'nonclient');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM all_clients_test_ids WHERE name = 'viewer'), true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.contact_users) <> 1
    OR NOT EXISTS (SELECT 1 FROM public.contact_users WHERE contact_id = (SELECT id FROM all_clients_test_ids WHERE name = 'client_a')) THEN
    RAISE EXCEPTION 'Switching to one client did not revoke all-client access';
  END IF;
END;
$$;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM all_clients_test_ids WHERE name = 'admin'), true);
SELECT public.set_viewer_client_access((SELECT id FROM all_clients_test_ids WHERE name = 'viewer'), true);
RESET ROLE;
UPDATE public.contacts SET is_client = false WHERE id = (SELECT id FROM all_clients_test_ids WHERE name = 'client_b');
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.contact_users WHERE user_id = (SELECT id FROM all_clients_test_ids WHERE name = 'viewer')
    AND contact_id = (SELECT id FROM all_clients_test_ids WHERE name = 'client_b')) THEN
    RAISE EXCEPTION 'Access retained after client was unmarked';
  END IF;
END;
$$;
UPDATE public.profiles SET role = 'Editor' WHERE id = (SELECT id FROM all_clients_test_ids WHERE name = 'viewer');
UPDATE public.profiles SET role = 'Viewer' WHERE id = (SELECT id FROM all_clients_test_ids WHERE name = 'viewer');
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.viewer_all_clients WHERE user_id = (SELECT id FROM all_clients_test_ids WHERE name = 'viewer'))
    OR EXISTS (SELECT 1 FROM public.contact_users WHERE user_id = (SELECT id FROM all_clients_test_ids WHERE name = 'viewer')) THEN
    RAISE EXCEPTION 'All-client grant survived a role change';
  END IF;
END;
$$;
ROLLBACK;
