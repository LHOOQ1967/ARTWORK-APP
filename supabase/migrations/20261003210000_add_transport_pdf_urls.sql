ALTER TABLE public.artwork_transport_quotes
  ADD COLUMN quote_pdf_url text;

ALTER TABLE public.artwork_transports
  ADD COLUMN final_invoice_pdf_url text;
