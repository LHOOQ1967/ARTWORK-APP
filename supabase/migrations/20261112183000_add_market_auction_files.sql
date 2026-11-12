ALTER TABLE public.market_section_items
  ADD CONSTRAINT market_section_items_id_section_unique UNIQUE (id, section_id);

CREATE TABLE public.market_auction_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.market_sections(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('catalogue', 'result')),
  file_name text NOT NULL,
  sharepoint_drive_id text NOT NULL,
  sharepoint_item_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, section_id, kind)
);

CREATE TABLE public.market_auction_file_links (
  item_id uuid NOT NULL,
  section_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('catalogue', 'result')),
  file_id uuid NOT NULL,
  PRIMARY KEY (item_id, kind),
  FOREIGN KEY (item_id, section_id) REFERENCES public.market_section_items(id, section_id) ON DELETE RESTRICT,
  FOREIGN KEY (file_id, section_id, kind) REFERENCES public.market_auction_files(id, section_id, kind) ON DELETE CASCADE
);

CREATE UNIQUE INDEX market_auction_result_single_sale
  ON public.market_auction_file_links (file_id) WHERE kind = 'result';

CREATE FUNCTION public.validate_market_auction_file_section()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.market_sections
    WHERE id = NEW.section_id AND category = 'Ventes aux enchères'
  ) THEN
    RAISE EXCEPTION 'Auction files require an auction section';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_market_auction_file_section
  BEFORE INSERT OR UPDATE OF section_id ON public.market_auction_files
  FOR EACH ROW EXECUTE FUNCTION public.validate_market_auction_file_section();

CREATE FUNCTION public.prevent_market_auction_file_section_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.category <> 'Ventes aux enchères' AND EXISTS (
    SELECT 1 FROM public.market_auction_files WHERE section_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Remove auction files before changing the section category';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_market_auction_file_section_change
  BEFORE UPDATE OF category ON public.market_sections
  FOR EACH ROW EXECUTE FUNCTION public.prevent_market_auction_file_section_change();

ALTER TABLE public.market_auction_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_auction_file_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY market_auction_files_select ON public.market_auction_files
  FOR SELECT TO authenticated USING (true);
CREATE POLICY market_auction_files_write ON public.market_auction_files
  FOR ALL TO authenticated USING (security.is_admin_or_editor()) WITH CHECK (security.is_admin_or_editor());
CREATE POLICY market_auction_file_links_select ON public.market_auction_file_links
  FOR SELECT TO authenticated USING (true);
CREATE POLICY market_auction_file_links_write ON public.market_auction_file_links
  FOR ALL TO authenticated USING (security.is_admin_or_editor()) WITH CHECK (security.is_admin_or_editor());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_auction_files, public.market_auction_file_links TO authenticated;
GRANT ALL ON public.market_auction_files, public.market_auction_file_links TO service_role;
