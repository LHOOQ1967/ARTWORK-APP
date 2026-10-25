BEGIN;

CREATE TEMP TABLE document_test_ids (name text PRIMARY KEY, id uuid NOT NULL DEFAULT gen_random_uuid());
INSERT INTO document_test_ids (name) VALUES
  ('viewer_a'), ('peer_a'), ('viewer_b'), ('multi'), ('revoked'), ('inactive'), ('editor'), ('admin'),
  ('client_a'), ('client_b'), ('client_c'), ('work'), ('other_work'),
  ('shared'), ('internal'), ('for_a'), ('for_b'), ('image');
GRANT SELECT ON document_test_ids TO authenticated;

INSERT INTO auth.users (id, email)
SELECT id, name || '-' || id || '@document-test.invalid' FROM document_test_ids
WHERE name IN ('viewer_a', 'peer_a', 'viewer_b', 'multi', 'revoked', 'inactive', 'editor', 'admin');
UPDATE public.profiles SET role = CASE
  WHEN id = (SELECT id FROM document_test_ids WHERE name = 'editor') THEN 'Editor'
  WHEN id = (SELECT id FROM document_test_ids WHERE name = 'admin') THEN 'Administrator'
  ELSE 'Viewer' END,
  is_active = id <> (SELECT id FROM document_test_ids WHERE name = 'inactive')
WHERE id IN (SELECT id FROM document_test_ids
  WHERE name IN ('viewer_a', 'peer_a', 'viewer_b', 'multi', 'revoked', 'inactive', 'editor', 'admin'));
INSERT INTO public.contacts (id, company_name)
SELECT id, name FROM document_test_ids WHERE name IN ('client_a', 'client_b', 'client_c');
INSERT INTO public.artworks (id, title)
SELECT id, 'Rollback-only document visibility test' FROM document_test_ids WHERE name IN ('work', 'other_work');
INSERT INTO public.artwork_proposals (artwork_id, contact_id)
SELECT w.id, c.id FROM document_test_ids w CROSS JOIN document_test_ids c
WHERE w.name = 'work' AND c.name IN ('client_a', 'client_b');
INSERT INTO public.contact_users (contact_id, user_id, invited)
SELECT c.id, u.id, u.name <> 'revoked'
FROM document_test_ids c CROSS JOIN document_test_ids u
WHERE (c.name = 'client_a' AND u.name IN ('viewer_a', 'peer_a', 'multi', 'revoked', 'inactive'))
   OR (c.name = 'client_b' AND u.name IN ('viewer_b', 'multi'));

-- Omitted visibility must backfill/default to All artwork clients.
INSERT INTO public.documents (id, artwork_id, document_type, label, url)
SELECT d.id, w.id, CASE WHEN d.name = 'image' THEN 'image' ELSE 'link' END,
  d.name, 'https://example.invalid/' || d.name
FROM document_test_ids d CROSS JOIN document_test_ids w
WHERE d.name IN ('shared', 'image') AND w.name = 'work';
INSERT INTO public.documents (id, artwork_id, document_type, label, url, visibility, recipient_contact_id)
SELECT d.id, w.id, 'link', d.name, 'https://example.invalid/' || d.name, v.visibility, c.id
FROM (VALUES ('internal', 'internal', NULL), ('for_a', 'selected_client', 'client_a'),
  ('for_b', 'selected_client', 'client_b')) v(document_name, visibility, client_name)
JOIN document_test_ids d ON d.name = v.document_name
JOIN document_test_ids w ON w.name = 'work'
LEFT JOIN document_test_ids c ON c.name = v.client_name;
UPDATE public.artworks SET rapport_heritier_document_id = (SELECT id FROM document_test_ids WHERE name = 'for_a')
WHERE id = (SELECT id FROM document_test_ids WHERE name = 'work');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM document_test_ids WHERE name = 'viewer_a'), true);
DO $$
DECLARE work uuid := (SELECT id FROM document_test_ids WHERE name = 'work');
  affected integer;
BEGIN
  IF (SELECT count(*) FROM public.documents WHERE artwork_id = work) <> 3 THEN
    RAISE EXCEPTION 'Viewer A must see shared documents, images and its own client documents';
  END IF;
  IF EXISTS (SELECT 1 FROM public.documents WHERE artwork_id = work
    AND (visibility = 'internal' OR recipient_contact_id = (SELECT id FROM document_test_ids WHERE name = 'client_b'))) THEN
    RAISE EXCEPTION 'Internal or other client document leaked';
  END IF;
  IF (SELECT count(*) FROM public.viewer_documents WHERE artwork_id = work) <> 3 THEN
    RAISE EXCEPTION 'Viewer document view bypassed visibility';
  END IF;
  IF EXISTS (SELECT 1 FROM public.artworks_change_log WHERE artwork_id = work AND operation LIKE 'DOCUMENT%') THEN
    RAISE EXCEPTION 'Historic document URLs or labels leaked through the change log';
  END IF;
  IF (SELECT jsonb_array_length(documents) FROM public.artworks_full_admin WHERE id = work) <> 3 THEN
    RAISE EXCEPTION 'Artwork aggregate bypassed document visibility';
  END IF;
  IF (SELECT jsonb_array_length(documents) FROM public.viewer_artworks_full_secure WHERE id = work) <> 3 THEN
    RAISE EXCEPTION 'Viewer artwork aggregate bypassed document visibility';
  END IF;
  UPDATE public.documents SET visibility = 'all_clients', recipient_contact_id = NULL
    WHERE id = (SELECT id FROM document_test_ids WHERE name = 'for_a');
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Viewer changed document visibility'; END IF;
  DELETE FROM public.documents WHERE id = (SELECT id FROM document_test_ids WHERE name = 'shared');
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Viewer deleted a document'; END IF;
  BEGIN
    INSERT INTO public.documents (artwork_id, document_type, url)
    VALUES (work, 'link', 'https://example.invalid/forged');
    RAISE EXCEPTION 'Viewer created a document';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM document_test_ids WHERE name = 'viewer_b'), true);
DO $$
DECLARE work uuid := (SELECT id FROM document_test_ids WHERE name = 'work');
BEGIN
  IF (SELECT count(*) FROM public.documents WHERE artwork_id = work) <> 3 THEN
    RAISE EXCEPTION 'Viewer B must see only shared documents and client B documents';
  END IF;
  IF EXISTS (SELECT 1 FROM public.documents WHERE id = (SELECT id FROM document_test_ids WHERE name = 'for_a')) THEN
    RAISE EXCEPTION 'Direct ID lookup bypassed client restriction';
  END IF;
  IF EXISTS (SELECT 1 FROM public.artworks_full_admin WHERE id = work AND rapport_heritier_document IS NOT NULL) THEN
    RAISE EXCEPTION 'Restricted condition report leaked through the special artwork join';
  END IF;
END;
$$;

DO $$
DECLARE member text;
  expected integer;
  work uuid := (SELECT id FROM document_test_ids WHERE name = 'work');
BEGIN
  FOR member, expected IN SELECT * FROM (VALUES
    ('peer_a', 3), ('multi', 4), ('revoked', 0), ('inactive', 0), ('editor', 5), ('admin', 5)
  ) v(member, expected)
  LOOP
    PERFORM set_config('request.jwt.claim.sub', (SELECT id::text FROM document_test_ids WHERE name = member), true);
    IF (SELECT count(*) FROM public.documents WHERE artwork_id = work) <> expected THEN
      RAISE EXCEPTION 'Unexpected document access for %', member;
    END IF;
  END LOOP;
END;
$$;

SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM document_test_ids WHERE name = 'editor'), true);
DO $$
DECLARE work uuid := (SELECT id FROM document_test_ids WHERE name = 'work');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.documents WHERE artwork_id = work AND visibility = 'all_clients'
    AND recipient_contact_id IS NULL AND label = 'shared') THEN
    RAISE EXCEPTION 'Default visibility must be all_clients';
  END IF;
  BEGIN
    UPDATE public.documents SET recipient_contact_id = (SELECT id FROM document_test_ids WHERE name = 'client_c')
    WHERE id = (SELECT id FROM document_test_ids WHERE name = 'for_a');
    RAISE EXCEPTION 'Unrelated client accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Document recipient must be a proposed client or the artwork buyer' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.documents SET recipient_contact_id = (SELECT id FROM document_test_ids WHERE name = 'client_a')
    WHERE id = (SELECT id FROM document_test_ids WHERE name = 'shared');
    RAISE EXCEPTION 'Shared document accepted a recipient';
  EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE public.documents SET visibility = 'internal'
    WHERE id = (SELECT id FROM document_test_ids WHERE name = 'shared');
  UPDATE public.documents SET visibility = 'all_clients', recipient_contact_id = NULL
    WHERE id = (SELECT id FROM document_test_ids WHERE name = 'for_a');
  UPDATE public.documents SET visibility = 'selected_client',
    recipient_contact_id = (SELECT id FROM document_test_ids WHERE name = 'client_b')
    WHERE id = (SELECT id FROM document_test_ids WHERE name = 'for_a');
  UPDATE public.artworks SET buyer_contact_id = (SELECT id FROM document_test_ids WHERE name = 'client_c') WHERE id = work;
  UPDATE public.documents SET recipient_contact_id = (SELECT id FROM document_test_ids WHERE name = 'client_c')
    WHERE id = (SELECT id FROM document_test_ids WHERE name = 'for_a');
  IF NOT EXISTS (SELECT 1 FROM public.artworks_change_log WHERE artwork_id = work AND operation LIKE 'DOCUMENT%') THEN
    RAISE EXCEPTION 'Staff must retain full document history';
  END IF;
END;
$$;

-- Removing a proposal revokes client-specific access without widening visibility.
RESET ROLE;
DELETE FROM public.artwork_proposals WHERE artwork_id = (SELECT id FROM document_test_ids WHERE name = 'work')
  AND contact_id = (SELECT id FROM document_test_ids WHERE name = 'client_b');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM document_test_ids WHERE name = 'multi'), true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.documents WHERE id = (SELECT id FROM document_test_ids WHERE name = 'for_b')) THEN
    RAISE EXCEPTION 'Client B document remained visible after proposal removal through client A membership';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
