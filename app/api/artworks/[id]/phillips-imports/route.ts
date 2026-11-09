import { attachAuctionLot } from '@/lib/imports/attachAuctionLot'
import { fetchPhillipsBytes, fetchPhillipsLot } from '@/lib/imports/fetchPhillips'
import { phillipsImageUrl, phillipsLotUrl } from '@/lib/imports/phillips'

export const runtime = 'nodejs'
export const maxDuration = 300
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return attachAuctionLot(request, context, {
    provider: 'phillips', lotUrl: phillipsLotUrl, imageUrl: phillipsImageUrl,
    fetchLot: fetchPhillipsLot, fetchBytes: fetchPhillipsBytes,
  })
}
