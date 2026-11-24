-- Date à laquelle le devis a été demandé au transporteur
ALTER TABLE public.artwork_transport_quotes
  ADD COLUMN requested_date date;
