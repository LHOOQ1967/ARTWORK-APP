import { describe, expect, it } from 'vitest'
import { christiesImageUrl, christiesLotUrl, parseChristiesLot } from '@/lib/imports/christies'
import { isAuctionLot } from '@/lib/imports/auction'
import { details, imageUrl, lotHtml, parsedLot, sourceUrl } from '../fixtures/christiesLot'

describe("Christie's lot extraction", () => {
  it('extracts the exact lot, full sculpture dimensions, approximate year and six gallery images', () => {
    const lot = parseChristiesLot(lotHtml(), sourceUrl)
    expect(lot).toEqual(parsedLot)
    expect(isAuctionLot(lot)).toBe(true)
    expect(lot.notes).not.toContain('1984')
    expect(lot.notes).not.toMatch(/Auction:|Auction location:|Source:|https:/)
    expect(lot.source_url).toBe(sourceUrl)
    expect(lot.images.some(image => image.url.includes('calder_99'))).toBe(false)
  })

  it('uses only the selected lot header, not a recommended or mismatched lot', () => {
    expect(() => parseChristiesLot(lotHtml({ object_id: 'other' }), sourceUrl)).toThrow('this lot')
  })

  it('does not execute scripts and tolerates multiline JSON with braces inside strings', () => {
    const html = lotHtml({ title_secondary_txt: 'Untitled }; "test"', object_id: '6614727' })
      .replace('"lots":', '\n"lots":')
    expect(parseChristiesLot(html, sourceUrl).title).toBe('Untitled }; "test"')
  })

  it('uses gallery height/width without swapping axes when metric details are absent', () => {
    const lot = parseChristiesLot(lotHtml({}, details.replace(' (138.4 x 132.1 x 72.4 cm.)', '')), sourceUrl)
    expect([lot.height_cm, lot.width_cm, lot.depth_cm]).toEqual([138.4, 132.1, null])
  })

  it('preserves unknown fields as empty and does not use birth or provenance dates', () => {
    const lot = parseChristiesLot(lotHtml({
      estimate_visible: false, lot_assets: [], estimate_txt: '',
    }, 'ALEXANDER CALDER (1898-1976)<br>Untitled'), sourceUrl)
    expect([lot.year, lot.medium, lot.signature, lot.height_cm, lot.estimate_low, lot.auction_currency]).toEqual(
      [null, null, null, null, null, null],
    )
    expect(lot.images).toEqual([])
    expect(lot.notes).toBe('')
  })

  it('does not import unpublished estimates or on-request amounts', () => {
    const lot = parseChristiesLot(lotHtml({ estimate_on_request: true }), sourceUrl)
    expect([lot.estimate_low, lot.estimate_high]).toEqual([null, null])
  })

  it('distinguishes painted sculpture materials from an execution date', () => {
    const lot = parseChristiesLot(lotHtml({}, `TEST ARTIST (born 1950)<br>Abstract<br>
      incised 'TA' on the base<br>painted steel<br>Executed in 1980`), sourceUrl)
    expect(lot).toMatchObject({ medium: 'painted steel', signature: "incised 'TA' on the base", year: 1980 })
  })

  it('uses the sale location timezone, including daylight saving', () => {
    const lot = parseChristiesLot(lotHtml({}, details, { start_date: '2026-06-17T18:30:00-04:00' }), sourceUrl)
    expect([lot.sale_date, lot.sale_time]).toEqual(['2026-06-17', '18:30'])
    expect(parseChristiesLot(lotHtml({}, details, { start_date: '2026-11-17T18:30' }), sourceUrl).sale_time).toBeNull()
    const london = parseChristiesLot(lotHtml({}, details, {
      location_txt: 'London', start_date: '2026-06-17T17:30Z', time_zone: 'BST',
    }), sourceUrl)
    expect([london.sale_date, london.sale_time]).toEqual(['2026-06-17', '18:30'])
  })

  it('deduplicates gallery images and rejects unsupported media hosts and excessive galleries', () => {
    const image = { asset_type: 'basic', image_url: imageUrl(0) }
    expect(parseChristiesLot(lotHtml({ lot_assets: [image, image] }), sourceUrl).images).toHaveLength(1)
    expect(() => parseChristiesLot(lotHtml({ lot_assets: [{ ...image, image_url: 'https://localhost/a.jpg' }] }), sourceUrl)).toThrow('image')
    expect(() => parseChristiesLot(lotHtml({
      lot_assets: Array.from({ length: 31 }, (_, index) => ({ ...image, image_url: imageUrl(index) })),
    }), sourceUrl)).toThrow('30 images')
  })

  it.each([
    '<html>Verify you are human</html>',
    lotHtml().replace('{"data":', '{"data":bad,'),
    lotHtml().replace('>Details<', '>Provenance<'),
  ])('explicitly rejects blocked, malformed or unsupported pages', html => {
    expect(() => parseChristiesLot(html, sourceUrl)).toThrow()
  })

  it('normalizes the user link and bounds image rendition size', () => {
    expect(christiesLotUrl(`${sourceUrl.replace('www.', '')}/?ldp_breadcrumb=back#details`)).toBe(sourceUrl)
    expect(christiesImageUrl(`${imageUrl(0)}?width=99999#image`)).toBe(parsedLot.images[0].url)
  })

  it.each([
    'https://localhost/en/lot/lot-6614727',
    'http://www.christies.com/en/lot/lot-6614727',
    'https://www.christies.com.evil.test/en/lot/lot-6614727',
    'https://user:pass@www.christies.com/en/lot/lot-6614727',
    'https://www.christies.com:444/en/lot/lot-6614727',
    'https://www.christies.com/en/auction/sale-123',
    'https://www.christies.com/fr/lot/lot-6614727',
  ])('rejects invalid source URLs: %s', url => {
    expect(() => christiesLotUrl(url)).toThrow()
  })

  it.each([
    'https://www.christies.com/en/lot/lot-6614727',
    'https://christies.com/img/LotImages/test.jpg',
    'https://www.christies.com/img/LotImages/../../api/test.jpg',
    'https://www.christies.com/img/LotImages/test.svg',
    'https://www.christies.com@localhost/img/LotImages/test.jpg',
  ])('rejects invalid image URLs: %s', url => {
    expect(() => christiesImageUrl(url)).toThrow()
  })
})
