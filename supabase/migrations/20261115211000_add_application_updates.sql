CREATE TABLE public.application_updates (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  content text NOT NULL DEFAULT '' CHECK (char_length(content) <= 50000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.application_updates (id) VALUES (true);

CREATE TRIGGER set_application_updates_updated_at
  BEFORE UPDATE ON public.application_updates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.application_updates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.application_updates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.application_updates TO authenticated;
GRANT UPDATE (content) ON public.application_updates TO authenticated;
GRANT ALL ON public.application_updates TO service_role;

CREATE POLICY application_updates_read ON public.application_updates
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY application_updates_edit ON public.application_updates
  FOR UPDATE TO authenticated
  USING (security.is_admin())
  WITH CHECK (security.is_admin() AND btrim(content) <> '');

NOTIFY pgrst, 'reload schema';
