BEGIN;

CREATE TEMP TABLE auction_test_ids (name text PRIMARY KEY, id uuid NOT NULL DEFAULT gen_random_uuid());
INSERT INTO auction_test_ids (name) VALUES
  ('section'), ('other_section'), ('fair'), ('sale1'), ('sale2'), ('other_sale'), ('catalogue'), ('result');

INSERT INTO public.market_sections (id, title, category)
SELECT id, name, CASE WHEN name = 'fair' THEN 'Foire' ELSE 'Ventes aux enchères' END
FROM auction_test_ids WHERE name IN ('section', 'other_section', 'fair');
INSERT INTO public.market_section_items (id, section_id, item_type, label, url)
SELECT sale.id, section.id, 'web_link', sale.name, 'https://example.com'
FROM auction_test_ids sale JOIN auction_test_ids section
  ON section.name = CASE WHEN sale.name = 'other_sale' THEN 'other_section' ELSE 'section' END
WHERE sale.name IN ('sale1', 'sale2', 'other_sale');
INSERT INTO public.market_auction_files (id, section_id, kind, file_name, sharepoint_drive_id, sharepoint_item_id)
SELECT file.id, section.id, file.name, file.name || '.pdf', 'drive', file.name
FROM auction_test_ids file CROSS JOIN auction_test_ids section
WHERE file.name IN ('catalogue', 'result') AND section.name = 'section';
INSERT INTO public.market_auction_file_links (item_id, section_id, kind, file_id)
SELECT sale.id, section.id, file.name, file.id
FROM auction_test_ids sale CROSS JOIN auction_test_ids section CROSS JOIN auction_test_ids file
WHERE sale.name IN ('sale1', 'sale2') AND section.name = 'section' AND file.name = 'catalogue';
INSERT INTO public.market_auction_file_links (item_id, section_id, kind, file_id)
SELECT sale.id, section.id, file.name, file.id
FROM auction_test_ids sale CROSS JOIN auction_test_ids section CROSS JOIN auction_test_ids file
WHERE sale.name = 'sale1' AND section.name = 'section' AND file.name = 'result';

DO $$
BEGIN
  BEGIN
    INSERT INTO public.market_auction_file_links (item_id, section_id, kind, file_id)
    SELECT sale.id, section.id, 'result', file.id
    FROM auction_test_ids sale CROSS JOIN auction_test_ids section CROSS JOIN auction_test_ids file
    WHERE sale.name = 'sale2' AND section.name = 'section' AND file.name = 'result';
    RAISE EXCEPTION 'A result was linked to multiple sales';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.market_auction_file_links (item_id, section_id, kind, file_id)
    SELECT sale.id, section.id, 'catalogue', file.id
    FROM auction_test_ids sale CROSS JOIN auction_test_ids section CROSS JOIN auction_test_ids file
    WHERE sale.name = 'other_sale' AND section.name = 'other_section' AND file.name = 'catalogue';
    RAISE EXCEPTION 'A catalogue was linked across sections';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    DELETE FROM public.market_section_items WHERE id = (SELECT id FROM auction_test_ids WHERE name = 'sale1');
    RAISE EXCEPTION 'A sale with files was deleted without cleanup';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    DELETE FROM public.market_sections WHERE id = (SELECT id FROM auction_test_ids WHERE name = 'section');
    RAISE EXCEPTION 'A section with files was deleted without cleanup';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.market_sections SET category = 'Foire' WHERE id = (SELECT id FROM auction_test_ids WHERE name = 'section');
    RAISE EXCEPTION 'A section with auction files changed category';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Remove auction files before changing the section category' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.market_auction_files (section_id, kind, file_name, sharepoint_drive_id, sharepoint_item_id)
    SELECT id, 'catalogue', 'invalid.pdf', 'drive', 'item' FROM auction_test_ids WHERE name = 'fair';
    RAISE EXCEPTION 'A file was created in a non-auction section';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Auction files require an auction section' THEN RAISE; END IF;
  END;
  DELETE FROM public.market_auction_files WHERE id = (SELECT id FROM auction_test_ids WHERE name = 'catalogue');
  IF EXISTS (SELECT 1 FROM public.market_auction_file_links WHERE kind = 'catalogue') THEN
    RAISE EXCEPTION 'Deleting a shared catalogue did not remove all links';
  END IF;
END;
$$;
ROLLBACK;
