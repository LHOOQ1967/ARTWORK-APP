ALTER TABLE public.artwork_commission_invoices
  ADD COLUMN invoice_url text;

ALTER TABLE public.artwork_commission_correction_invoices
  ADD COLUMN invoice_url text;
