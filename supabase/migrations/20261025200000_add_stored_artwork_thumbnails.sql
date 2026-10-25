INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('artwork-thumbnails', 'artwork-thumbnails', false, 1048576, ARRAY['image/webp']);

-- Only the server service role reads/writes this bucket. The application must
-- first authorize the source document with the caller's RLS-bound client.
CREATE POLICY artwork_thumbnails_server_only ON storage.objects
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (bucket_id <> 'artwork-thumbnails')
  WITH CHECK (bucket_id <> 'artwork-thumbnails');

CREATE TABLE public.artwork_thumbnail_cleanup (
  document_id uuid NOT NULL,
  source_url text NOT NULL,
  PRIMARY KEY (document_id, source_url),
  queued_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.artwork_thumbnail_cleanup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.artwork_thumbnail_cleanup FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.artwork_thumbnail_cleanup TO service_role;

CREATE FUNCTION public.queue_artwork_thumbnail_cleanup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.document_type = 'image' AND OLD.url IS NOT NULL AND
    (TG_OP = 'DELETE' OR OLD.url IS DISTINCT FROM NEW.url OR OLD.document_type IS DISTINCT FROM NEW.document_type) THEN
    INSERT INTO public.artwork_thumbnail_cleanup(document_id, source_url, queued_at)
      VALUES (OLD.id, OLD.url, clock_timestamp())
      ON CONFLICT (document_id, source_url) DO UPDATE SET queued_at = EXCLUDED.queued_at;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_artwork_thumbnail_cleanup() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER queue_artwork_thumbnail_cleanup
  AFTER DELETE OR UPDATE OF url, document_type ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.queue_artwork_thumbnail_cleanup();
