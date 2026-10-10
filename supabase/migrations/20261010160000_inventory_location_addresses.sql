CREATE OR REPLACE VIEW public.v_inventory_bought WITH (security_invoker = true) AS
SELECT
  aw.id,
  d.image_url,
  aw.title,
  aw.year_execution,
  aw.date_acquisition,
  aw.buyer_contact_id,
  aw.insurance_currency,
  aw.insurance_value,
  ar.first_name,
  ar.last_name,
  c.company_name,
  aw.cost_amount,
  aw.cost_currency,
  aw.purchase_cost,
  aw.commission_blondeau,
  COALESCE(aw.cost_amount, 0) + COALESCE(aw.purchase_cost, 0)
    + COALESCE(aw.commission_blondeau, 0) AS total_foreign_currency,
  fx.rate AS fx_rate_to_eur,
  round(
    (COALESCE(aw.cost_amount, 0) + COALESCE(aw.purchase_cost, 0)
      + COALESCE(aw.commission_blondeau, 0)) * COALESCE(fx.rate, 0),
    2
  ) AS total_eur,
  c.first_name AS buyer_first_name,
  c.last_name AS buyer_last_name,
  EXISTS (
    SELECT 1 FROM public.artwork_transports t
    WHERE t.artwork_id = aw.id AND t.arrival_date IS NULL
  ) AS has_ongoing_transport,
  aw.destination_contact_id,
  COALESCE(
    NULLIF(btrim(destination.company_name), ''),
    NULLIF(concat_ws(' ', destination.first_name, destination.last_name), '')
  ) AS destination_contact_name,
  to_jsonb(destination_address) AS inventory_destination_address,
  COALESCE(
    NULLIF(btrim(location.company_name), ''),
    NULLIF(concat_ws(' ', location.first_name, location.last_name), '')
  ) AS location_contact_name,
  to_jsonb(location_address) AS inventory_location_address
FROM public.artworks aw
LEFT JOIN public.artists ar ON ar.id = aw.artist_id
LEFT JOIN public.contacts c ON c.id = aw.buyer_contact_id
LEFT JOIN (
  SELECT DISTINCT ON (artwork_id) artwork_id, url AS image_url
  FROM public.documents
  WHERE document_type = 'image'
  ORDER BY artwork_id, position
) d ON d.artwork_id = aw.id
LEFT JOIN public.fx_rates_history fx
  ON fx.rate_date = aw.date_acquisition
  AND fx.from_currency = aw.cost_currency
  AND fx.to_currency = 'EUR'
LEFT JOIN public.contacts location ON location.id = aw.location_contact_id
LEFT JOIN public.contacts destination ON destination.id = aw.destination_contact_id
LEFT JOIN public.contact_addresses location_address
  ON location_address.id = aw.location_address_id
  AND location_address.contact_id = aw.location_contact_id
LEFT JOIN public.contact_addresses destination_address
  ON destination_address.id = aw.destination_address_id
  AND destination_address.contact_id = aw.destination_contact_id
WHERE aw.status = 'Bought';
