CREATE TABLE public.artwork_commission_invoices (
  artwork_id uuid PRIMARY KEY REFERENCES public.artworks(id) ON DELETE CASCADE,
  invoiced_at date NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.artwork_commission_correction_invoices (
  calendar_year integer NOT NULL CHECK (calendar_year BETWEEN 2000 AND 2100),
  company text NOT NULL CHECK (company IN ('Florac', 'Léopold Meyer')),
  invoiced_at date NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (calendar_year, company)
);

ALTER TABLE public.artwork_commission_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artwork_commission_invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.artwork_commission_correction_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artwork_commission_correction_invoices FORCE ROW LEVEL SECURITY;

CREATE TRIGGER set_artwork_commission_invoices_updated_at
  BEFORE UPDATE ON public.artwork_commission_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_artwork_commission_correction_invoices_updated_at
  BEFORE UPDATE ON public.artwork_commission_correction_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON public.artwork_commission_invoices TO authenticated;
GRANT ALL ON public.artwork_commission_invoices TO service_role;
GRANT ALL ON public.artwork_commission_correction_invoices TO authenticated;
GRANT ALL ON public.artwork_commission_correction_invoices TO service_role;

CREATE POLICY artwork_commission_invoices_editor_access
  ON public.artwork_commission_invoices
  FOR ALL
  TO authenticated
  USING (security.is_admin_or_editor())
  WITH CHECK (security.is_admin_or_editor());

CREATE POLICY artwork_commission_correction_invoices_editor_access
  ON public.artwork_commission_correction_invoices
  FOR ALL
  TO authenticated
  USING (security.is_admin_or_editor())
  WITH CHECK (security.is_admin_or_editor());
