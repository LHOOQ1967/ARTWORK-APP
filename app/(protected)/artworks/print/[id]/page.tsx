
'use client'


import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'   // ✅ CORRECT
import ArtworkSheet from '@/components/artwork/ArtworkSheet'
import type { ArtworkPrint } from '@/app/(protected)/types/artwork'
import { resolveSource } from '@/lib/viewerSources'
import { useSessionProfile } from '@/contexts/SessionContext'
import { useClientFilter } from '@/contexts/ClientFilterContext'



function logSupabaseError(context: string, error: unknown) {
  if (!error) return
  if (typeof error === 'object' && error !== null) {
    const details = error as {
      message?: string
      details?: string
      hint?: string
      code?: string
    }
    console.error(context, {
      message: details.message,
      details: details.details,
      hint: details.hint,
      code: details.code,
    })
    return
  }
  console.error(context, { message: String(error) })
}




export default function ArtworkPrintPage() {
  const { id } = useParams<{ id: string }>()
  const { role } = useSessionProfile()
  const { selectedClient, matchesClient } = useClientFilter()

  const canEdit = role === 'Administrator' || role === 'Editor'
  const [artwork, setArtwork] = useState<ArtworkPrint | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id || !role) return

    let isMounted = true

    const loadArtwork = async () => {
      try {
        setLoading(true)

        const source = resolveSource('prints', role)

        const [artworkResult, invoiceResult, commissionResponse] = await Promise.all([
          supabase.from(source).select('*').eq('id', id).maybeSingle(),
          supabase
            .from('artwork_commission_invoices')
            .select('invoiced_at, invoice_url')
            .eq('artwork_id', id)
            .maybeSingle(),
          fetch('/api/commissions'),
        ])

        const { data, error } = artworkResult
        const { data: invoiceData } = invoiceResult
        const commissionPayload = (await commissionResponse.json()) as {
          calculatedCommissions?: Record<string, number | null>
          initialCommissionAmounts?: Record<string, number>
          correctionInvoiceDates?: Record<string, string>
        }
        const hasCalculatedCommission = Object.hasOwn(
          commissionPayload.calculatedCommissions ?? {},
          id
        )
        if (error) logSupabaseError('factsheet: artwork load error', error)
        if (invoiceResult.error) {
          logSupabaseError('factsheet: commission invoice load error', invoiceResult.error)
        }

        if (!isMounted) return

        if (error || !data) {
          setArtwork(null)
          return
        }

        setArtwork({
          ...(data as ArtworkPrint),
          commission_invoiced_at: invoiceData?.invoiced_at ?? null,
          commission_invoice_url: invoiceData?.invoice_url ?? null,
          commission_initial_amount:
            commissionPayload.initialCommissionAmounts?.[id] ?? null,
          commission_corrected_invoiced_at:
            commissionPayload.correctionInvoiceDates?.[id] ?? null,
          ...(hasCalculatedCommission
            ? { calculated_commission: commissionPayload.calculatedCommissions![id] }
            : {}),
        })
      } catch (err) {
        logSupabaseError('factsheet: unexpected load error', err)
        if (isMounted) setArtwork(null)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadArtwork()

    return () => {
      isMounted = false
    }
  }, [id, role])

  if (loading) {
    return <p style={{ 
    paddingTop: 80,
    paddingLeft: 10,
    paddingRight: 10,
    paddingBottom: 10,
 }}>Loading artwork…</p>
  }

  if (!artwork) {
    return <p style={{ 
    paddingTop: 80,
    paddingLeft: 10,
    paddingRight: 10,
    paddingBottom: 10,
 }}>Artwork not found</p>
  }

  const isOutsideSelectedClient =
    selectedClient !== null &&
    !matchesClient(artwork.id) &&
    artwork.buyer_contact_id !== selectedClient.id &&
    artwork.buyer_id !== selectedClient.id &&
    !(artwork.proposals ?? []).some((proposal) => proposal.contact_id === selectedClient.id)

  return (
    <main style={{ 
    paddingTop: 80,
    paddingLeft: 10,
    paddingRight: 10,
    paddingBottom: 10,
 }}>
      {isOutsideSelectedClient && (
        <div
          className="no-print"
          role="status"
          style={{
            maxWidth: 1100,
            margin: '0 auto 16px',
            backgroundColor: '#fff6d6',
            color: '#6b4e00',
            border: '1px solid #f2c94c',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: '0.95rem',
          }}
        >
          ⚠ Cette œuvre n&apos;a pas été proposée à <strong>{selectedClient.label}</strong> (client
          sélectionné dans l&apos;en-tête).
        </div>
      )}
      <ArtworkSheet artwork={artwork} canEdit={canEdit} />
    </main>
  )
}
