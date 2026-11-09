import { fetchAuctionBytes } from './fetchAuction'
import { parseSothebysLot, sothebysImageUrl, sothebysLotUrl } from './sothebys'

export function fetchSothebysBytes(url: string, kind: 'page' | 'image') {
  return fetchAuctionBytes(url, kind, "Sotheby's", kind === 'page' ? sothebysLotUrl : sothebysImageUrl)
}

export async function fetchSothebysLot(url: string) {
  const source = sothebysLotUrl(url)
  return parseSothebysLot(new TextDecoder().decode(await fetchSothebysBytes(source, 'page')), source)
}
