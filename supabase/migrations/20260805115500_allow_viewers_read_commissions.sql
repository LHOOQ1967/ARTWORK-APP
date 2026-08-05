DROP POLICY IF EXISTS artwork_commission_rates_viewer_select
  ON public.artwork_commission_rates;
CREATE POLICY artwork_commission_rates_viewer_select
  ON public.artwork_commission_rates
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS artwork_commission_invoices_viewer_select
  ON public.artwork_commission_invoices;
CREATE POLICY artwork_commission_invoices_viewer_select
  ON public.artwork_commission_invoices
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS artwork_commission_correction_invoices_viewer_select
  ON public.artwork_commission_correction_invoices;
CREATE POLICY artwork_commission_correction_invoices_viewer_select
  ON public.artwork_commission_correction_invoices
  FOR SELECT
  TO authenticated
  USING (true);
