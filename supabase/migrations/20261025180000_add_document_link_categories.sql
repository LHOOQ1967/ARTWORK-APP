ALTER TABLE public.documents
  ADD COLUMN link_category text NOT NULL DEFAULT 'general',
  ADD CONSTRAINT documents_link_category_check
    CHECK (link_category IN ('general', 'images', 'exhibitions_literature'));

COMMENT ON COLUMN public.documents.link_category IS
  'Logical link group, independent of visibility and file format. Gallery images retain document_type=image.';

-- Append the category to the viewer projection without changing existing columns.
CREATE OR REPLACE VIEW public.viewer_documents
  WITH (security_barrier = true, security_invoker = true) AS
SELECT d.id, d.artwork_id, d.document_type, d.label, d.url, d.created_at,
  d.position, d.link_category
FROM public.documents d
JOIN public.artworks a ON a.id = d.artwork_id;
