import { supabase } from '@/lib/supabaseBrowser'

/**
 * Placeholder buyer contact used to flag artworks whose invoice destination
 * still has to be decided ("En attente de destination de factures").
 */
export const PENDING_INVOICE_BUYER_ID = '7c944786-75ff-4630-9851-e1ac0105b9b5'

/** Counts artworks still awaiting an invoice destination (capped at 100).
 * Returns 0 on error. Viewers are counted through the RLS-scoped view, so
 * they only see artworks belonging to their own client. */
export async function fetchPendingInvoiceDestinationCount(role?: string | null): Promise<number> {
  const source =
    (role ?? '').toLowerCase() === 'viewer' ? 'viewer_artworks_full_secure' : 'artworks'

  try {
    // Fetch a capped list of ids instead of an exact COUNT: much cheaper
    // under RLS and good enough for a notification badge.
    const { data, error } = await supabase
      .from(source)
      .select('id')
      .eq('buyer_contact_id', PENDING_INVOICE_BUYER_ID)
      .limit(100)

    if (error) {
      console.error('PENDING INVOICE DESTINATION COUNT ERROR', error)
      return 0
    }

    return data?.length ?? 0
  } catch (error) {
    console.error('PENDING INVOICE DESTINATION COUNT ERROR', error)
    return 0
  }
}
