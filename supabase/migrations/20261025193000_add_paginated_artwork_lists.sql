CREATE FUNCTION public.artwork_list_page(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_tables jsonb DEFAULT '{}'::jsonb,
  p_group text DEFAULT NULL,
  p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  source_name text;
  staff boolean := security.is_admin_or_editor();
  result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_offset < 0 OR p_offset > 1000000 THEN RAISE EXCEPTION 'Invalid page offset'; END IF;
  IF jsonb_typeof(p_filters) <> 'object' OR jsonb_typeof(p_tables) <> 'object' THEN
    RAISE EXCEPTION 'Invalid list parameters';
  END IF;
  IF COALESCE(p_filters->>'status', 'all') NOT IN ('all', 'Active', 'Bought', 'Archived') THEN
    RAISE EXCEPTION 'Invalid status filter';
  END IF;
  source_name := CASE WHEN staff THEN 'artworks_list_admin' ELSE 'viewer_artworks_list_secure' END;
  EXECUTE format($query$
    WITH base AS MATERIALIZED (
      SELECT a.*,
        COALESCE(a.artist->>'last_name', '') AS artist_label,
        COALESCE(a.proposed_by_name, '') AS proposed_by_label,
        CASE WHEN $3 THEN COALESCE(prop.proposals, '[]'::jsonb) ELSE '[]'::jsonb END AS proposals,
        CASE WHEN $3 THEN COALESCE(prop.labels, '') ELSE '' END AS recipient_labels,
        COALESCE(NULLIF(btrim(a.location->>'company_name'), ''),
          NULLIF(btrim(concat_ws(' ', a.location->>'first_name', a.location->>'last_name')), ''),
          NULLIF(btrim(a.location_of_work), ''), '') AS location_label,
        CASE
          WHEN a.status = 'Bought' THEN 'bought'
          WHEN a.status = 'Archived' THEN CASE WHEN a.auctions THEN 'archived-auction' ELSE 'archived-market' END
          ELSE (CASE WHEN a.auctions THEN 'auction-' ELSE 'market-' END) ||
            CASE WHEN btrim(a.priority) IN ('High', 'Medium', 'Low', 'Information')
              THEN btrim(a.priority) ELSE 'Other' END ||
            CASE WHEN a.status = 'Draft' THEN '-drafts' ELSE '-others' END
        END AS group_id,
        CASE WHEN a.status = 'Bought' THEN a.date_acquisition::timestamp
          WHEN a.auctions THEN a.sale_date::date + COALESCE(a.sale_time::time, '00:00'::time)
          ELSE a.date_proposition::timestamp END AS sort_date,
        CASE WHEN a.auctions AND COALESCE(a.status, '') NOT IN ('Bought', 'Archived') THEN 1 ELSE -1 END AS date_direction
      FROM public.%I a
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('contact_id', contact_id, 'contact_label', label)
          ORDER BY contact_id) AS proposals,
          string_agg(label, ', ' ORDER BY contact_id) AS labels
        FROM (
          SELECT DISTINCT ap.contact_id,
            COALESCE(NULLIF(btrim(c.company_name), ''),
              NULLIF(btrim(concat_ws(' ', c.first_name, c.last_name)), ''),
              NULLIF(btrim(c.email), '')) AS label
          FROM public.artwork_proposals ap
          JOIN public.contacts c ON c.id = ap.contact_id
          WHERE $3 AND ap.artwork_id = a.id
        ) recipients WHERE label IS NOT NULL
      ) prop ON true
      WHERE
        (COALESCE($1->>'status', 'all') = 'all'
          OR ($1->>'status' = 'Active' AND COALESCE(a.status, '') NOT IN ('Bought', 'Archived'))
          OR a.status = $1->>'status')
        AND (NULLIF($1->>'client', '') IS NULL OR
          EXISTS (SELECT 1 FROM public.artwork_proposals ap
            WHERE ap.artwork_id = a.id AND ap.contact_id = ($1->>'client')::uuid)
          OR EXISTS (SELECT 1 FROM public.artworks w
            WHERE w.id = a.id AND w.buyer_contact_id = ($1->>'client')::uuid))
    ),
    filtered AS MATERIALIZED (
      SELECT * FROM base a WHERE
        (NULLIF($1->>'artistId', '') IS NULL OR a.artist_id = ($1->>'artistId')::uuid)
        AND (NULLIF($1->>'proposedBy', '') IS NULL OR a.proposed_by_id = ($1->>'proposedBy')::uuid)
        AND (NOT $3 OR NULLIF($1->>'proposedTo', '') IS NULL OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(a.proposals) p
          WHERE p->>'contact_id' = $1->>'proposedTo'))
        AND (NULLIF($1->>'fromDate', '') IS NULL OR COALESCE(a.status, '') NOT IN ('Bought', 'Archived')
          OR (CASE WHEN a.status = 'Bought' THEN a.date_acquisition::date
            ELSE COALESCE(a.date_proposition::date, a.sale_date::date) END) >= ($1->>'fromDate')::date)
        AND (NULLIF(btrim($1->>'search'), '') IS NULL OR
          strpos(lower(concat_ws(' ', a.artist_label, a.title, a.medium, a.status, a.priority,
            a.proposed_by_label, a.location_label, a.recipient_labels)), lower(btrim($1->>'search'))) > 0)
    ),
    groups AS (
      SELECT group_id, count(*) AS total FROM filtered GROUP BY group_id
    ),
    pages AS (
      SELECT g.group_id, g.total, COALESCE(page.rows, '[]'::jsonb) AS rows
      FROM groups g
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(selected.row_data) AS rows
        FROM (
          SELECT to_jsonb(r) - ARRAY['recipient_labels', 'location_label', 'group_id', 'sort_date', 'date_direction',
            'text_sort', 'number_sort', 'sort_direction', 'sort_key'] AS row_data
          FROM (
            SELECT f.*,
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
                  WHEN 'high' THEN 4 WHEN 'medium' THEN 3 WHEN 'low' THEN 2 WHEN 'information' THEN 1 ELSE 0 END
                END AS number_sort,
              CASE WHEN $2->f.group_id->>'sortDirection' = 'desc' THEN -1 ELSE 1 END AS sort_direction,
              COALESCE($2->f.group_id->>'sortKey', 'date') AS sort_key
            FROM filtered f WHERE f.group_id = g.group_id
          ) r
          ORDER BY
            (CASE WHEN r.sort_direction = 1 THEN r.text_sort END) COLLATE pg_catalog."fr-CH-x-icu" ASC NULLS LAST,
            (CASE WHEN r.sort_direction = -1 THEN r.text_sort END) COLLATE pg_catalog."fr-CH-x-icu" DESC NULLS LAST,
            r.number_sort * r.sort_direction ASC NULLS LAST,
            COALESCE(extract(epoch FROM r.sort_date), 0) *
              CASE WHEN r.sort_key = 'date' AND $2->r.group_id->>'sortKey' IS NOT NULL
                THEN r.sort_direction ELSE r.date_direction END ASC,
            r.id
          LIMIT 20 OFFSET $5
        ) selected
      ) page ON true
      WHERE $4 IS NULL OR g.group_id = $4
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM filtered),
      'groups', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', group_id, 'total', total, 'rows', rows) ORDER BY group_id) FROM pages), '[]'::jsonb),
      'artists', COALESCE((SELECT jsonb_agg(option ORDER BY option->>'label') FROM (
        SELECT DISTINCT jsonb_build_object('id', artist_id, 'label', artist_label) AS option
        FROM base WHERE artist_id IS NOT NULL AND artist_label <> ''
      ) options), '[]'::jsonb),
      'proposers', COALESCE((SELECT jsonb_agg(option ORDER BY option->>'label') FROM (
        SELECT DISTINCT jsonb_build_object('id', proposed_by_id, 'label', proposed_by_label) AS option
        FROM base WHERE proposed_by_id IS NOT NULL AND proposed_by_label <> ''
      ) options), '[]'::jsonb),
      'recipients', COALESCE((SELECT jsonb_agg(option ORDER BY option->>'label') FROM (
        SELECT DISTINCT jsonb_build_object('id', p->>'contact_id', 'label', p->>'contact_label') AS option
        FROM base CROSS JOIN LATERAL jsonb_array_elements(proposals) p
      ) options), '[]'::jsonb),
      'statuses', COALESCE((SELECT jsonb_agg(status ORDER BY status)
        FROM (SELECT DISTINCT status FROM base WHERE NULLIF(btrim(status), '') IS NOT NULL) statuses), '[]'::jsonb)
    )
  $query$, source_name) INTO result USING p_filters, p_tables, staff, p_group, p_offset;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.artwork_list_page(jsonb, jsonb, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artwork_list_page(jsonb, jsonb, text, integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
