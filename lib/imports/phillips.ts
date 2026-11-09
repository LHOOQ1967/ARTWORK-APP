import { parseBlondeauSheetText } from '@/lib/blondeauSheet'
import { amount, htmlLines, localSaleDate, record, text, type AuctionImage, type AuctionLot } from './auction'

export function phillipsLotUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2000) throw new Error('Enter a Phillips auction lot URL.')
  let url: URL
  try { url = new URL(value) } catch { throw new Error('Enter a valid Phillips auction lot URL.') }
  if (url.protocol !== 'https:' || !['www.phillips.com', 'phillips.com'].includes(url.hostname) ||
    url.port || url.username || url.password || !/^\/detail\/[^/]+\/\d+\/?$/.test(url.pathname)) {
    throw new Error('Use a Phillips lot URL starting with https://www.phillips.com/detail/.')
  }
  url.hostname = 'www.phillips.com'
  url.pathname = url.pathname.replace(/\/$/, '')
  url.search = ''
  url.hash = ''
  return url.toString()
}

export function phillipsImageUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4000) throw new Error('Invalid Phillips image URL.')
  let url: URL
  try { url = new URL(value) } catch { throw new Error('Invalid Phillips image URL.') }
  if (url.protocol !== 'https:' || url.hostname !== 'dist.phillips.com' || url.username || url.password || url.port ||
    !/^\/auction-assets\/[^/]+\/[^/]+\.(?:jpe?g|png|webp)$/i.test(url.pathname)) {
    throw new Error('Unsupported Phillips image host or path.')
  }
  url.search = '?fit=bounds&width=2048&height=2048'
  url.hash = ''
  return url.toString()
}

function routerLot(html: string, objectNumber: string) {
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const chunk of script[1].matchAll(/window\.__reactRouterContext\.streamController\.enqueue\(("(?:\\.|[^"\\])*")\)/g)) {
      let pool: unknown
      try { pool = JSON.parse(JSON.parse(chunk[1])) }
      catch { throw new Error('Phillips returned invalid lot data.') }
      if (!Array.isArray(pool)) continue
      const values: unknown[] = pool
      // React Router encodes object keys and values as references into a flat table.
      const readObject = (value: unknown): Record<string, unknown> => {
        if (!record(value)) return {}
        const result: Record<string, unknown> = {}
        for (const [key, reference] of Object.entries(value)) {
          if (!/^_\d+$/.test(key) || typeof reference !== 'number' || !Number.isInteger(reference)) {
            throw new Error('This Phillips page data format is not supported.')
          }
          const name = values[Number(key.slice(1))]
          if (typeof name !== 'string') throw new Error('Phillips returned an invalid data reference.')
          Object.defineProperty(result, name, { value: reference >= 0 ? values[reference] : null, enumerable: true })
        }
        return result
      }
      const root = readObject(values[0])
      const loaders = readObject(root.loaderData)
      for (const [key, value] of Object.entries(loaders)) {
        if (!key.startsWith('routes/') || !key.includes('.detail.')) continue
        const route = readObject(value)
        const lot = readObject(route.lot)
        const auction = readObject(route.auction)
        if (String(lot.objectNumber) !== objectNumber) continue
        if (lot.lotType !== 'AuctionLot' || lot.auctionId !== auction.auctionId) {
          throw new Error('The Phillips lot and auction could not be matched.')
        }
        const estimate = readObject(readObject(lot.estimate).mainEstimate)
        const currency = readObject(lot.auctionCurrency)
        const images = Array.isArray(lot.additionalImagePaths) ? lot.additionalImagePaths.map(reference => {
          if (typeof reference !== 'number' || !Number.isInteger(reference) || reference < 0) {
            throw new Error('Phillips returned an invalid gallery image reference.')
          }
          return values[reference]
        }) : []
        return { lot, auction, estimate, currency, images }
      }
    }
  }
  throw new Error('Phillips did not provide readable data for this lot. The page may be unavailable or require browser verification.')
}

export function parsePhillipsLot(html: string, source: string): AuctionLot {
  const sourceUrl = phillipsLotUrl(source)
  const objectNumber = new URL(sourceUrl).pathname.split('/').at(-1)!
  const { lot, auction, estimate, currency, images: additionalImages } = routerLot(html, objectNumber)
  const artist = text(lot.makerName)
  const title = text(lot.description)
  if (!artist || !title) throw new Error('The Phillips artist and artwork title could not be identified.')
  const description = htmlLines(text(lot.sigEdtMan) ?? '')
  const execution = description.split('\n').find(line => /^(?:executed|painted|created|dated)\b.*\b\d{4}\b/i.test(line))
  const years = parseBlondeauSheetText(execution ?? '')
  const fields = parseBlondeauSheetText(description)
  const dimensions = htmlLines(text(lot.dimensions) ?? '')
  const dimension = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×]\s*(\d+(?:[.,]\d+)?))?\s*cm\b/i.exec(dimensions)
  const images: AuctionImage[] = []
  for (const image of [lot.mainImagePath, ...additionalImages]) {
    if (image === null || image === undefined || image === '') continue
    // Video URLs and their poster frames are separate fields and are never read.
    const url = phillipsImageUrl(image)
    if (!images.some(item => item.url === url)) images.push({ url, label: `Phillips image ${images.length + 1}` })
  }
  if (images.length > 30) throw new Error('This lot has more than 30 images and cannot be imported in one operation.')
  return {
    source_url: sourceUrl, artist_name: htmlLines(artist), title: htmlLines(title),
    medium: text(lot.medium) ? htmlLines(String(lot.medium)) : null,
    signature: fields.signature ?? description.split('\n').find(line => /^(?:incised|inscribed|stamped)\b/i.test(line)) ?? null,
    edition: fields.edition,
    year: years.year_execution, year_start: years.year_execution_start,
    height_cm: dimension ? Number(dimension[1].replace(',', '.')) : null,
    width_cm: dimension ? Number(dimension[2].replace(',', '.')) : null,
    depth_cm: dimension?.[3] ? Number(dimension[3].replace(',', '.')) : null,
    lot: text(lot.lotNumberFull) ?? (typeof lot.lotNumber === 'number' ? String(lot.lotNumber) : null),
    estimate_low: amount(estimate.lowEstimate), estimate_high: amount(estimate.highEstimate),
    auction_currency: text(currency.currencyCode) ?? text(estimate.currencyCode),
    ...localSaleDate(text(auction.auctionStartDateTime), text(auction.auctionLocation), text(auction.auctionTimezone)),
    auction_title: text(auction.auctionName), location: text(auction.auctionLocation),
    notes: execution ? `Execution date: ${execution}` : '',
    images,
  }
}
