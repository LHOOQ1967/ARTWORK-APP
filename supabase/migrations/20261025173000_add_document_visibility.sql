ALTER TABLE public.documents
  ADD COLUMN visibility text NOT NULL DEFAULT 'all_clients',
  ADD COLUMN recipient_contact_id uuid REFERENCES public.contacts(id) ON DELETE RESTRICT,
  ADD CONSTRAINT documents_visibility_check
    CHECK (visibility IN ('all_clients', 'internal', 'selected_client')),
  ADD CONSTRAINT documents_recipient_check CHECK (
    (visibility = 'selected_client' AND recipient_contact_id IS NOT NULL AND artwork_id IS NOT NULL)
    OR (visibility IN ('all_clients', 'internal') AND recipient_contact_id IS NULL)
  ),
  ADD CONSTRAINT documents_market_visibility_check
    CHECK (market_section_item_id IS NULL OR visibility = 'all_clients');

COMMENT ON COLUMN public.documents.visibility IS
  'all_clients (default, including existing documents), internal, or selected_client. Artwork access is still required.';
CREATE INDEX idx_documents_recipient ON public.documents (recipient_contact_id, artwork_id)
  WHERE recipient_contact_id IS NOT NULL;

CREATE FUNCTION security.can_access_artwork_document(
  p_artwork_id uuid, p_visibility text, p_recipient_contact_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE p_visibility
    WHEN 'selected_client' THEN
      security.can_access_artwork_comment_client(p_artwork_id, p_recipient_contact_id)
    WHEN 'all_clients' THEN EXISTS (
      SELECT 1 FROM public.contact_users cu
      WHERE cu.user_id = auth.uid() AND cu.invited
        AND security.can_access_artwork_comment_client(p_artwork_id, cu.contact_id)
    )
    ELSE false
  END;
$$;
REVOKE ALL ON FUNCTION security.can_access_artwork_document(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION security.can_access_artwork_document(uuid, text, uuid) TO authenticated;

-- Replace permissive legacy policies so no older policy bypasses visibility.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'documents'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.documents', p.policyname);
  END LOOP;
END;
$$;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.documents FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;

CREATE POLICY documents_select ON public.documents FOR SELECT TO authenticated
  USING (security.is_admin_or_editor()
    OR (market_section_item_id IS NOT NULL AND visibility = 'all_clients')
    OR security.can_access_artwork_document(artwork_id, visibility, recipient_contact_id));
CREATE POLICY documents_insert ON public.documents FOR INSERT TO authenticated
  WITH CHECK (security.is_admin_or_editor());
CREATE POLICY documents_update ON public.documents FOR UPDATE TO authenticated
  USING (security.is_admin_or_editor()) WITH CHECK (security.is_admin_or_editor());
CREATE POLICY documents_delete ON public.documents FOR DELETE TO authenticated
  USING (security.is_admin_or_editor());

CREATE FUNCTION public.validate_artwork_document_recipient()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.artwork_id IS NOT DISTINCT FROM NEW.artwork_id
      AND OLD.visibility IS NOT DISTINCT FROM NEW.visibility
      AND OLD.recipient_contact_id IS NOT DISTINCT FROM NEW.recipient_contact_id THEN
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.visibility = 'selected_client' AND NOT (
    EXISTS (SELECT 1 FROM public.artwork_proposals
      WHERE artwork_id = NEW.artwork_id AND contact_id = NEW.recipient_contact_id)
    OR EXISTS (SELECT 1 FROM public.artworks
      WHERE id = NEW.artwork_id AND buyer_contact_id = NEW.recipient_contact_id)
  ) THEN
    RAISE EXCEPTION 'Document recipient must be a proposed client or the artwork buyer';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_artwork_document_recipient() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_validate_artwork_document_recipient
  BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.validate_artwork_document_recipient();

-- Existing artwork aggregate views are security-invoker views; their document
-- joins and the special condition-report join must continue to apply RLS.
ALTER VIEW public.artworks_full_admin SET (security_invoker = true);
ALTER VIEW public.viewer_artworks_full_secure SET (security_invoker = true);
ALTER VIEW public.viewer_documents SET (security_invoker = true);

-- Historic document diffs contain labels and direct URLs, including values
-- recorded before a document becomes restricted or is deleted.
CREATE POLICY artwork_document_history_staff_only ON public.artworks_change_log
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (security.is_admin_or_editor() OR operation NOT IN (
    'DOCUMENT_INSERT', 'DOCUMENT_UPDATE', 'DOCUMENT_DELETE'
  ));
