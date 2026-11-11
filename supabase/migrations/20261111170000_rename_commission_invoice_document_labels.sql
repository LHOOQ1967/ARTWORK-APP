UPDATE public.documents
SET label = 'Facture Commission'
WHERE lower(btrim(label)) = 'commission invoice'
  AND label <> 'Facture Commission';
