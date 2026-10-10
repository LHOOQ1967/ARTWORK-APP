-- Marque les contacts sélectionnables comme « client » dans le filtre global
-- de l'en-tête (Administrator / Editor).
ALTER TABLE public.contacts
  ADD COLUMN is_client boolean NOT NULL DEFAULT false;

CREATE INDEX idx_contacts_is_client ON public.contacts (id) WHERE is_client;

CREATE INDEX IF NOT EXISTS idx_artwork_proposals_contact_id
  ON public.artwork_proposals (contact_id);

-- Clients existants : Florac et Léopold Meyer.
UPDATE public.contacts
SET is_client = true
WHERE id = 'abbcf211-f94e-4435-918e-775390164cb2'
   OR (
     lower(trim(last_name)) = 'meyer'
     AND lower(trim(first_name)) IN ('léopold', 'leopold')
   );
