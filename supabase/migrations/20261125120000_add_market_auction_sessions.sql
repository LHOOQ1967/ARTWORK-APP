-- Auction sales can run over several sessions (times). Each time, including
-- the item's main auction_datetime, can carry a free-text lot/page note.

ALTER TABLE public.market_section_items
  ADD COLUMN lot_info text;

CREATE TABLE public.market_auction_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.market_section_items(id) ON DELETE CASCADE,
  session_datetime timestamptz NOT NULL,
  lot_info text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX market_auction_sessions_item_id_idx
  ON public.market_auction_sessions (item_id);

ALTER TABLE public.market_auction_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY market_auction_sessions_select ON public.market_auction_sessions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY market_auction_sessions_write ON public.market_auction_sessions
  FOR ALL TO authenticated USING (security.is_admin_or_editor()) WITH CHECK (security.is_admin_or_editor());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_auction_sessions TO authenticated;
GRANT ALL ON public.market_auction_sessions TO service_role;

-- Expose lot_info through the read view (appended as the last view column).
CREATE OR REPLACE VIEW public.v_market_section_items
WITH (security_invoker = true) AS
SELECT
  msi.id,
  msi.section_id,
  msi.item_type,
  msi.label,
  msi.url AS web_url,
  msi.added_at,
  msi.notes,
  msi."position",
  msi.created_at,
  msi.updated_at,
  msi.auction_house,
  msi.auction_datetime,
  d.id AS document_id,
  d.url AS document_url,
  d.document_type,
  msi.catalogue_status,
  msi.paddle_places,
  msi.auction_city,
  msi.lot_info
FROM public.market_section_items msi
LEFT JOIN LATERAL (
  SELECT d1.id, d1.url, d1.document_type
  FROM public.documents d1
  WHERE d1.market_section_item_id = msi.id
  ORDER BY d1."position", d1.created_at
  LIMIT 1
) d ON true;
