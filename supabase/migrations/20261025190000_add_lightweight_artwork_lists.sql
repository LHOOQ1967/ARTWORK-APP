-- Keep the existing role-specific artwork access rules, but omit detail-only
-- aggregates and return only the first accessible gallery image.
DO $$
DECLARE
  source_name text;
  list_name text;
BEGIN
  FOR source_name, list_name IN SELECT * FROM (VALUES
    ('artworks_full_admin', 'artworks_list_admin'),
    ('viewer_artworks_full_secure', 'viewer_artworks_list_secure')
  ) AS sources(source_name, list_name)
  LOOP
    EXECUTE format(
      'CREATE VIEW public.%I WITH (security_invoker = true) AS
       SELECT a.id, a.artist_id, a.proposed_by_id, a.title, a.medium,
         a.year_execution, a.year_execution_start,
         a.status, a.quality, a.priority, a.auctions,
         a.date_proposition, a.sale_date, a.sale_time, a.date_acquisition,
         a.asking_price, a.currency, a.estimate_low, a.estimate_high,
         a.auction_currency, a.sold_premium, a.cost_amount, a.cost_currency,
         a.artist, a.proposed_by_name, a.location, a.location_of_work,
         CASE WHEN image.id IS NULL THEN ''[]''::jsonb ELSE
           jsonb_build_array(jsonb_build_object(
             ''id'', image.id, ''document_type'', ''image'',
             ''url'', image.url, ''position'', image.position
           ))
         END AS images
       FROM public.%I a
       LEFT JOIN LATERAL (
         SELECT d.id, d.url, d.position
         FROM public.documents d
         WHERE d.artwork_id = a.id AND d.document_type = ''image''
         ORDER BY COALESCE(d.position, 9999), d.id
         LIMIT 1
       ) image ON true',
      list_name, source_name
    );
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', list_name);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated, service_role', list_name);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
