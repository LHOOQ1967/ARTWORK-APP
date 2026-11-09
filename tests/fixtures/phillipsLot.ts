import type { AuctionLot } from '@/lib/imports/auction'

export const sourceUrl = 'https://www.phillips.com/detail/amedeo-modigliani/241743'
export const imageUrl = (index: number) => `https://dist.phillips.com/auction-assets/NY010726/241743_00${index}.jpg`
export const routeKey = 'routes/($lang).detail.($maker).($seoName).($auctionCode).$lotOrObjectNumber'

export function lotHtml(lotOverrides: Record<string, unknown> = {}, auctionOverrides: Record<string, unknown> = {}) {
  const lot = {
    objectNumber: '241743', lotNumber: 9, lotNumberFull: '9', auctionId: 2043,
    lotType: 'AuctionLot', makerName: 'Amedeo Modigliani', description: 'Tête',
    estimate: {
      mainEstimate: { currencyCode: 'USD', lowEstimate: 28000000, highEstimate: 35000000 },
      otherEstimates: [{ currencyCode: 'EUR', lowEstimate: 25030000, highEstimate: 31290000 }],
    },
    auctionCurrency: { currencyCode: 'USD' }, medium: 'limestone',
    dimensions: '29 x 12 x 9 in. (73.7 x 30.5 x 22.9 cm)',
    sigEdtMan: 'Executed in 1911–1912, in Paris.\r\n\r\nPriority Bidding is here! Learn more.',
    mainImagePath: imageUrl(1), additionalImagePaths: [imageUrl(2), imageUrl(3)],
    videoSource: 'https://players.brightcove.net/test/video.html?videoId=123',
    videoPoster: 'https://dist.phillips.com/auction-assets/NY010726/video-poster.jpg',
    enhancedLotComponents: [{ type: 'video', src: 'https://video.test/video.mp4', poster: imageUrl(9) }],
    provenance: 'Private collection, acquired 1968',
    literature: 'Catalogue essay 1970',
    ...lotOverrides,
  }
  const auction = {
    auctionId: 2043, auctionCode: 'NY010726',
    auctionName: 'Modern & Contemporary Art Evening Sale',
    auctionLocation: 'New York', auctionTimezone: 'America/New_York',
    auctionStartDateTime: '2026-11-17T21:30:00.000000Z',
    bannerImage: imageUrl(8),
    lots: [{ objectNumber: 'other', mainImagePath: imageUrl(9) }],
    ...auctionOverrides,
  }
  const pool: unknown[] = []
  function encode(value: unknown): number {
    if (value === undefined) return -7
    const index = pool.length
    pool.push(null)
    if (Array.isArray(value)) pool[index] = value.map(encode)
    else if (value !== null && typeof value === 'object') {
      pool[index] = Object.fromEntries(Object.entries(value).map(([key, child]) => [`_${encode(key)}`, encode(child)]))
    } else pool[index] = value
    return index
  }
  encode({ loaderData: { root: { metadata: 'ignored' }, [routeKey]: { lot, auction } }, actionData: undefined })
  return `<html><script>window.__reactRouterContext.streamController.enqueue(${JSON.stringify(JSON.stringify(pool))});</script></html>`
}

export const parsedLot: AuctionLot = {
  source_url: sourceUrl, artist_name: 'Amedeo Modigliani', title: 'Tête',
  medium: 'limestone', signature: null, edition: null,
  year: 1912, year_start: 1911, height_cm: 73.7, width_cm: 30.5, depth_cm: 22.9,
  lot: '9', estimate_low: 28000000, estimate_high: 35000000, auction_currency: 'USD',
  sale_date: '2026-11-17', sale_time: '16:30',
  auction_title: 'Modern & Contemporary Art Evening Sale', location: 'New York',
  notes: 'Execution date: Executed in 1911–1912, in Paris.',
  images: [1, 2, 3].map(index => ({
    url: `${imageUrl(index)}?fit=bounds&width=2048&height=2048`, label: `Phillips image ${index}`,
  })),
}
