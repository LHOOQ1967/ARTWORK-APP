import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { fetchSothebysLot } from '@/lib/imports/fetchSothebys'
import { record, sothebysLotUrl } from '@/lib/imports/sothebys'
import { resolveAuctionContact } from '@/lib/imports/auctionContact'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const authorization = await requireRole(['Editor', 'Administrator'], request)
  if (authorization.response) return authorization.response
  let url: string
  try {
    const body: unknown = await request.json()
    url = sothebysLotUrl(record(body) ? body.url : null)
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Invalid import request.' }, { status: 400 })
  }
  try {
    const lot = await fetchSothebysLot(url)
    const contactDefaults = await resolveAuctionContact(authorization.supabase, lot.auction_currency, 'sothebys')
    return NextResponse.json({ ...lot, contact_defaults: contactDefaults })
  } catch (cause) {
    console.error('SOTHEBYS LOT IMPORT ERROR:', cause)
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Could not read the Sotheby\'s lot.' }, { status: 502 })
  }
}
