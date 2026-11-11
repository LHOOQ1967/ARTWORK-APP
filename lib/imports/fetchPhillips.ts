import { fetchAuctionBytes } from './fetchAuction'
import { parsePhillipsLot, phillipsImageUrl, phillipsLotUrl } from './phillips'

export function fetchPhillipsBytes(url: string, kind: 'page' | 'image') {
  return fetchAuctionBytes(url, kind, 'Phillips', kind === 'page' ? phillipsLotUrl : phillipsImageUrl)
}

export async function fetchPhillipsLot(url: string) {
  const source = phillipsLotUrl(url)
  return parsePhillipsLot(new TextDecoder().decode(await fetchPhillipsBytes(source, 'page')), source)
}
