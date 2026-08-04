CREATE TABLE public.artwork_commission_rates (
  artwork_id uuid PRIMARY KEY REFERENCES public.artworks(id) ON DELETE CASCADE,
  rate numeric(5,4) NOT NULL CHECK (rate >= 0 AND rate <= 1),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.artwork_commission_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artwork_commission_rates FORCE ROW LEVEL SECURITY;

CREATE TRIGGER set_artwork_commission_rates_updated_at
  BEFORE UPDATE ON public.artwork_commission_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON public.artwork_commission_rates TO authenticated;
GRANT ALL ON public.artwork_commission_rates TO service_role;

CREATE POLICY artwork_commission_rates_select
  ON public.artwork_commission_rates
  FOR SELECT
  TO authenticated
  USING (security.is_admin_or_editor());

CREATE POLICY artwork_commission_rates_write
  ON public.artwork_commission_rates
  FOR ALL
  TO authenticated
  USING (security.is_admin_or_editor())
  WITH CHECK (security.is_admin_or_editor());
