import type { SothebysLot } from '@/lib/imports/sothebys'

export const sourceUrl = 'https://www.sothebys.com/en/buy/auction/2026/test-auction/test-lot?locale=en'
export const images = [
  { url: 'https://sothebys-md.brightspotcdn.com/front.jpg', label: 'Front' },
  { url: 'https://sothebys-md.brightspotcdn.com/back.jpg', label: 'Back' },
]

export function lotHtml(overrides: Record<string, unknown> = {}) {
  const lot = {
    __typename: 'LotV2', lotId: 'target-lot', title: 'Nature morte',
    creatorsDisplayTitle: 'Test Artist',
    description: '<p>Test Artist</p><p>(1876 - 1958)</p><p>Nature morte</p><p>signed Artist (lower left)</p><p>oil on canvas</p><p>18 by 21 in. 47 by 55.5 cm.</p><p>Executed in 1906.</p>',
    lotNumber: { lotDisplayNumber: '1' },
    estimateV2: { lowEstimate: { amount: '2000000' }, highEstimate: { amount: '3000000' } },
    session: { __ref: 'Session:target' },
    'media({"imageSizes":["Large","ExtraLarge"]})': { images: images.map(image => ({
      title: image.label, renditions: [
        { width: 385, url: image.url.replace('.jpg', '-thumbnail.jpg') },
        { width: 2048, url: image.url },
        { width: 4096, url: image.url.replace('.jpg', '-large.jpg') },
      ],
    })) },
    recommendations: [{ title: 'Unrelated lot', images: [{ url: 'https://invalid.test/unrelated.jpg' }] }],
    provenance: '<p>Do not import this text.</p>',
    ...overrides,
  }
  return `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: {
      lotId: 'target-lot', auctionId: 'target-auction',
      apolloCache: {
        'LotV2:other': { __typename: 'LotV2', lotId: 'other', title: 'Wrong lot' },
        'LotV2:target': lot,
        'Auction:target': { __typename: 'Auction', auctionId: 'target-auction', title: 'Evening Auction', currency: 'USD', location: 'New York' },
        'Session:target': { scheduledOpeningDate: '2026-11-18T23:00Z' },
      },
    } },
  })}</script>`
}

export const parsedLot: SothebysLot = {
  source_url: sourceUrl, artist_name: 'Test Artist', title: 'Nature morte',
  medium: 'oil on canvas', signature: 'signed Artist (lower left)', edition: null,
  year: 1906, year_start: null, height_cm: 47, width_cm: 55.5, depth_cm: null,
  lot: '1', estimate_low: 2000000, estimate_high: 3000000, auction_currency: 'USD',
  sale_date: '2026-11-18', sale_time: '18:00', auction_title: 'Evening Auction', location: 'New York',
  notes: 'Execution date: Executed in 1906.',
  images,
}
