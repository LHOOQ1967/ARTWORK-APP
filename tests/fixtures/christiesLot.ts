import type { AuctionLot } from '@/lib/imports/auction'

export const sourceUrl = 'https://www.christies.com/en/lot/lot-6614727'
export const imageUrl = (index: number) => `https://www.christies.com/img/LotImages/2026/NYR/calder_${index}.jpg`
export const details = `ALEXANDER CALDER (1898-1976)<br><i>Untitled</i><br>
signed with the artist's monogram 'CA' (on the black element)<br>
standing mobile—sheet metal, wire, string and paint<br>
54 ½ x 52 x 28 ½ in. (138.4 x 132.1 x 72.4 cm.)<br>Executed <i>circa</i> 1940`

export function lotHtml(lotOverrides: Record<string, unknown> = {}, description = details, saleOverrides: Record<string, unknown> = {}) {
  const data = {
    lots: [{
      object_id: '6614727', lot_id_txt: '6 A',
      title_primary_txt: 'ALEXANDER CALDER (1898-1976)', title_secondary_txt: 'Untitled',
      estimate_visible: true, estimate_on_request: false,
      estimate_low: 4000000, estimate_high: 6000000, estimate_txt: 'USD 4,000,000 – USD 6,000,000',
      lot_assets: [
        ...Array.from({ length: 6 }, (_, index) => ({
          asset_type: 'basic', image_url: `${imageUrl(index)}?mode=max`, height_cm: '138.4', width_cm: '132.1',
        })),
        { asset_type: 'szi', image_url: '', url: 'https://www.christies-media.com/iframe' },
        { asset_type: 'video', image_url: imageUrl(0) },
      ],
      ...lotOverrides,
    }],
    sale: {
      title_txt: '20th Century Evening Sale ', location_txt: 'New York',
      start_date: '2026-11-17T23:30Z', ...saleOverrides,
    },
  }
  return `<html><script>window.chrComponents.lotHeader_123 = ${JSON.stringify({ data })};</script>
    <script>window.chrComponents.moreFrom = ${JSON.stringify({ data: {
      lots: [{ object_id: 'different-lot', title_secondary_txt: 'Wrong lot', lot_assets: [{ asset_type: 'basic', image_url: imageUrl(99) }] }],
    } })};</script>
    <chr-accordion-item><div slot="header">Details</div><div slot="content">
      <span class="chr-lot-section__accordion--text">${description}</span>
    </div></chr-accordion-item>
    <chr-accordion-item><div slot="header">Provenance</div>
      <span class="chr-lot-section__accordion--text">A different owner since 1984.</span>
    </chr-accordion-item></html>`
}

export const parsedLot: AuctionLot = {
  source_url: sourceUrl, artist_name: 'ALEXANDER CALDER', title: 'Untitled',
  medium: 'standing mobile—sheet metal, wire, string and paint',
  signature: "signed with the artist's monogram 'CA' (on the black element)",
  edition: null, year: 1940, year_start: null,
  height_cm: 138.4, width_cm: 132.1, depth_cm: 72.4,
  lot: '6 A', estimate_low: 4000000, estimate_high: 6000000, auction_currency: 'USD',
  sale_date: '2026-11-17', sale_time: '18:30',
  auction_title: '20th Century Evening Sale', location: 'New York',
  notes: 'Execution date: Executed circa 1940',
  images: Array.from({ length: 6 }, (_, index) => ({
    url: `${imageUrl(index)}?mode=max&width=2048&height=2048`, label: `Christie's image ${index + 1}`,
  })),
}
