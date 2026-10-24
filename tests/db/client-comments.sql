BEGIN;

CREATE TEMP TABLE comment_test_ids (name text PRIMARY KEY, id uuid NOT NULL DEFAULT gen_random_uuid());
INSERT INTO comment_test_ids (name) VALUES
  ('viewer_a'), ('peer_a'), ('viewer_b'), ('multi'), ('revoked'), ('editor'), ('admin'),
  ('client_a'), ('client_b'), ('client_c'), ('work'), ('other_work'),
  ('comment_a'), ('comment_peer'), ('comment_b'), ('comment_reply'), ('comment_internal');
GRANT SELECT ON comment_test_ids TO authenticated;

INSERT INTO auth.users (id, email)
SELECT id, name || '-' || id || '@comment-test.invalid' FROM comment_test_ids
WHERE name IN ('viewer_a', 'peer_a', 'viewer_b', 'multi', 'revoked', 'editor', 'admin');
UPDATE public.profiles SET role = CASE
  WHEN id = (SELECT id FROM comment_test_ids WHERE name = 'editor') THEN 'Editor'
  WHEN id = (SELECT id FROM comment_test_ids WHERE name = 'admin') THEN 'Administrator'
  ELSE 'Viewer' END
WHERE id IN (SELECT id FROM comment_test_ids WHERE name IN ('viewer_a', 'peer_a', 'viewer_b', 'multi', 'revoked', 'editor', 'admin'));
INSERT INTO public.contacts (id, company_name)
SELECT id, name FROM comment_test_ids WHERE name IN ('client_a', 'client_b', 'client_c');
INSERT INTO public.artworks (id, title)
SELECT id, 'Rollback-only comment test' FROM comment_test_ids WHERE name IN ('work', 'other_work');
INSERT INTO public.artwork_proposals (artwork_id, contact_id)
SELECT w.id, c.id FROM comment_test_ids w CROSS JOIN comment_test_ids c
WHERE w.name = 'work' AND c.name IN ('client_a', 'client_b');
INSERT INTO public.artwork_proposals (artwork_id, contact_id)
SELECT w.id, c.id FROM comment_test_ids w CROSS JOIN comment_test_ids c
WHERE w.name = 'other_work' AND c.name = 'client_c';
INSERT INTO public.contact_users (contact_id, user_id, invited)
SELECT c.id, u.id, u.name <> 'revoked'
FROM comment_test_ids c CROSS JOIN comment_test_ids u
WHERE (c.name = 'client_a' AND u.name IN ('viewer_a', 'peer_a', 'multi', 'revoked'))
   OR (c.name = 'client_b' AND u.name IN ('viewer_b', 'multi'));
INSERT INTO public.artwork_viewer_comments (id, artwork_id, user_id, recipient_contact_id, comment)
SELECT ci.id, w.id, u.id, c.id, ci.name
FROM (VALUES
  ('comment_a', 'viewer_a', 'client_a'),
  ('comment_peer', 'peer_a', 'client_a'),
  ('comment_b', 'viewer_b', 'client_b'),
  ('comment_reply', 'editor', 'client_a'),
  ('comment_internal', 'editor', NULL)
) v(comment_name, author_name, client_name)
JOIN comment_test_ids ci ON ci.name = v.comment_name
JOIN comment_test_ids w ON w.name = 'work'
JOIN comment_test_ids u ON u.name = v.author_name
LEFT JOIN comment_test_ids c ON c.name = v.client_name;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM comment_test_ids WHERE name = 'viewer_a'), true);
DO $$
DECLARE work uuid := (SELECT id FROM comment_test_ids WHERE name = 'work');
  affected integer;
BEGIN
  IF (SELECT count(*) FROM public.artwork_viewer_comments WHERE artwork_id = work) <> 3 THEN
    RAISE EXCEPTION 'Viewer A must see its own, peer and addressed staff comments only';
  END IF;
  IF EXISTS (SELECT 1 FROM public.artwork_viewer_comments WHERE artwork_id = work
    AND (recipient_contact_id IS NULL OR recipient_contact_id = (SELECT id FROM comment_test_ids WHERE name = 'client_b'))) THEN
    RAISE EXCEPTION 'Cross-client or internal comment leaked';
  END IF;
  IF (SELECT count(*) FROM public.artwork_viewer_comments WHERE artwork_id = work AND user_id <> auth.uid()) <> 2 THEN
    RAISE EXCEPTION 'Notification query must exclude other clients and internal comments';
  END IF;
  IF (SELECT count(*) FROM public.artwork_comment_clients(work)) <> 1 THEN
    RAISE EXCEPTION 'Viewer recipient options leaked another client';
  END IF;
  INSERT INTO public.artwork_viewer_comments (artwork_id, user_id, recipient_contact_id, comment)
  SELECT work, auth.uid(), id, 'New comment A' FROM comment_test_ids WHERE name = 'client_a';
  UPDATE public.artwork_viewer_comments SET comment = 'Updated A'
    WHERE id = (SELECT id FROM comment_test_ids WHERE name = 'comment_a');
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Viewer must be able to edit own comment'; END IF;
  UPDATE public.artwork_viewer_comments SET comment = 'Must not change peer'
    WHERE id = (SELECT id FROM comment_test_ids WHERE name = 'comment_peer');
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Viewer modified peer comment'; END IF;
  DELETE FROM public.artwork_viewer_comments WHERE id = (SELECT id FROM comment_test_ids WHERE name = 'comment_b');
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Viewer deleted another client comment'; END IF;
  BEGIN
    INSERT INTO public.artwork_viewer_comments (artwork_id, user_id, recipient_contact_id, comment)
    SELECT work, auth.uid(), id, 'Must fail' FROM comment_test_ids WHERE name = 'client_b';
    RAISE EXCEPTION 'Viewer posted to another client';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.artwork_viewer_comments (artwork_id, user_id, comment)
    VALUES (work, auth.uid(), 'Internal must fail');
    RAISE EXCEPTION 'Viewer posted an internal comment';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.artwork_viewer_comments
    SET recipient_contact_id = (SELECT id FROM comment_test_ids WHERE name = 'client_b')
    WHERE id = (SELECT id FROM comment_test_ids WHERE name = 'comment_a');
    RAISE EXCEPTION 'Viewer retargeted a comment to another client';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.artwork_viewer_comments
    SET user_id = (SELECT id FROM comment_test_ids WHERE name = 'peer_a')
    WHERE id = (SELECT id FROM comment_test_ids WHERE name = 'comment_a');
    RAISE EXCEPTION 'Viewer forged author';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Comment artwork and author cannot be changed' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.artwork_viewer_comments
    SET artwork_id = (SELECT id FROM comment_test_ids WHERE name = 'other_work')
    WHERE id = (SELECT id FROM comment_test_ids WHERE name = 'comment_a');
    RAISE EXCEPTION 'Viewer moved comment to another artwork';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Comment artwork and author cannot be changed' THEN RAISE; END IF;
  END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM comment_test_ids WHERE name = 'viewer_b'), true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.artwork_viewer_comments
    WHERE artwork_id = (SELECT id FROM comment_test_ids WHERE name = 'work')) <> 1 THEN
    RAISE EXCEPTION 'Viewer B saw client A comments';
  END IF;
END;
$$;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM comment_test_ids WHERE name = 'revoked'), true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.artwork_viewer_comments WHERE artwork_id = (SELECT id FROM comment_test_ids WHERE name = 'work')) THEN
    RAISE EXCEPTION 'Revoked member saw comments';
  END IF;
END;
$$;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM comment_test_ids WHERE name = 'multi'), true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.artwork_viewer_comments
    WHERE artwork_id = (SELECT id FROM comment_test_ids WHERE name = 'work')) <> 5 THEN
    RAISE EXCEPTION 'Multi-client Viewer must see both associated clients but no internal comments';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM comment_test_ids WHERE name = 'editor'), true);
DO $$
DECLARE work uuid := (SELECT id FROM comment_test_ids WHERE name = 'work');
BEGIN
  IF (SELECT count(*) FROM public.artwork_viewer_comments WHERE artwork_id = work) <> 6 THEN
    RAISE EXCEPTION 'Editor must see all comments, even without a client membership';
  END IF;
  IF (SELECT count(*) FROM public.artwork_comment_clients(work)) <> 2 THEN
    RAISE EXCEPTION 'Editor must see both recipient options';
  END IF;
  UPDATE public.artwork_viewer_comments
    SET recipient_contact_id = (SELECT id FROM comment_test_ids WHERE name = 'client_b')
    WHERE id = (SELECT id FROM comment_test_ids WHERE name = 'comment_internal');
  BEGIN
    INSERT INTO public.artwork_viewer_comments (artwork_id, user_id, recipient_contact_id, comment)
    SELECT work, auth.uid(), id, 'Must fail for unrelated client' FROM comment_test_ids WHERE name = 'client_c';
    RAISE EXCEPTION 'Unrelated client was accepted as recipient';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Comment recipient must be a proposed client or the artwork buyer' THEN RAISE; END IF;
  END;
END;
$$;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM comment_test_ids WHERE name = 'admin'), true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.artwork_viewer_comments
    WHERE artwork_id = (SELECT id FROM comment_test_ids WHERE name = 'work')) <> 6 THEN
    RAISE EXCEPTION 'Administrator must see all comments';
  END IF;
END;
$$;
RESET ROLE;
UPDATE public.profiles SET is_active = false WHERE id = (SELECT id FROM comment_test_ids WHERE name = 'viewer_a');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM comment_test_ids WHERE name = 'viewer_a'), true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.artwork_viewer_comments WHERE artwork_id = (SELECT id FROM comment_test_ids WHERE name = 'work')) THEN
    RAISE EXCEPTION 'Inactive Viewer saw comments';
  END IF;
END;
$$;
RESET ROLE;
-- A user with access via client B must not keep seeing client A's conversation
-- after client A's proposal is removed.
DELETE FROM public.artwork_proposals
WHERE artwork_id = (SELECT id FROM comment_test_ids WHERE name = 'work')
  AND contact_id = (SELECT id FROM comment_test_ids WHERE name = 'client_a');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM comment_test_ids WHERE name = 'multi'), true);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.artwork_viewer_comments
    WHERE artwork_id = (SELECT id FROM comment_test_ids WHERE name = 'work')
      AND recipient_contact_id = (SELECT id FROM comment_test_ids WHERE name = 'client_a')
  ) THEN
    RAISE EXCEPTION 'Artwork access via B must not expose a removed client A conversation';
  END IF;
END;
$$;
RESET ROLE;
ROLLBACK;
