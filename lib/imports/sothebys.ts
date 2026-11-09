import { parseBlondeauSheetText } from '@/lib/blondeauSheet'
import { amount, htmlLines, record, text, localSaleDate, type AuctionImage, type AuctionLot } from './auction'
export { record, isAuctionLot as isSothebysLot } from './auction'
export type { AuctionLot as SothebysLot, AuctionImage as SothebysImage, AuctionContactDefaults as SothebysContactDefaults } from './auction'

export function sothebysLotUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2000) throw new Error('Enter a Sotheby\'s auction lot URL.')
  let url: URL
  try { url = new URL(value) } catch { throw new Error('Enter a valid Sotheby\'s auction lot URL.') }
  if (url.protocol !== 'https:' || !['www.sothebys.com', 'sothebys.com'].includes(url.hostname) ||
    url.port || url.username || url.password ||
    !/^\/en\/buy\/auction\/\d{4}\/[^/]+\/[^/]+\/?$/.test(url.pathname)) {
    throw new Error('Use an English Sotheby\'s auction lot URL starting with https://www.sothebys.com/en/buy/auction/.')
  }
  url.hostname = 'www.sothebys.com'
  url.search = '?locale=en'
  url.hash = ''
  return url.toString()
}

export function sothebysImageUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4000) throw new Error('Invalid Sotheby\'s image URL.')
  let url: URL
  try { url = new URL(value) } catch { throw new Error('Invalid Sotheby\'s image URL.') }
  if (url.protocol !== 'https:' || url.hostname !== 'sothebys-md.brightspotcdn.com' ||
    url.username || url.password || url.port) throw new Error('Unsupported Sotheby\'s image host.')
  return url.toString()
}

export function parseSothebysLot(html: string, source: string): AuctionLot {
  const sourceUrl = sothebysLotUrl(source)
  const script = /<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/i.exec(html)
  if (!script) throw new Error('Sotheby\'s did not provide readable lot data. The page may be unavailable or require browser verification.')
  let data: unknown
  try { data = JSON.parse(script[1]) } catch { throw new Error('Sotheby\'s returned invalid lot data.') }
  const props = record(data) && record(data.props) && record(data.props.pageProps) ? data.props.pageProps : null
  if (!props || !record(props.apolloCache)) throw new Error('This Sotheby\'s lot page format is not supported.')
  const cache = props.apolloCache
  const nodes = Object.values(cache).filter(record)
  const lot = nodes.find(node => node.__typename === 'LotV2' && node.lotId === props.lotId)
  const auction = nodes.find(node => node.__typename === 'Auction' && node.auctionId === props.auctionId)
  if (!lot || !auction || !text(lot.title) || !text(lot.creatorsDisplayTitle)) {
    throw new Error('The artwork and auction details could not be identified on this page.')
  }
  const description = htmlLines(text(lot.description) ?? '')
  const fields = parseBlondeauSheetText(description)
  const dimension = /(\d+(?:[.,]\d+)?)\s*(?:by|x|×)\s*(\d+(?:[.,]\d+)?)(?:\s*(?:by|x|×)\s*(\d+(?:[.,]\d+)?))?\s*cm\b/i.exec(description)
  const estimate = record(lot.estimateV2) ? lot.estimateV2 : {}
  const sessionValue = record(lot.session) ? lot.session : {}
  const referencedSession = typeof sessionValue.__ref === 'string' ? cache[sessionValue.__ref] : null
  const session = record(referencedSession) ? referencedSession : sessionValue
  const locationValue = record(auction.locationV2) ? auction.locationV2 : {}
  const referencedLocation = typeof locationValue.__ref === 'string' ? cache[locationValue.__ref] : null
  const location = record(referencedLocation) ? referencedLocation : locationValue
  const displayValue = record(location.displayLocation) ? location.displayLocation : {}
  const referencedDisplay = typeof displayValue.__ref === 'string' ? cache[displayValue.__ref] : null
  const displayLocation = record(referencedDisplay) ? referencedDisplay : displayValue
  const saleLocation = text(displayLocation.name) ?? text(location.name) ?? text(auction.location)
  const images: AuctionImage[] = []
  for (const [key, media] of Object.entries(lot)) {
    if (!/^media(?:\(|$)/.test(key) || !record(media) || !Array.isArray(media.images)) continue
    for (const image of media.images) {
      if (!record(image) || !Array.isArray(image.renditions)) continue
      const renditions = image.renditions.filter(record).filter(item => typeof item.width === 'number' && item.width > 0)
        .sort((a, b) => Number(b.width) - Number(a.width))
      const rendition = renditions.find(item => Number(item.width) <= 2048) ?? renditions.at(-1)
      if (!rendition) throw new Error('A Sotheby\'s gallery image has no usable rendition.')
      const url = sothebysImageUrl(rendition.url)
      if (!images.some(item => item.url === url)) images.push({ url, label: text(image.title) ?? `Sotheby's image ${images.length + 1}` })
    }
  }
  if (images.length > 30) throw new Error('This lot has more than 30 images and cannot be imported in one operation.')
  const execution = description.split('\n').find(line => /^(?:executed|painted|created|dated)\b/i.test(line))
  return {
    source_url: sourceUrl,
    artist_name: String(lot.creatorsDisplayTitle).trim(),
    title: String(lot.title).trim(),
    medium: fields.medium,
    signature: fields.signature,
    edition: fields.edition,
    year: fields.year_execution,
    year_start: fields.year_execution_start,
    height_cm: dimension ? Number(dimension[1].replace(',', '.')) : null,
    width_cm: dimension ? Number(dimension[2].replace(',', '.')) : null,
    depth_cm: dimension?.[3] ? Number(dimension[3].replace(',', '.')) : null,
    lot: record(lot.lotNumber) ? text(lot.lotNumber.lotDisplayNumber) : null,
    estimate_low: amount(estimate.lowEstimate),
    estimate_high: amount(estimate.highEstimate),
    auction_currency: text(auction.currencyV2) ?? text(auction.currency),
    ...localSaleDate(text(session.scheduledOpeningDate), saleLocation, text(displayLocation.timezone)),
    auction_title: text(auction.title),
    location: saleLocation,
    notes: execution ? `Execution date: ${execution}` : '',
    images,
  }
}
