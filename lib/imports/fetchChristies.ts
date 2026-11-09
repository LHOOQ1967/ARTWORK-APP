import { fetchAuctionBytes } from './fetchAuction'
import { christiesImageUrl, christiesLotUrl, parseChristiesLot } from './christies'

export function fetchChristiesBytes(url: string, kind: 'page' | 'image') {
  return fetchAuctionBytes(url, kind, "Christie's", kind === 'page' ? christiesLotUrl : christiesImageUrl)
}

export async function fetchChristiesLot(url: string) {
  const source = christiesLotUrl(url)
  return parseChristiesLot(new TextDecoder().decode(await fetchChristiesBytes(source, 'page')), source)
}
