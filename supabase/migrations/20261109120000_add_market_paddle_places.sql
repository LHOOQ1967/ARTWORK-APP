ALTER TABLE public.market_section_items
  ADD COLUMN paddle_places text;

ALTER TABLE public.market_section_items
  ADD CONSTRAINT market_section_items_paddle_places_check
  CHECK (
    paddle_places IS NULL
    OR paddle_places = ANY (ARRAY['No'::text, 'Yes 1'::text, 'Yes 2'::text])
  );

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
  msi.paddle_places
FROM public.market_section_items msi
LEFT JOIN LATERAL (
  SELECT d1.id, d1.url, d1.document_type
  FROM public.documents d1
  WHERE d1.market_section_item_id = msi.id
  ORDER BY d1."position", d1.created_at
  LIMIT 1
) d ON true;
