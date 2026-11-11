import { attachAuctionLot } from '@/lib/imports/attachAuctionLot'
import { fetchChristiesBytes, fetchChristiesLot } from '@/lib/imports/fetchChristies'
import { christiesImageUrl, christiesLotUrl } from '@/lib/imports/christies'

export const runtime = 'nodejs'
export const maxDuration = 300
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return attachAuctionLot(request, context, {
    provider: 'christies', lotUrl: christiesLotUrl, imageUrl: christiesImageUrl,
    fetchLot: fetchChristiesLot, fetchBytes: fetchChristiesBytes,
  })
}
