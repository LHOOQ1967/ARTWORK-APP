import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { logAuditEvent } from '@/lib/audit'

const EDITOR_ROLES = ['Editor', 'Administrator'] as const
const CURRENCIES = new Set(['CHF', 'EUR', 'USD', 'GBP', 'HKD'])

type ValuationInput = {
  artworkId: unknown
  expertContactId: unknown
  amount: unknown
  currency: unknown
  notes?: unknown
}

type ValuationRecord = {
  artwork_id: string
  expert_contact_id: string
  valuation_date: string
  amount: number
  currency: string
  notes: string | null
  created_by: string
}

function isIsoDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
  )
}

function normalizeValuation(
  valuation: ValuationInput,
  valuationDate: string,
  userId: string
) {
  const amount =
    typeof valuation.amount === 'number' ? valuation.amount : Number(valuation.amount)
  const currency =
    typeof valuation.currency === 'string' ? valuation.currency.toUpperCase() : ''

  if (
    typeof valuation.artworkId !== 'string' ||
    typeof valuation.expertContactId !== 'string' ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    !CURRENCIES.has(currency) ||
    (valuation.notes !== undefined && typeof valuation.notes !== 'string')
  ) {
    return null
  }

  return {
    artwork_id: valuation.artworkId,
    expert_contact_id: valuation.expertContactId,
    valuation_date: valuationDate,
    amount,
    currency,
    notes: valuation.notes?.trim() || null,
    created_by: userId,
  }
}

export async function GET() {
  const authorization = await requireRole(EDITOR_ROLES)
  if (authorization.response) {
    return authorization.response
  }

  const { supabase } = authorization
  const [artworksResult, contactsResult, valuationsResult] = await Promise.all([
    supabase
      .from('v_inventory_bought_florac')
      .select(
        'id, image_url, title, year_execution, date_acquisition, first_name, last_name, cost_amount, cost_currency, purchase_cost, commission_blondeau, fx_rate_to_eur'
      ),
    supabase
      .from('contacts')
      .select('id, company_name, first_name, last_name')
      .order('company_name', { ascending: true }),
    supabase
      .from('artwork_valuations')
      .select(
        'id, artwork_id, expert_contact_id, valuation_date, amount, currency, notes, created_at, expert:contacts!artwork_valuations_expert_contact_id_fkey(id, company_name, first_name, last_name)'
      )
      .order('valuation_date', { ascending: false }),
  ])

  const error =
    artworksResult.error ?? contactsResult.error ?? valuationsResult.error

  if (error) {
    console.error('LOAD VALUATIONS ERROR:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    artworks: (artworksResult.data ?? []).map((artwork) => ({
      ...artwork,
      artist: {
        first_name: artwork.first_name,
        last_name: artwork.last_name,
      },
    })),
    contacts: contactsResult.data ?? [],
    valuations: valuationsResult.data ?? [],
  })
}

export async function POST(req: NextRequest) {
  const authorization = await requireRole(EDITOR_ROLES)
  if (authorization.response) {
    return authorization.response
  }

  const body = await req.json()
  const valuationDate = body?.valuationDate
  const valuations = body?.valuations

  if (!isIsoDate(valuationDate) || !Array.isArray(valuations) || valuations.length === 0) {
    return NextResponse.json(
      { error: 'Une date et au moins une évaluation valide sont requises.' },
      { status: 400 }
    )
  }

  const normalized = valuations.map((valuation) =>
    normalizeValuation(valuation, valuationDate, authorization.userId)
  )

  if (normalized.some((valuation) => valuation === null)) {
    return NextResponse.json(
      { error: 'Une ou plusieurs évaluations sont invalides.' },
      { status: 400 }
    )
  }

  const validValuations = normalized.filter(
    (valuation): valuation is ValuationRecord => valuation !== null
  )

  const { data, error } = await authorization.supabase
    .from('artwork_valuations')
    .upsert(validValuations, {
      onConflict: 'artwork_id,expert_contact_id,valuation_date',
    })
    .select(
      'id, artwork_id, expert_contact_id, valuation_date, amount, currency, notes, created_at, expert:contacts!artwork_valuations_expert_contact_id_fkey(id, company_name, first_name, last_name)'
    )

  if (error) {
    await logAuditEvent({
      actorId: authorization.userId,
      action: 'artwork_valuation_upsert',
      outcome: 'failure',
      subjectType: 'artwork_valuation',
      errorMessage: error.message,
    })
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  await logAuditEvent({
    actorId: authorization.userId,
    action: 'artwork_valuation_upsert',
    outcome: 'success',
    subjectType: 'artwork_valuation',
  })

  return NextResponse.json({ valuations: data ?? [] })
}
