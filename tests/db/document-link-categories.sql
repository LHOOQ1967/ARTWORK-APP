BEGIN;

CREATE TEMP TABLE category_test_ids (name text PRIMARY KEY, id uuid DEFAULT gen_random_uuid());
INSERT INTO category_test_ids (name) VALUES ('work'), ('document'), ('gallery'), ('client');
INSERT INTO public.contacts (id, company_name)
SELECT id, 'Rollback-only category client' FROM category_test_ids WHERE name = 'client';
INSERT INTO public.artworks (id, title)
SELECT id, 'Rollback-only category work' FROM category_test_ids WHERE name = 'work';
INSERT INTO public.artwork_proposals (artwork_id, contact_id)
SELECT w.id, c.id FROM category_test_ids w CROSS JOIN category_test_ids c
WHERE w.name = 'work' AND c.name = 'client';
INSERT INTO public.documents (id, artwork_id, document_type, label, url, visibility, recipient_contact_id)
SELECT d.id, w.id, 'link', 'Catalogue scan.jpg', 'https://example.invalid/scan', 'selected_client', c.id
FROM category_test_ids d CROSS JOIN category_test_ids w CROSS JOIN category_test_ids c
WHERE d.name = 'document' AND w.name = 'work' AND c.name = 'client';
INSERT INTO public.documents (id, artwork_id, document_type, label, url)
SELECT d.id, w.id, 'image', 'Gallery', 'https://example.invalid/gallery'
FROM category_test_ids d CROSS JOIN category_test_ids w WHERE d.name = 'gallery' AND w.name = 'work';

DO $$
DECLARE doc uuid := (SELECT id FROM category_test_ids WHERE name = 'document');
  category text;
BEGIN
  IF (SELECT link_category FROM public.documents WHERE id = doc) <> 'general' THEN
    RAISE EXCEPTION 'New links must default to General';
  END IF;
  FOREACH category IN ARRAY ARRAY['images', 'exhibitions_literature', 'general']
  LOOP
    UPDATE public.documents SET link_category = category WHERE id = doc;
    IF NOT EXISTS (SELECT 1 FROM public.documents WHERE id = doc AND link_category = category
      AND visibility = 'selected_client'
      AND recipient_contact_id = (SELECT id FROM category_test_ids WHERE name = 'client')) THEN
      RAISE EXCEPTION 'Changing category changed document permissions';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.viewer_documents WHERE id = doc AND link_category = category) THEN
      RAISE EXCEPTION 'Viewer projection omitted category';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.artworks_full_admin a, jsonb_array_elements(a.documents) d
      WHERE a.id = (SELECT id FROM category_test_ids WHERE name = 'work')
        AND d->>'id' = doc::text AND d->>'link_category' = category
    ) THEN RAISE EXCEPTION 'Artwork aggregate omitted category'; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.documents
    WHERE id = (SELECT id FROM category_test_ids WHERE name = 'gallery')
      AND document_type = 'image' AND link_category = 'general') THEN
    RAISE EXCEPTION 'Link categories changed the main image gallery';
  END IF;
  BEGIN
    UPDATE public.documents SET link_category = 'invalid' WHERE id = doc;
    RAISE EXCEPTION 'Invalid category was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END;
$$;

ROLLBACK;
