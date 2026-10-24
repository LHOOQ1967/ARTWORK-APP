import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { auctionCities, auctionHouseKey, isPremiumCalculation, isRecord, isValidSaleDate } from '@/lib/auctionPremium'

export async function POST(request: Request) {
  const authorization = await requireRole(['Editor', 'Administrator'], request)
  if (authorization.response) return authorization.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request' }, { status: 400 })
  }
  if (!isRecord(body) || typeof body.houseId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.houseId) ||
      !isValidSaleDate(body.date) ||
      (body.field !== 'hammer' && body.field !== 'total') ||
      typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount < 0 || body.amount > 1e15) {
    return NextResponse.json({ error: 'A valid auction house, sale date, input field and non-negative amount are required' }, { status: 400 })
  }
  if (typeof body.currency !== 'string' || !Object.hasOwn(auctionCities, body.currency)) {
    return NextResponse.json({ error: 'Automatic calculation supports USD, GBP, HKD and EUR only. Enter both amounts manually for other currencies.' }, { status: 422 })
  }

  const { data: contact, error } = await authorization.supabase
    .from('contacts')
    .select('company_name, first_name, last_name')
    .eq('id', body.houseId)
    .maybeSingle()
  if (error) {
    console.error('Failed to load premium calculator auction house', error)
    return NextResponse.json({ error: 'Failed to load auction house' }, { status: 500 })
  }
  if (!contact) {
    return NextResponse.json({ error: 'Auction house not found or not accessible' }, { status: 404 })
  }
  const house = contact.company_name?.trim() ||
    [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim()
  if (!house) {
    return NextResponse.json({ error: 'Auction house has no name' }, { status: 422 })
  }

  try {
    const response = await fetch('https://buyerspremium.blondeau.ch/api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        house, currency: body.currency, date: body.date, field: body.field, amount: body.amount,
      }),
    })
    const result: unknown = await response.json()
    if (!response.ok) {
      if ((response.status === 400 || response.status === 422) &&
          isRecord(result) && typeof result.error === 'string') {
        return NextResponse.json({ error: result.error }, { status: 422 })
      }
      throw new Error(`Premium calculator HTTP ${response.status}`)
    }
    if (!isPremiumCalculation(result) ||
        auctionHouseKey(result.house) !== auctionHouseKey(house) ||
        result.currency !== body.currency || result.date !== body.date ||
        result.field !== body.field || result.amount !== body.amount ||
        result.schedule.valid_from > body.date ||
        (result.schedule.valid_to !== null && result.schedule.valid_to < body.date) ||
        Math.abs((body.field === 'hammer' ? result.hammer : result.total) - body.amount) > 0.011) {
      throw new Error('Invalid premium calculator response')
    }
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (cause) {
    console.error('Buyer premium calculator request failed', cause)
    return NextResponse.json({
      error: 'The buyer premium calculator is unavailable. Enter both amounts manually or retry.',
    }, { status: 502 })
  }
}
