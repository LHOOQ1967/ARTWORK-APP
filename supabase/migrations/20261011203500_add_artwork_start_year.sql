ALTER TABLE public.artworks ADD COLUMN year_execution_start integer;

COMMENT ON COLUMN public.artworks.year_execution_start IS
  'Optional start year of execution. year_execution remains the end year; single-year works use only year_execution.';

ALTER TABLE public.artworks ADD CONSTRAINT artworks_execution_year_range_check
  CHECK (
    year_execution_start IS NULL
    OR (year_execution IS NOT NULL AND year_execution_start <= year_execution)
  );

DO $$
DECLARE
  view_name text;
  view_definition text;
BEGIN
  FOREACH view_name IN ARRAY ARRAY[
    'artworks_full_admin', 'viewer_artworks_full_secure',
    'v_inventory_bought', 'v_inventory_bought_florac'
  ]
  LOOP
    view_definition := rtrim(
      pg_get_viewdef(format('public.%I', view_name)::regclass, true),
      E'; \n\r\t'
    );

    EXECUTE format(
      'CREATE OR REPLACE VIEW public.%I WITH (security_invoker = true) AS
       SELECT existing.*, artwork.year_execution_start
       FROM (%s) AS existing
       JOIN public.artworks AS artwork ON artwork.id = existing.id',
      view_name,
      view_definition
    );
  END LOOP;
END;
$$;
