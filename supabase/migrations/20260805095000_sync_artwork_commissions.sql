CREATE OR REPLACE FUNCTION public.record_artwork_commission_invoice(
  p_artwork_id uuid,
  p_invoiced_at date,
  p_invoice_url text,
  p_commission_amount numeric,
  p_created_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO public
AS $$
BEGIN
  IF NOT security.is_admin_or_editor() THEN
    RAISE EXCEPTION 'Unauthorized commission update';
  END IF;

  INSERT INTO public.artwork_commission_invoices (
    artwork_id,
    invoiced_at,
    invoice_url,
    created_by
  )
  VALUES (
    p_artwork_id,
    p_invoiced_at,
    p_invoice_url,
    p_created_by
  )
  ON CONFLICT (artwork_id) DO UPDATE
  SET
    invoiced_at = EXCLUDED.invoiced_at,
    invoice_url = EXCLUDED.invoice_url,
    created_by = EXCLUDED.created_by;

  UPDATE public.artworks
  SET commission_blondeau = p_commission_amount
  WHERE id = p_artwork_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Artwork % not found', p_artwork_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_artwork_commission_correction_invoice(
  p_calendar_year integer,
  p_company text,
  p_invoiced_at date,
  p_invoice_url text,
  p_created_by uuid,
  p_artwork_commissions jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO public
AS $$
DECLARE
  updated_artworks integer;
BEGIN
  IF NOT security.is_admin_or_editor() THEN
    RAISE EXCEPTION 'Unauthorized commission correction update';
  END IF;

  INSERT INTO public.artwork_commission_correction_invoices (
    calendar_year,
    company,
    invoiced_at,
    invoice_url,
    created_by
  )
  VALUES (
    p_calendar_year,
    p_company,
    p_invoiced_at,
    p_invoice_url,
    p_created_by
  )
  ON CONFLICT (calendar_year, company) DO UPDATE
  SET
    invoiced_at = EXCLUDED.invoiced_at,
    invoice_url = EXCLUDED.invoice_url,
    created_by = EXCLUDED.created_by;

  UPDATE public.artworks AS artwork
  SET commission_blondeau = commission.commission_amount
  FROM jsonb_to_recordset(p_artwork_commissions) AS commission(
    artwork_id uuid,
    commission_amount numeric
  )
  WHERE artwork.id = commission.artwork_id;

  GET DIAGNOSTICS updated_artworks = ROW_COUNT;
  IF updated_artworks <> jsonb_array_length(p_artwork_commissions) THEN
    RAISE EXCEPTION 'One or more artworks could not be updated';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_artwork_commission_invoice(uuid, date, text, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_artwork_commission_correction_invoice(integer, text, date, text, uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_artwork_commission_invoice(uuid, date, text, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_artwork_commission_correction_invoice(integer, text, date, text, uuid, jsonb) TO authenticated;
