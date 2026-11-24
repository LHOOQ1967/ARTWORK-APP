CREATE FUNCTION public.can_view_client_names()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT security.is_admin_or_editor()
    OR (security.current_profile_role() = 'Viewer' AND EXISTS (
      SELECT 1 FROM public.viewer_all_clients WHERE user_id = auth.uid()
    ));
$$;
REVOKE ALL ON FUNCTION public.can_view_client_names() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_client_names() TO authenticated;

-- Keep the role-scoped artwork sources, pagination and sorting unchanged.
DO $$
DECLARE
  routine regprocedure;
  definition text;
  visibility_argument text := 'USING p_filters, p_tables, staff,';
  list_columns text := 'a.artist, a.proposed_by_name, a.location, a.location_of_work,';
BEGIN
  FOREACH routine IN ARRAY ARRAY[
    'public.artwork_list_page(jsonb,jsonb,text,integer)'::regprocedure,
    'public.artwork_category_ids(text,jsonb,jsonb)'::regprocedure
  ]
  LOOP
    definition := pg_get_functiondef(routine);
    IF (SELECT count(*) FROM regexp_matches(definition, visibility_argument, 'g')) <> 1 THEN
      RAISE EXCEPTION 'Unsupported client visibility argument in %', routine;
    END IF;
    definition := replace(definition, visibility_argument,
      'USING p_filters, p_tables, public.can_view_client_names(),');

    IF routine = 'public.artwork_list_page(jsonb,jsonb,text,integer)'::regprocedure THEN
      IF strpos(definition, list_columns) = 0 THEN
        RAISE EXCEPTION 'Unsupported artwork list columns in %', routine;
      END IF;
      definition := replace(definition, list_columns, list_columns || '
        CASE WHEN $3 AND a.buyer_contact_id IS NOT NULL THEN jsonb_build_object(
          ''id'', a.buyer_contact_id, ''company_name'', a.buyer->>''company_name'',
          ''first_name'', a.buyer->>''first_name'', ''last_name'', a.buyer->>''last_name''
        ) ELSE NULL END AS buyer,
        CASE WHEN $3 THEN a.buyer_contact_id ELSE NULL END AS buyer_contact_id,');
    END IF;
    EXECUTE definition;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
