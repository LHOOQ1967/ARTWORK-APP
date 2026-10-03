-- Adresses multiples par contact
CREATE TABLE public.contact_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  label text,
  address text,
  postal_code text,
  city text,
  country text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contact_addresses_contact ON public.contact_addresses (contact_id);

ALTER TABLE public.contact_addresses ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_addresses TO authenticated;
GRANT ALL ON public.contact_addresses TO service_role;

CREATE POLICY contact_addresses_select
  ON public.contact_addresses
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_id));

CREATE POLICY contact_addresses_write
  ON public.contact_addresses
  FOR ALL TO authenticated
  USING (security.is_admin_or_editor())
  WITH CHECK (security.is_admin_or_editor());

-- Adresses reprises depuis le champ city existant
INSERT INTO public.contact_addresses (contact_id, city)
SELECT id, city FROM public.contacts WHERE NULLIF(btrim(city), '') IS NOT NULL;

-- Adresse choisie pour la localisation / destination
ALTER TABLE public.artworks
  ADD COLUMN location_address_id uuid REFERENCES public.contact_addresses(id) ON DELETE SET NULL,
  ADD COLUMN destination_address_id uuid REFERENCES public.contact_addresses(id) ON DELETE SET NULL;

ALTER TABLE public.artwork_transports
  ADD COLUMN origin_address_id uuid REFERENCES public.contact_addresses(id) ON DELETE SET NULL,
  ADD COLUMN destination_address_id uuid REFERENCES public.contact_addresses(id) ON DELETE SET NULL;

ALTER TABLE public.artwork_location_history
  ADD COLUMN address_id uuid REFERENCES public.contact_addresses(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.capture_artwork_location_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.location_contact_id IS NOT NULL THEN
      INSERT INTO public.artwork_location_history (artwork_id, contact_id, address_id, actor_id)
      VALUES (NEW.id, NEW.location_contact_id, NEW.location_address_id, auth.uid());
    END IF;
  ELSIF NEW.location_contact_id IS DISTINCT FROM OLD.location_contact_id
    OR NEW.location_address_id IS DISTINCT FROM OLD.location_address_id THEN
    UPDATE public.artwork_location_history
    SET ended_at = now()
    WHERE artwork_id = NEW.id AND ended_at IS NULL;

    IF NEW.location_contact_id IS NOT NULL THEN
      INSERT INTO public.artwork_location_history (artwork_id, contact_id, address_id, actor_id)
      VALUES (NEW.id, NEW.location_contact_id, NEW.location_address_id, auth.uid());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER trg_capture_artwork_location_history ON public.artworks;
CREATE TRIGGER trg_capture_artwork_location_history
  AFTER INSERT OR UPDATE OF location_contact_id, location_address_id ON public.artworks
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_artwork_location_history();

CREATE OR REPLACE FUNCTION public.apply_transport_arrival()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.arrival_date IS NOT NULL
    AND NEW.destination_contact_id IS NOT NULL
    AND (TG_OP = 'INSERT' OR OLD.arrival_date IS NULL) THEN
    UPDATE public.artworks
    SET location_contact_id = NEW.destination_contact_id,
        location_address_id = NEW.destination_address_id,
        destination_contact_id = NULL,
        destination_address_id = NULL
    WHERE id = NEW.artwork_id;
  END IF;

  RETURN NEW;
END;
$$;
