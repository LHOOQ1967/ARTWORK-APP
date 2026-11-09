import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { fetchChristiesLot } from '@/lib/imports/fetchChristies'
import { christiesLotUrl } from '@/lib/imports/christies'
import { record } from '@/lib/imports/auction'
import { resolveAuctionContact } from '@/lib/imports/auctionContact'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const authorization = await requireRole(['Editor', 'Administrator'], request)
  if (authorization.response) return authorization.response
  let url: string
  try {
    const body: unknown = await request.json()
    url = christiesLotUrl(record(body) ? body.url : null)
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Invalid import request.' }, { status: 400 })
  }
  try {
    const lot = await fetchChristiesLot(url)
    const contactDefaults = await resolveAuctionContact(authorization.supabase, lot.auction_currency, 'christies')
    return NextResponse.json({ ...lot, contact_defaults: contactDefaults })
  } catch (cause) {
    console.error('CHRISTIES LOT IMPORT ERROR:', cause)
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Could not read the Christie\'s lot.' }, { status: 502 })
  }
}
