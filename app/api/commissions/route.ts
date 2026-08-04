import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { logAuditEvent } from '@/lib/audit'

const EDITOR_ROLES = ['Editor', 'Administrator'] as const

function isCommissionClient(companyName: string | null) {
  const normalized = (companyName ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  return normalized.includes('florac') || normalized.includes('leopold meyer')
}

export async function GET() {
  const authorization = await requireRole(EDITOR_ROLES)
  if (authorization.response) return authorization.response

  const { supabase } = authorization
  const [artworksResult, fxRatesResult, commissionRatesResult] = await Promise.all([
    supabase
      .from('artworks')
      .select(`
        id,
        title,
        medium,
        provenance,
        year_execution,
        date_acquisition,
        cost_amount,
        cost_currency,
        buyer:contacts!artworks_buyer_contact_id_fkey(company_name),
        artist:artists(first_name, last_name)
      `)
      .eq('status', 'Bought')
      .not('date_acquisition', 'is', null)
      .not('cost_amount', 'is', null)
      .not('cost_currency', 'is', null)
      .order('date_acquisition', { ascending: true }),
    supabase
      .from('fx_rates_history')
      .select('rate_date, from_currency, to_currency, rate')
      .eq('to_currency', 'EUR'),
    supabase.from('artwork_commission_rates').select('artwork_id, rate'),
  ])

  const error =
    artworksResult.error ?? fxRatesResult.error ?? commissionRatesResult.error
  if (error) {
    console.error('LOAD COMMISSIONS ERROR:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const artworks = (artworksResult.data ?? []).filter((artwork) => {
    const buyer = Array.isArray(artwork.buyer) ? artwork.buyer[0] : artwork.buyer
    return isCommissionClient(buyer?.company_name ?? null)
  })

  return NextResponse.json({
    artworks,
    fxRates: fxRatesResult.data ?? [],
    commissionRates: commissionRatesResult.data ?? [],
  })
}

export async function PUT(request: NextRequest) {
  const authorization = await requireRole(EDITOR_ROLES)
  if (authorization.response) return authorization.response

  const body = await request.json()
  const artworkId = body?.artworkId
  const rate = body?.rate

  if (typeof artworkId !== 'string') {
    return NextResponse.json({ error: 'Œuvre invalide.' }, { status: 400 })
  }

  if (rate === null) {
    const { error } = await authorization.supabase
      .from('artwork_commission_rates')
      .delete()
      .eq('artwork_id', artworkId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
  } else {
    const numericRate = typeof rate === 'number' ? rate : Number(rate)
    if (!Number.isFinite(numericRate) || numericRate < 0 || numericRate > 1) {
      return NextResponse.json(
        { error: 'Le taux doit être compris entre 0 % et 100 %.' },
        { status: 400 }
      )
    }

    const { error } = await authorization.supabase
      .from('artwork_commission_rates')
      .upsert(
        {
          artwork_id: artworkId,
          rate: numericRate,
          updated_by: authorization.userId,
        },
        { onConflict: 'artwork_id' }
      )

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
  }

  await logAuditEvent({
    actorId: authorization.userId,
    action: 'artwork_commission_rate_update',
    outcome: 'success',
    subjectType: 'artwork',
    subjectId: artworkId,
  })

  return NextResponse.json({ success: true })
}
