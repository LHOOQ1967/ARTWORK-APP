-- Move the final destination into the location fields for every artwork
-- that has no transport, then clear the destination fields.
-- The location history trigger is disabled so no history entries are created.
ALTER TABLE public.artworks DISABLE TRIGGER trg_capture_artwork_location_history;

UPDATE public.artworks a
SET location_contact_id = a.destination_contact_id,
    location_address_id = a.destination_address_id,
    destination_contact_id = NULL,
    destination_address_id = NULL
WHERE a.destination_contact_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.artwork_transports t WHERE t.artwork_id = a.id
  );

ALTER TABLE public.artworks ENABLE TRIGGER trg_capture_artwork_location_history;
