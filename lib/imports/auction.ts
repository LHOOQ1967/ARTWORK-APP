export type AuctionProvider = 'sothebys' | 'christies' | 'phillips'
export const auctionHouseNames = { sothebys: "Sotheby's", christies: "Christie's", phillips: 'Phillips' }

export type AuctionImage = { url: string; label: string }
export type AuctionContactDefaults = {
  contact_id: string
  location_address_id: string | null
  city: string | null
  warning: string | null
}
export type AuctionLot = {
  contact_defaults?: AuctionContactDefaults
  source_url: string
  artist_name: string
  title: string
  medium: string | null
  signature: string | null
  edition: string | null
  year: number | null
  year_start: number | null
  height_cm: number | null
  width_cm: number | null
  depth_cm: number | null
  lot: string | null
  estimate_low: number | null
  estimate_high: number | null
  auction_currency: string | null
  sale_date: string | null
  sale_time: string | null
  auction_title: string | null
  location: string | null
  notes: string
  images: AuctionImage[]
}
export type AuctionImportDraft = { provider: AuctionProvider; lot: AuctionLot }

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isAuctionLot(value: unknown): value is AuctionLot {
  if (!record(value)) return false
  const requiredText = ['source_url', 'artist_name', 'title', 'notes']
  const nullableText = ['medium', 'signature', 'edition', 'lot', 'auction_currency', 'sale_date', 'sale_time', 'auction_title', 'location']
  const nullableNumbers = ['year', 'year_start', 'height_cm', 'width_cm', 'depth_cm', 'estimate_low', 'estimate_high']
  const defaults = value.contact_defaults
  return (defaults === undefined || (record(defaults) && typeof defaults.contact_id === 'string' &&
    ['location_address_id', 'city', 'warning'].every(key => defaults[key] === null || typeof defaults[key] === 'string'))) &&
    requiredText.every(key => typeof value[key] === 'string') &&
    nullableText.every(key => value[key] === null || typeof value[key] === 'string') &&
    nullableNumbers.every(key => value[key] === null || (typeof value[key] === 'number' && Number.isFinite(value[key]))) &&
    Array.isArray(value.images) && value.images.every(item => record(item) && typeof item.url === 'string' && typeof item.label === 'string')
}

export function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function htmlLines(html: string): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', times: '×', ndash: '–', mdash: '—' }
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(?:p|div|li)>|<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (original, entity: string) => {
      if (entity.startsWith('#')) {
        const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : original
      }
      return entities[entity.toLowerCase()] ?? original
    })
    .split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
}

export function amount(value: unknown): number | null {
  const raw = record(value) ? value.amount : value
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  if (raw === '') return null
  const number = Number(raw)
  return Number.isFinite(number) && number >= 0 ? number : null
}

export function localSaleDate(dateString: string | null, location: string | null, publishedTimezone: string | null = null) {
  const cityTimezones: Record<string, string> = {
    'new york': 'America/New_York', london: 'Europe/London', paris: 'Europe/Paris',
    'hong kong': 'Asia/Hong_Kong', geneva: 'Europe/Zurich', zurich: 'Europe/Zurich',
    milan: 'Europe/Rome', rome: 'Europe/Rome', monaco: 'Europe/Monaco',
    amsterdam: 'Europe/Amsterdam', cologne: 'Europe/Berlin',
    dubai: 'Asia/Dubai', shanghai: 'Asia/Shanghai', beijing: 'Asia/Shanghai',
    singapore: 'Asia/Singapore', tokyo: 'Asia/Tokyo', sydney: 'Australia/Sydney',
    'los angeles': 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles',
  }
  const abbreviationTimezones: Record<string, string> = {
    EST: 'America/New_York', EDT: 'America/New_York',
    GMT: 'Europe/London', BST: 'Europe/London', HKT: 'Asia/Hong_Kong',
  }
  const date = dateString ? new Date(dateString) : null
  if (!dateString) return { sale_date: null, sale_time: null }
  if (!date || !Number.isFinite(date.getTime())) throw new Error('The auction sale date could not be read.')
  const city = location?.trim().toLowerCase() ?? ''
  const timeZone = publishedTimezone?.includes('/') ? publishedTimezone :
    Object.entries(cityTimezones).find(([name]) => city === name || city.startsWith(`${name},`))?.[1] ??
    (publishedTimezone ? abbreviationTimezones[publishedTimezone.toUpperCase()] : undefined)
  if (!timeZone) throw new Error('The sale location timezone could not be identified. The local sale time cannot be imported reliably.')
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value
  return {
    sale_date: parts.length ? `${part('year')}-${part('month')}-${part('day')}` : null,
    sale_time: parts.length ? `${part('hour')}:${part('minute')}` : null,
  }
}
