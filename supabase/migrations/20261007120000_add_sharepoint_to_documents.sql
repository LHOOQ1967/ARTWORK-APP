ALTER TABLE public.documents
  ADD COLUMN storage_provider    text NOT NULL DEFAULT 'legacy',
  ADD COLUMN legacy_url          text,
  ADD COLUMN sharepoint_drive_id text,
  ADD COLUMN sharepoint_item_id  text,
  ADD COLUMN sharepoint_web_url  text,
  ADD COLUMN file_name           text,
  ADD COLUMN mime_type           text,
  ADD COLUMN size_bytes          bigint;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_storage_provider_check CHECK (storage_provider IN ('legacy', 'sharepoint'));

ALTER TABLE public.documents
  ADD CONSTRAINT documents_sharepoint_ids_check CHECK (
    storage_provider <> 'sharepoint'
    OR (sharepoint_drive_id IS NOT NULL AND sharepoint_item_id IS NOT NULL)
  );

-- Preserve existing external links (images stay in Supabase Storage and are not tracked here).
UPDATE public.documents
SET legacy_url = url
WHERE document_type <> 'image';

CREATE INDEX idx_documents_storage_provider ON public.documents (storage_provider);
