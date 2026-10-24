ALTER TABLE public.artwork_viewer_comments
  ADD COLUMN recipient_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;
CREATE INDEX idx_artwork_comments_recipient
  ON public.artwork_viewer_comments (recipient_contact_id, artwork_id);
COMMENT ON COLUMN public.artwork_viewer_comments.recipient_contact_id IS
  'Client conversation. NULL is internal to Editors and Administrators.';
REVOKE ALL ON public.artwork_viewer_comments FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artwork_viewer_comments TO authenticated;

-- Attribute only unambiguous, invited client memberships of current Viewer authors.
UPDATE public.artwork_viewer_comments c
SET recipient_contact_id = membership.contact_id
FROM (
  SELECT cu.user_id, (array_agg(DISTINCT cu.contact_id))[1] AS contact_id
  FROM public.contact_users cu
  JOIN public.profiles p ON p.id = cu.user_id AND p.role = 'Viewer'
  WHERE cu.invited = true
  GROUP BY cu.user_id HAVING count(DISTINCT cu.contact_id) = 1
) membership
WHERE c.user_id = membership.user_id;

CREATE FUNCTION security.can_access_artwork_comment_client(p_artwork_id uuid, p_contact_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_contact_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'Viewer' AND p.is_active
    )
    AND EXISTS (
      SELECT 1 FROM public.contact_users cu
      WHERE cu.user_id = auth.uid() AND cu.contact_id = p_contact_id AND cu.invited
    )
    AND (
      EXISTS (SELECT 1 FROM public.artwork_proposals ap
        WHERE ap.artwork_id = p_artwork_id AND ap.contact_id = p_contact_id)
      OR EXISTS (SELECT 1 FROM public.artworks a
        WHERE a.id = p_artwork_id AND a.buyer_contact_id = p_contact_id)
    )
    AND security.can_view_artwork(p_artwork_id);
$$;
REVOKE ALL ON FUNCTION security.can_access_artwork_comment_client(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION security.can_access_artwork_comment_client(uuid, uuid) TO authenticated;

-- Replace every existing policy: permissive legacy policies must not bypass client scoping.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'artwork_viewer_comments'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.artwork_viewer_comments', p.policyname);
  END LOOP;
END;
$$;

CREATE POLICY artwork_comments_select ON public.artwork_viewer_comments
  FOR SELECT TO authenticated
  USING (security.is_admin_or_editor()
    OR security.can_access_artwork_comment_client(artwork_id, recipient_contact_id));
CREATE POLICY artwork_comments_insert ON public.artwork_viewer_comments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (security.is_admin_or_editor()
    OR security.can_access_artwork_comment_client(artwork_id, recipient_contact_id)));
CREATE POLICY artwork_comments_update ON public.artwork_viewer_comments
  FOR UPDATE TO authenticated
  USING (security.is_admin_or_editor() OR (user_id = auth.uid()
    AND security.can_access_artwork_comment_client(artwork_id, recipient_contact_id)))
  WITH CHECK (security.is_admin_or_editor() OR (user_id = auth.uid()
    AND security.can_access_artwork_comment_client(artwork_id, recipient_contact_id)));
CREATE POLICY artwork_comments_delete ON public.artwork_viewer_comments
  FOR DELETE TO authenticated
  USING (security.is_admin_or_editor() OR (user_id = auth.uid()
    AND security.can_access_artwork_comment_client(artwork_id, recipient_contact_id)));

CREATE FUNCTION public.validate_artwork_comment_recipient()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.id IS DISTINCT FROM NEW.id OR OLD.created_at IS DISTINCT FROM NEW.created_at
      OR OLD.artwork_id IS DISTINCT FROM NEW.artwork_id OR OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'Comment artwork and author cannot be changed';
    END IF;
    IF OLD.recipient_contact_id IS NOT DISTINCT FROM NEW.recipient_contact_id THEN RETURN NEW; END IF;
  END IF;
  IF NEW.recipient_contact_id IS NOT NULL AND NOT (
    EXISTS (SELECT 1 FROM public.artwork_proposals
      WHERE artwork_id = NEW.artwork_id AND contact_id = NEW.recipient_contact_id)
    OR EXISTS (SELECT 1 FROM public.artworks
      WHERE id = NEW.artwork_id AND buyer_contact_id = NEW.recipient_contact_id)
  ) THEN
    RAISE EXCEPTION 'Comment recipient must be a proposed client or the artwork buyer';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_artwork_comment_recipient() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_validate_artwork_comment_recipient
  BEFORE INSERT OR UPDATE ON public.artwork_viewer_comments
  FOR EACH ROW EXECUTE FUNCTION public.validate_artwork_comment_recipient();

CREATE FUNCTION public.artwork_comment_clients(p_artwork_id uuid)
RETURNS TABLE (id uuid, label text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT c.id, coalesce(nullif(btrim(c.company_name), ''),
    nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), ''), 'Unnamed client')
  FROM public.contacts c
  WHERE (
    EXISTS (SELECT 1 FROM public.artwork_proposals ap
      WHERE ap.artwork_id = p_artwork_id AND ap.contact_id = c.id)
    OR EXISTS (SELECT 1 FROM public.artworks a
      WHERE a.id = p_artwork_id AND a.buyer_contact_id = c.id)
  ) AND (security.is_admin_or_editor()
    OR security.can_access_artwork_comment_client(p_artwork_id, c.id))
  ORDER BY 2, 1;
$$;
REVOKE ALL ON FUNCTION public.artwork_comment_clients(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artwork_comment_clients(uuid) TO authenticated;
