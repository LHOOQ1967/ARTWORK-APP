BEGIN;
DO $$
DECLARE
  work_id uuid := gen_random_uuid();
  doc_id uuid := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'artwork-thumbnails' AND public = false) THEN
    RAISE EXCEPTION 'Thumbnail bucket must be private';
  END IF;
  IF has_table_privilege('authenticated', 'public.artwork_thumbnail_cleanup', 'SELECT')
    OR has_table_privilege('anon', 'public.artwork_thumbnail_cleanup', 'INSERT') THEN
    RAISE EXCEPTION 'Cleanup queue must be service-only';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'artwork_thumbnails_server_only' AND permissive = 'RESTRICTIVE') THEN
    RAISE EXCEPTION 'Missing restrictive thumbnail policy';
  END IF;
  INSERT INTO public.artworks(id, title, status) VALUES (work_id, 'Thumbnail test', 'Viewed');
  INSERT INTO public.documents(id, artwork_id, document_type, url)
    VALUES (doc_id, work_id, 'image', 'https://test.invalid/old.jpg');
  UPDATE public.documents SET visibility = 'internal' WHERE id = doc_id;
  IF EXISTS (SELECT 1 FROM public.artwork_thumbnail_cleanup WHERE document_id = doc_id) THEN
    RAISE EXCEPTION 'Visibility changes must not remove shared stored bytes';
  END IF;
  UPDATE public.documents SET url = 'https://test.invalid/new.jpg' WHERE id = doc_id;
  IF NOT EXISTS (SELECT 1 FROM public.artwork_thumbnail_cleanup WHERE document_id = doc_id AND source_url = 'https://test.invalid/old.jpg') THEN
    RAISE EXCEPTION 'URL replacement must enqueue old source';
  END IF;
  DELETE FROM public.artworks WHERE id = work_id;
  IF NOT EXISTS (SELECT 1 FROM public.artwork_thumbnail_cleanup WHERE document_id = doc_id AND source_url = 'https://test.invalid/new.jpg') THEN
    RAISE EXCEPTION 'Artwork cascade must enqueue removed source';
  END IF;
END;
$$;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'artwork-thumbnails') THEN
    RAISE EXCEPTION 'Authenticated users must not read thumbnail bucket directly';
  END IF;
END;
$$;
RESET ROLE;
ROLLBACK;
