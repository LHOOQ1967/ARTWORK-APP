import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { fetchPhillipsLot } from '@/lib/imports/fetchPhillips'
import { phillipsLotUrl } from '@/lib/imports/phillips'
import { record } from '@/lib/imports/auction'
import { resolveAuctionContact } from '@/lib/imports/auctionContact'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const authorization = await requireRole(['Editor', 'Administrator'], request)
  if (authorization.response) return authorization.response
  let url: string
  try {
    const body: unknown = await request.json()
    url = phillipsLotUrl(record(body) ? body.url : null)
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Invalid import request.' }, { status: 400 })
  }
  try {
    const lot = await fetchPhillipsLot(url)
    const contactDefaults = await resolveAuctionContact(authorization.supabase, lot.auction_currency, 'phillips')
    return NextResponse.json({ ...lot, contact_defaults: contactDefaults })
  } catch (cause) {
    console.error('PHILLIPS LOT IMPORT ERROR:', cause)
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Could not read the Phillips lot.' }, { status: 502 })
  }
}
