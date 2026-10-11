ALTER TABLE public.artworks ADD COLUMN edition text;

COMMENT ON COLUMN public.artworks.edition IS
  'Free-text edition information, displayed after the signature.';

-- Append the column without changing existing view columns, filters, or grants.
-- Read the deployed definitions so previous view updates remain intact.
DO $$
DECLARE
  view_name text;
  view_definition text;
BEGIN
  FOREACH view_name IN ARRAY ARRAY['artworks_full_admin', 'viewer_artworks_full_secure']
  LOOP
    view_definition := rtrim(
      pg_get_viewdef(format('public.%I', view_name)::regclass, true),
      E'; \n\r\t'
    );

    EXECUTE format(
      'CREATE OR REPLACE VIEW public.%I WITH (security_invoker = true) AS
       SELECT existing.*, artwork.edition
       FROM (%s) AS existing
       JOIN public.artworks AS artwork ON artwork.id = existing.id',
      view_name,
      view_definition
    );
  END LOOP;
END;
$$;
