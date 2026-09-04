import { NextRequest, NextResponse } from 'next/server'
import { requireRole, requireUser } from '@/lib/apiAuth'
import { logAuditEvent } from '@/lib/audit'

const EDITOR_ROLES = ['Editor', 'Administrator'] as const

type BuyerContact = {
  company_name: string | null
  first_name: string | null
  last_name: string | null
}

const THRESHOLD_USD = 5_000_000
const STANDARD_RATE = 0.08
const REDUCED_RATE = 0.07

function parseHttpUrl(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') return null

  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function normalize(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function isCommissionClient(contact: BuyerContact | null) {
  const companyName = normalize(contact?.company_name)
  const personName = `${normalize(contact?.first_name)} ${normalize(contact?.last_name)}`.trim()
  return companyName.includes('florac') || personName === 'leopold meyer'
}

function commissionCompany(contact: BuyerContact | null) {
  const companyName = normalize(contact?.company_name)
  const personName = `${normalize(contact?.first_name)} ${normalize(contact?.last_name)}`.trim()
  if (companyName.includes('florac')) return 'Florac'
  if (personName === 'leopold meyer') return 'Léopold Meyer'
  return null
}

export async function GET(request: NextRequest) {
  const authorization = await requireUser(request)
  if (authorization.response) return authorization.response

  const { supabase } = authorization
  const [artworksResult, fxRatesResult, commissionRatesResult, invoicesResult, correctionInvoicesResult] = await Promise.all([
    supabase
      .from('artworks')
      .select(`
        id,
        title,
        medium,
        year_execution,
        date_acquisition,
        cost_amount,
        cost_currency,
        commission_blondeau,
        auctions,
        sold_hammer,
        auction_currency,
        buyer:contacts!artworks_buyer_contact_id_fkey(company_name, first_name, last_name),
        proposedBy:contacts!artworks_proposed_by_id_fkey(company_name, first_name, last_name),
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
      .eq('to_currency', 'USD'),
    supabase.from('artwork_commission_rates').select('artwork_id, rate'),
    supabase.from('artwork_commission_invoices').select('artwork_id, invoiced_at, invoice_url'),
    supabase
      .from('artwork_commission_correction_invoices')
      .select('calendar_year, company, invoiced_at, invoice_url'),
  ])

  const error =
    artworksResult.error ??
    fxRatesResult.error ??
    commissionRatesResult.error ??
    invoicesResult.error ??
    correctionInvoicesResult.error
  if (error) {
    console.error('LOAD COMMISSIONS ERROR:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const artworks = (artworksResult.data ?? []).filter((artwork) => {
    const buyer = Array.isArray(artwork.buyer) ? artwork.buyer[0] : artwork.buyer
    return isCommissionClient(buyer ?? null)
  })
  const fxRates = fxRatesResult.data ?? []
  const commissionRates = commissionRatesResult.data ?? []
  const invoices = invoicesResult.data ?? []
  const correctionInvoices = correctionInvoicesResult.data ?? []
  const ratesByArtworkId = new Map(
    commissionRates.map((commissionRate) => [commissionRate.artwork_id, Number(commissionRate.rate)])
  )
  const fxRatesByKey = new Map(
    fxRates.map((fxRate) => [
      `${fxRate.rate_date}:${fxRate.from_currency}:${fxRate.to_currency}`,
      Number(fxRate.rate),
    ])
  )
  const invoicesByArtworkId = new Set(invoices.map((invoice) => invoice.artwork_id))
  const correctionInvoicesByKey = new Map(
    correctionInvoices.map((invoice) => [
      `${invoice.calendar_year}:${invoice.company}`,
      invoice,
    ])
  )
  const calculatedCommissions: Record<string, number | null> = {}
  const initialCommissionAmounts: Record<string, number> = {}
  const correctionInvoiceDates: Record<string, string> = {}

  for (const year of new Set(artworks.map((artwork) => artwork.date_acquisition.slice(0, 4)))) {
    const annualArtworks = artworks
      .filter((artwork) => artwork.date_acquisition.slice(0, 4) === year)
      .sort((first, second) => first.date_acquisition.localeCompare(second.date_acquisition))
    let qualifyingPurchaseTotal = 0

    for (const artwork of annualArtworks) {
      const exceptionalRate = ratesByArtworkId.get(artwork.id)
      const conversionRate =
        artwork.cost_currency === 'USD'
          ? 1
          : fxRatesByKey.get(
              `${artwork.date_acquisition.slice(0, 10)}:${artwork.cost_currency}:USD`
            ) ?? null
      if (exceptionalRate === undefined && conversionRate !== null) {
        qualifyingPurchaseTotal += Number(artwork.cost_amount) * conversionRate
      }

      const standardRate =
        qualifyingPurchaseTotal >= THRESHOLD_USD ? REDUCED_RATE : STANDARD_RATE
      const appliedRate = exceptionalRate ?? standardRate
      const commissionBase = artwork.auctions ? artwork.sold_hammer : artwork.cost_amount
      const buyer = Array.isArray(artwork.buyer) ? artwork.buyer[0] : artwork.buyer
      const company = commissionCompany(buyer ?? null)
      const correctionInvoice =
        company !== null &&
        exceptionalRate === undefined &&
        appliedRate === STANDARD_RATE &&
        invoicesByArtworkId.has(artwork.id) &&
        correctionInvoicesByKey.get(`${year}:${company}`)

      if (correctionInvoice) {
        correctionInvoiceDates[artwork.id] = correctionInvoice.invoiced_at
        if (artwork.commission_blondeau !== null) {
          initialCommissionAmounts[artwork.id] =
            (Number(artwork.commission_blondeau) / REDUCED_RATE) * STANDARD_RATE
        }
      }

      calculatedCommissions[artwork.id] =
        commissionBase === null
          ? null
          : Number(commissionBase) * (correctionInvoice ? REDUCED_RATE : appliedRate)
    }
  }

  return NextResponse.json({
    artworks,
    fxRates,
    commissionRates,
    invoices,
    correctionInvoices,
    calculatedCommissions,
    initialCommissionAmounts,
    correctionInvoiceDates,
  })
}

export async function PUT(request: NextRequest) {
  const authorization = await requireRole(EDITOR_ROLES, request)
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

export async function PATCH(request: NextRequest) {
  const authorization = await requireRole(EDITOR_ROLES, request)
  if (authorization.response) return authorization.response

  const body = await request.json()
  const rateDate = body?.rateDate
  const fromCurrency =
    typeof body?.fromCurrency === 'string' ? body.fromCurrency.toUpperCase() : ''
  const rate = typeof body?.rate === 'number' ? body.rate : Number(body?.rate)

  if (
    typeof rateDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(rateDate) ||
    !/^[A-Z]{3}$/.test(fromCurrency) ||
    !Number.isFinite(rate) ||
    rate <= 0
  ) {
    return NextResponse.json({ error: 'Taux de change invalide.' }, { status: 400 })
  }

  const { error } = await authorization.supabase.from('fx_rates_history').upsert(
    {
      rate_date: rateDate,
      from_currency: fromCurrency,
      to_currency: 'USD',
      rate,
    },
    { onConflict: 'rate_date,from_currency,to_currency' }
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  await logAuditEvent({
    actorId: authorization.userId,
    action: 'fx_rate_upsert',
    outcome: 'success',
    subjectType: 'fx_rate',
    subjectId: `${rateDate}:${fromCurrency}:USD`,
  })

  return NextResponse.json({
    fxRate: {
      rate_date: rateDate,
      from_currency: fromCurrency,
      to_currency: 'USD',
      rate,
    },
  })
}

export async function POST(request: NextRequest) {
  const authorization = await requireRole(EDITOR_ROLES, request)
  if (authorization.response) return authorization.response

  const body = await request.json()
  const invoicedAt = body?.invoicedAt
  if (typeof invoicedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(invoicedAt)) {
    return NextResponse.json({ error: 'Date de facture invalide.' }, { status: 400 })
  }
  const hasInvoiceUrl = body?.invoiceUrl !== undefined
  const invoiceUrl = hasInvoiceUrl ? parseHttpUrl(body.invoiceUrl) : undefined
  if (hasInvoiceUrl && body.invoiceUrl !== '' && invoiceUrl === null) {
    return NextResponse.json({ error: 'Le lien de facture doit être une URL HTTP ou HTTPS valide.' }, { status: 400 })
  }

  if (body?.kind === 'artwork' && typeof body.artworkId === 'string') {
    const commissionAmount =
      typeof body.commissionAmount === 'number' ? body.commissionAmount : Number(body.commissionAmount)
    if (!Number.isFinite(commissionAmount) || commissionAmount < 0) {
      return NextResponse.json({ error: 'Montant de commission invalide.' }, { status: 400 })
    }

    const { error } = await authorization.supabase.rpc('record_artwork_commission_invoice', {
      p_artwork_id: body.artworkId,
      p_invoiced_at: invoicedAt,
      p_invoice_url: invoiceUrl,
      p_commission_amount: commissionAmount,
      p_created_by: authorization.userId,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({
      invoice: {
        artwork_id: body.artworkId,
        invoiced_at: invoicedAt,
        invoice_url: invoiceUrl ?? null,
      },
    })
  }

  if (
    body?.kind === 'correction' &&
    Number.isInteger(body.calendarYear) &&
    (body.company === 'Florac' || body.company === 'Léopold Meyer')
  ) {
    const artworkCommissions = body.artworkCommissions
    if (
      !Array.isArray(artworkCommissions) ||
      !artworkCommissions.every(
        (item) =>
          item &&
          typeof item.artworkId === 'string' &&
          typeof item.commissionAmount === 'number' &&
          Number.isFinite(item.commissionAmount) &&
          item.commissionAmount >= 0
      )
    ) {
      return NextResponse.json({ error: 'Commissions corrigées invalides.' }, { status: 400 })
    }

    const { error } = await authorization.supabase.rpc(
      'record_artwork_commission_correction_invoice',
      {
        p_calendar_year: body.calendarYear,
        p_company: body.company,
        p_invoiced_at: invoicedAt,
        p_invoice_url: invoiceUrl,
        p_created_by: authorization.userId,
        p_artwork_commissions: artworkCommissions.map((item) => ({
          artwork_id: item.artworkId,
          commission_amount: item.commissionAmount,
        })),
      }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({
      correctionInvoice: {
        calendar_year: body.calendarYear,
        company: body.company,
        invoiced_at: invoicedAt,
        invoice_url: invoiceUrl ?? null,
      },
    })
  }

  return NextResponse.json({ error: 'Facture invalide.' }, { status: 400 })
}

export async function DELETE(request: NextRequest) {
  const authorization = await requireRole(EDITOR_ROLES, request)
  if (authorization.response) return authorization.response

  const body = await request.json()

  if (body?.kind === 'artwork' && typeof body.artworkId === 'string') {
    const { error } = await authorization.supabase
      .from('artwork_commission_invoices')
      .delete()
      .eq('artwork_id', body.artworkId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    await logAuditEvent({
      actorId: authorization.userId,
      action: 'artwork_commission_invoice_delete',
      outcome: 'success',
      subjectType: 'artwork',
      subjectId: body.artworkId,
    })

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Suppression de facture invalide.' }, { status: 400 })
}
