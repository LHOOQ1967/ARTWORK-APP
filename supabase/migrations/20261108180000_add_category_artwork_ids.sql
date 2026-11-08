CREATE FUNCTION public.artwork_category_ids(
  p_category text,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_tables jsonb DEFAULT '{}'::jsonb
) RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  staff boolean := security.is_admin_or_editor();
  source_name text;
  result uuid[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_category IS NULL OR p_category !~ '^(market|auction|archived|bought)(-(High|Medium|Low|Information|Other)-(others|drafts)|-(market|auction))?$' THEN
    RAISE EXCEPTION 'Invalid artwork category';
  END IF;
  IF jsonb_typeof(p_filters) IS DISTINCT FROM 'object' OR jsonb_typeof(p_tables) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid category parameters';
  END IF;
  IF COALESCE(p_filters->>'status', 'all') NOT IN ('all', 'Active', 'Bought', 'Archived') THEN
    RAISE EXCEPTION 'Invalid status filter';
  END IF;
  IF COALESCE(p_filters->>'marketType', 'all') NOT IN ('all', 'market', 'auction', 'none') THEN
    RAISE EXCEPTION 'Invalid market type filter';
  END IF;
  source_name := CASE WHEN staff THEN 'artworks_full_admin' ELSE 'viewer_artworks_full_secure' END;
  EXECUTE format($query$
    WITH base AS (
      SELECT a.id, a.artist_id, a.proposed_by_id, a.title, a.medium, a.status,
        a.priority, a.quality, a.auctions, a.date_acquisition, a.date_proposition,
        a.sale_date, a.sale_time, a.asking_price, a.estimate_low, a.estimate_high,
        a.sold_premium, a.cost_amount, a.artist, a.proposed_by_name,
        COALESCE(NULLIF(btrim(a.location->>'company_name'), ''),
          NULLIF(btrim(concat_ws(' ', a.location->>'first_name', a.location->>'last_name')), ''),
          NULLIF(btrim(a.location_of_work), ''), '') AS location_label,
        CASE WHEN a.status = 'Bought' THEN 'bought'
          WHEN a.status = 'Archived' THEN CASE WHEN a.auctions THEN 'archived-auction' ELSE 'archived-market' END
          ELSE (CASE WHEN a.auctions THEN 'auction-' ELSE 'market-' END) ||
            CASE WHEN btrim(a.priority) IN ('High', 'Medium', 'Low', 'Information')
              THEN btrim(a.priority) ELSE 'Other' END ||
            CASE WHEN a.status = 'Draft' THEN '-drafts' ELSE '-others' END
        END AS group_id
      FROM public.%I a
      WHERE (COALESCE($1->>'status', 'all') = 'all'
        OR ($1->>'status' = 'Active' AND COALESCE(a.status, '') NOT IN ('Bought', 'Archived'))
        OR a.status = $1->>'status')
        AND CASE COALESCE($1->>'marketType', 'all')
          WHEN 'market' THEN NOT COALESCE(a.auctions, false)
          WHEN 'auction' THEN COALESCE(a.auctions, false)
          WHEN 'none' THEN false ELSE true END
        AND (NULLIF($1->>'artistId', '') IS NULL OR a.artist_id = ($1->>'artistId')::uuid)
        AND (NULLIF($1->>'proposedBy', '') IS NULL OR a.proposed_by_id = ($1->>'proposedBy')::uuid)
        AND (NULLIF($1->>'client', '') IS NULL OR
          EXISTS (SELECT 1 FROM public.artwork_proposals ap
            WHERE ap.artwork_id = a.id AND ap.contact_id = ($1->>'client')::uuid)
          OR EXISTS (SELECT 1 FROM public.artworks w
            WHERE w.id = a.id AND w.buyer_contact_id = ($1->>'client')::uuid))
        AND (NOT $3 OR NULLIF($1->>'proposedTo', '') IS NULL OR EXISTS (
          SELECT 1 FROM public.artwork_proposals ap
          WHERE ap.artwork_id = a.id AND ap.contact_id::text = $1->>'proposedTo'))
        AND (NULLIF($1->>'fromDate', '') IS NULL OR COALESCE(a.status, '') NOT IN ('Bought', 'Archived')
          OR (CASE WHEN a.status = 'Bought' THEN a.date_acquisition::date
            ELSE COALESCE(a.date_proposition::date, a.sale_date::date) END) >= ($1->>'fromDate')::date)
    ),
    filtered AS (
      SELECT a.*, COALESCE(prop.labels, '') AS recipient_labels
      FROM base a
      LEFT JOIN LATERAL (
        SELECT string_agg(label, ', ' ORDER BY contact_id) AS labels
        FROM (
          SELECT DISTINCT ap.contact_id,
            COALESCE(NULLIF(btrim(c.company_name), ''),
              NULLIF(btrim(concat_ws(' ', c.first_name, c.last_name)), ''),
              NULLIF(btrim(c.email), '')) AS label
          FROM public.artwork_proposals ap JOIN public.contacts c ON c.id = ap.contact_id
          WHERE $3 AND ap.artwork_id = a.id
            AND (NULLIF(btrim($1->>'search'), '') IS NOT NULL OR $2->a.group_id->>'sortKey' = 'proposed_to')
        ) recipients WHERE label IS NOT NULL
      ) prop ON true
      WHERE (a.group_id = $4 OR starts_with(a.group_id, $4 || '-'))
        AND (NULLIF(btrim($1->>'search'), '') IS NULL OR
          strpos(lower(concat_ws(' ', a.artist->>'last_name', a.title, a.medium, a.status, a.priority,
            a.proposed_by_name, a.location_label, prop.labels)), lower(btrim($1->>'search'))) > 0)
    ),
    sorted AS (
      SELECT f.id, f.group_id,
        CASE WHEN f.group_id LIKE 'market-%%' THEN 0
          WHEN f.group_id LIKE 'auction-%%' THEN 1
          WHEN f.group_id = 'bought' THEN 2
          WHEN f.group_id = 'archived-market' THEN 3 ELSE 4 END AS section_order,
        CASE btrim(f.priority) WHEN 'High' THEN 0 WHEN 'Medium' THEN 1
          WHEN 'Low' THEN 2 WHEN 'Information' THEN 3 ELSE 4 END AS priority_order,
        CASE WHEN f.status = 'Draft' THEN 1 ELSE 0 END AS draft_order,
        CASE $2->f.group_id->>'sortKey'
          WHEN 'artist' THEN lower(f.artist->>'last_name')
          WHEN 'title' THEN lower(COALESCE(f.title, ''))
          WHEN 'status' THEN lower(COALESCE(f.status, ''))
          WHEN 'proposed_to' THEN lower(f.recipient_labels) END AS text_sort,
        CASE $2->f.group_id->>'sortKey'
          WHEN 'asking' THEN COALESCE(f.asking_price, 0)
          WHEN 'estimate' THEN COALESCE(f.estimate_low, f.estimate_high, 0)
          WHEN 'sold_premium' THEN COALESCE(f.sold_premium, 0)
          WHEN 'cost' THEN COALESCE(f.cost_amount, 0)
          WHEN 'quality' THEN f.quality
          WHEN 'priority' THEN CASE lower(btrim(f.priority))
            WHEN 'high' THEN 4 WHEN 'medium' THEN 3 WHEN 'low' THEN 2
            WHEN 'information' THEN 1 ELSE 0 END END AS number_sort,
        CASE WHEN $2->f.group_id->>'sortDirection' = 'desc' THEN -1 ELSE 1 END AS direction,
        COALESCE(extract(epoch FROM CASE WHEN f.status = 'Bought' THEN f.date_acquisition::timestamp
          WHEN f.auctions THEN f.sale_date::date + COALESCE(f.sale_time::time, '00:00'::time)
          ELSE f.date_proposition::timestamp END), 0) *
          CASE WHEN $2->f.group_id->>'sortKey' = 'date'
            THEN CASE WHEN $2->f.group_id->>'sortDirection' = 'desc' THEN -1 ELSE 1 END
            WHEN f.auctions AND COALESCE(f.status, '') NOT IN ('Bought', 'Archived') THEN 1 ELSE -1 END AS date_sort
      FROM filtered f
    )
    SELECT COALESCE(array_agg(id ORDER BY section_order,
      CASE WHEN section_order < 2 THEN priority_order END,
      CASE WHEN section_order < 2 THEN draft_order END,
      CASE WHEN direction = 1 THEN text_sort END COLLATE pg_catalog."fr-CH-x-icu" ASC NULLS LAST,
      CASE WHEN direction = -1 THEN text_sort END COLLATE pg_catalog."fr-CH-x-icu" DESC NULLS LAST,
      number_sort * direction ASC NULLS LAST, date_sort, id), '{}'::uuid[]) FROM sorted
  $query$, source_name) INTO result USING p_filters, p_tables, staff, p_category;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.artwork_category_ids(text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artwork_category_ids(text, jsonb, jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
