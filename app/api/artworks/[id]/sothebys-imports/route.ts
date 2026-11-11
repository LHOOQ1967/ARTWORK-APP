import { attachAuctionLot } from '@/lib/imports/attachAuctionLot'
import { fetchSothebysBytes, fetchSothebysLot } from '@/lib/imports/fetchSothebys'
import { sothebysImageUrl, sothebysLotUrl } from '@/lib/imports/sothebys'

export const runtime = 'nodejs'
export const maxDuration = 300
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return attachAuctionLot(request, context, {
    provider: 'sothebys', lotUrl: sothebysLotUrl, imageUrl: sothebysImageUrl,
    fetchLot: fetchSothebysLot, fetchBytes: fetchSothebysBytes,
  })
}
