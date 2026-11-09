import { parseBlondeauSheetText } from '@/lib/blondeauSheet'
import { amount, htmlLines, record, text, localSaleDate, type AuctionImage, type AuctionLot } from './auction'

export function christiesLotUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2000) throw new Error('Enter a Christie\'s auction lot URL.')
  let url: URL
  try { url = new URL(value) } catch { throw new Error('Enter a valid Christie\'s auction lot URL.') }
  if (url.protocol !== 'https:' || !['www.christies.com', 'christies.com'].includes(url.hostname) ||
    url.port || url.username || url.password || !/^\/en\/lot\/lot-\d+\/?$/.test(url.pathname)) {
    throw new Error('Use an English Christie\'s lot URL starting with https://www.christies.com/en/lot/lot-.')
  }
  url.hostname = 'www.christies.com'
  url.pathname = url.pathname.replace(/\/$/, '')
  url.search = ''
  url.hash = ''
  return url.toString()
}

export function christiesImageUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4000) throw new Error('Invalid Christie\'s image URL.')
  let url: URL
  try { url = new URL(value) } catch { throw new Error('Invalid Christie\'s image URL.') }
  if (url.protocol !== 'https:' || url.hostname !== 'www.christies.com' || url.username || url.password || url.port ||
    !/^\/img\/LotImages\/.+\.(?:jpe?g|png|webp)$/i.test(url.pathname)) {
    throw new Error('Unsupported Christie\'s image host or path.')
  }
  url.search = '?mode=max&width=2048&height=2048'
  url.hash = ''
  return url.toString()
}

function headerJson(script: string, start: number): unknown {
  let depth = 0
  let quoted = false
  let escaped = false
  for (let index = start; index < script.length; index++) {
    const character = script[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quoted = false
    } else if (character === '"') quoted = true
    else if (character === '{') depth++
    else if (character === '}' && --depth === 0) {
      try { return JSON.parse(script.slice(start, index + 1)) }
      catch { throw new Error('Christie\'s returned invalid lot data.') }
    }
  }
  throw new Error('Christie\'s returned incomplete lot data.')
}

export function parseChristiesLot(html: string, source: string): AuctionLot {
  const sourceUrl = christiesLotUrl(source)
  const lotId = new URL(sourceUrl).pathname.split('lot-')[1]
  let lot: Record<string, unknown> | null = null
  let sale: Record<string, unknown> | null = null
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const assignment of script[1].matchAll(/window\.chrComponents\.lotHeader_\w+\s*=\s*(?=\{)/g)) {
      const header = headerJson(script[1], assignment.index + assignment[0].length)
      const data = record(header) && record(header.data) ? header.data : null
      const exactLot = data && Array.isArray(data.lots) ? data.lots.find(item => record(item) && item.object_id === lotId) : null
      if (record(exactLot) && data && record(data.sale)) {
        lot = exactLot
        sale = data.sale
        break
      }
    }
    if (lot) break
  }
  if (!lot || !sale || !text(lot.title_primary_txt) || !text(lot.title_secondary_txt)) {
    throw new Error('Christie\'s did not provide readable data for this lot. The page may be unavailable or require browser verification.')
  }
  const details = [...html.matchAll(/<chr-accordion-item\b[^>]*>([\s\S]*?)<\/chr-accordion-item>/gi)]
    .find(item => /<div\b[^>]*\bslot=["']header["'][^>]*>\s*Details\s*<\/div>/i.test(item[1]))
  if (!details) throw new Error('The Christie\'s artwork details section could not be identified.')
  const content = /<span\b[^>]*class=["'][^"']*\bchr-lot-section__accordion--text\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(details[1])
  if (!content) throw new Error('The Christie\'s artwork description could not be identified.')
  const description = htmlLines(content[1])
  const lines = description.split('\n')
  const fields = parseBlondeauSheetText(description)
  const dimension = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×]\s*(\d+(?:[.,]\d+)?))?\s*cm\b/i.exec(description)
  const images: AuctionImage[] = []
  const assets = Array.isArray(lot.lot_assets) ? lot.lot_assets.filter(record) : []
  for (const asset of assets) {
    if (asset.asset_type !== 'basic') continue
    const url = christiesImageUrl(asset.image_url)
    if (!images.some(image => image.url === url)) images.push({ url, label: `Christie's image ${images.length + 1}` })
  }
  if (images.length > 30) throw new Error('This lot has more than 30 images and cannot be imported in one operation.')
  const primaryImage = assets.find(asset => asset.asset_type === 'basic')
  const execution = lines.slice(2).find(line => /^(?:executed|painted|created|dated)\b.*\b\d{4}\b/i.test(line))
  const years = parseBlondeauSheetText(execution ?? '')
  const medium = fields.medium ?? lines.slice(2).find(line =>
    !/^(?:signed|incised|inscribed|stamped|numbered|edition|\d)/i.test(line) &&
    !/^(?:executed|painted|created|dated)\b.*\b\d{4}\b/i.test(line)) ?? null
  const estimatePublished = lot.estimate_visible === true && lot.estimate_on_request !== true
  const currency = /\b(?:USD|GBP|EUR|HKD|CHF|CNY|SGD|AED|JPY|AUD)\b/.exec(
    text(lot.estimate_txt) ?? text(lot.lot_estimate_txt) ?? '',
  )?.[0] ?? null
  const start = text(sale.start_date)
  return {
    source_url: sourceUrl,
    artist_name: String(lot.title_primary_txt).replace(/\s*\((?:\d{4}\s*[-–]\s*\d{4}|(?:b\.|born)\s*\d{4})\)\s*$/i, '').trim(),
    title: htmlLines(String(lot.title_secondary_txt)),
    medium,
    signature: fields.signature ?? lines.slice(2).find(line => /^(?:incised|inscribed|stamped)\b/i.test(line)) ?? null,
    edition: fields.edition,
    year: years.year_execution,
    year_start: years.year_execution_start,
    height_cm: dimension ? Number(dimension[1].replace(',', '.')) : amount(primaryImage?.height_cm),
    width_cm: dimension ? Number(dimension[2].replace(',', '.')) : amount(primaryImage?.width_cm),
    depth_cm: dimension?.[3] ? Number(dimension[3].replace(',', '.')) : null,
    lot: text(lot.lot_id_txt),
    estimate_low: estimatePublished ? amount(lot.estimate_low) : null,
    estimate_high: estimatePublished ? amount(lot.estimate_high) : null,
    auction_currency: currency,
    ...localSaleDate(start && /(?:Z|[+-]\d{2}:\d{2})$/i.test(start) ? start : null, text(sale.location_txt), text(sale.time_zone)),
    auction_title: text(sale.title_txt),
    location: text(sale.location_txt),
    notes: execution ? `Execution date: ${execution}` : '',
    images,
  }
}
