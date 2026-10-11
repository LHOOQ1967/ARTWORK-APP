CREATE TABLE public.geneva_freeport_inventory (
  artwork_id uuid PRIMARY KEY REFERENCES public.artworks(id) ON DELETE CASCADE,
  inventory_number text,
  owner_name text,
  country_of_provenance text,
  entry_value numeric CHECK (entry_value IS NULL OR entry_value >= 0),
  entry_currency text CHECK (entry_currency IS NULL OR entry_currency ~ '^[A-Z]{3}$'),
  insured_value_usd numeric CHECK (insured_value_usd IS NULL OR insured_value_usd >= 0),
  storage_location text,
  packing text,
  notes text,
  source_file text,
  source_row integer,
  source_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.geneva_freeport_customs_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artwork_id uuid NOT NULL REFERENCES public.geneva_freeport_inventory(artwork_id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0),
  document_reference text,
  document_date date,
  issuing_office text,
  stamp_date date,
  customs_reference text,
  owner_name text,
  country_of_provenance text,
  entry_value numeric CHECK (entry_value IS NULL OR entry_value >= 0),
  entry_currency text CHECK (entry_currency IS NULL OR entry_currency ~ '^[A-Z]{3}$'),
  insured_value_usd numeric CHECK (insured_value_usd IS NULL OR insured_value_usd >= 0),
  storage_location text,
  packing text,
  notes text,
  source_row integer,
  UNIQUE (artwork_id, position)
);

COMMENT ON TABLE public.geneva_freeport_inventory IS
  'Separate customs inventory. Goods designation uses ArtMuse artwork data; source_description preserves the original import, not factsheet content.';
COMMENT ON COLUMN public.geneva_freeport_inventory.inventory_number IS
  'External customs number, not unique: the source workbook repeats HES.1 for two different artworks.';
COMMENT ON COLUMN public.geneva_freeport_inventory.insured_value_usd IS
  'Inventory-specific USD value; does not overwrite artworks.insurance_value.';

ALTER TABLE public.geneva_freeport_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geneva_freeport_inventory FORCE ROW LEVEL SECURITY;
ALTER TABLE public.geneva_freeport_customs_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geneva_freeport_customs_documents FORCE ROW LEVEL SECURITY;

CREATE POLICY geneva_freeport_inventory_editor_access
  ON public.geneva_freeport_inventory FOR ALL TO authenticated
  USING (security.is_admin_or_editor()) WITH CHECK (security.is_admin_or_editor());
CREATE POLICY geneva_freeport_documents_editor_access
  ON public.geneva_freeport_customs_documents FOR ALL TO authenticated
  USING (security.is_admin_or_editor()) WITH CHECK (security.is_admin_or_editor());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.geneva_freeport_inventory,
  public.geneva_freeport_customs_documents TO authenticated, service_role;

CREATE TRIGGER set_geneva_freeport_inventory_updated_at
  BEFORE UPDATE ON public.geneva_freeport_inventory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE FUNCTION public.save_geneva_freeport_inventory(
  p_artwork_id uuid, p_inventory jsonb, p_documents jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Lock the artwork to prevent a move while saving its Freeport inventory.
  PERFORM 1 FROM public.artworks
  WHERE id = p_artwork_id
    AND location_contact_id = 'abbcf211-f94e-4435-918e-775390164cb2'
    AND location_address_id = '9b46dacc-7e21-4be6-ac45-7c4dfc62882f'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Artwork is not located at Florac Works / PF, Geneva, Switzerland';
  END IF;
  IF jsonb_typeof(p_inventory) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_documents) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid Freeport inventory payload';
  END IF;

  INSERT INTO public.geneva_freeport_inventory (
    artwork_id, inventory_number, owner_name, country_of_provenance,
    entry_value, entry_currency, insured_value_usd, storage_location, packing, notes
  )
  SELECT p_artwork_id, i.inventory_number, i.owner_name, i.country_of_provenance,
    i.entry_value, i.entry_currency, i.insured_value_usd, i.storage_location, i.packing, i.notes
  FROM jsonb_to_record(p_inventory) AS i(
    inventory_number text, owner_name text, country_of_provenance text,
    entry_value numeric, entry_currency text, insured_value_usd numeric,
    storage_location text, packing text, notes text
  )
  ON CONFLICT (artwork_id) DO UPDATE SET
    inventory_number = EXCLUDED.inventory_number, owner_name = EXCLUDED.owner_name,
    country_of_provenance = EXCLUDED.country_of_provenance,
    entry_value = EXCLUDED.entry_value, entry_currency = EXCLUDED.entry_currency,
    insured_value_usd = EXCLUDED.insured_value_usd,
    storage_location = EXCLUDED.storage_location, packing = EXCLUDED.packing,
    notes = EXCLUDED.notes;

  DELETE FROM public.geneva_freeport_customs_documents WHERE artwork_id = p_artwork_id;
  INSERT INTO public.geneva_freeport_customs_documents (
    artwork_id, position, document_reference, document_date, issuing_office,
    stamp_date, customs_reference, owner_name, country_of_provenance,
    entry_value, entry_currency, insured_value_usd, storage_location, packing, notes, source_row
  )
  SELECT p_artwork_id, (d.ordinality - 1)::integer,
    r.document_reference, r.document_date, r.issuing_office, r.stamp_date,
    r.customs_reference, r.owner_name, r.country_of_provenance,
    r.entry_value, r.entry_currency, r.insured_value_usd, r.storage_location, r.packing,
    r.notes, r.source_row
  FROM jsonb_array_elements(p_documents) WITH ORDINALITY AS d(value, ordinality)
  CROSS JOIN LATERAL jsonb_to_record(d.value) AS r(
    document_reference text, document_date date, issuing_office text, stamp_date date,
    customs_reference text, owner_name text, country_of_provenance text,
    entry_value numeric, entry_currency text, insured_value_usd numeric,
    storage_location text, packing text, notes text, source_row integer
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_geneva_freeport_inventory(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_geneva_freeport_inventory(uuid, jsonb, jsonb)
  TO authenticated, service_role;
