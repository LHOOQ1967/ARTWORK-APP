import { describe, expect, it } from 'vitest'
import { isSothebysLot, parseSothebysLot, sothebysImageUrl, sothebysLotUrl } from '@/lib/imports/sothebys'
import { lotHtml, parsedLot, sourceUrl } from '../fixtures/sothebysLot'

describe("Sotheby's auction lot parser", () => {
  it('extracts the selected lot, all gallery images, auction estimates and local sale time', () => {
    expect(parseSothebysLot(lotHtml(), sourceUrl)).toEqual(parsedLot)
  })

  it('does not mistake lifetime dates for execution or recommendations for gallery images', () => {
    const lot = parseSothebysLot(lotHtml(), sourceUrl)
    expect(lot.year).toBe(1906)
    expect(lot.images).toHaveLength(2)
    expect(lot.notes).not.toContain('Do not import')
    expect(lot.notes).not.toContain('Unrelated')
    expect(lot.notes).not.toMatch(/Auction:|Auction location:|Source:|https:/)
    expect(lot.source_url).toBe(sourceUrl)
  })

  it('leaves notes empty when no execution detail is published', () => {
    expect(parseSothebysLot(lotHtml({ description: '<p>oil on canvas</p>' }), sourceUrl).notes).toBe('')
  })

  it('uses the timezone published in Sotheby\'s location metadata', () => {
    const html = lotHtml().replace('"location":"New York"', '"location":"Sale room","locationV2":{"displayLocation":{"name":"London","timezone":"Europe/London"}}')
    expect(parseSothebysLot(html, sourceUrl)).toMatchObject({
      location: 'London', sale_date: '2026-11-18', sale_time: '23:00',
    })
  })

  it('preserves date ranges and three dimensions without inventing unpublished estimates', () => {
    const lot = parseSothebysLot(lotHtml({
      description: '<p>bronze</p><p>12,5 x 20 x 8 cm.</p><p>Executed circa 1938-1940.</p>',
      estimateV2: { __typename: 'EstimateUponRequest' }, session: {},
    }), sourceUrl)
    expect(lot).toMatchObject({
      year: 1940, year_start: 1938, height_cm: 12.5, width_cm: 20, depth_cm: 8,
      estimate_low: null, estimate_high: null, sale_date: null, sale_time: null,
    })
    expect(lot.notes).toContain('circa 1938-1940')
  })

  it('rejects unsupported or blocked page formats explicitly', () => {
    expect(() => parseSothebysLot('<html>Verify you are human</html>', sourceUrl)).toThrow('readable lot data')
    expect(() => parseSothebysLot('<script id="__NEXT_DATA__">invalid</script>', sourceUrl)).toThrow('invalid lot data')
  })

  it.each([
    'http://www.sothebys.com/en/buy/auction/2026/sale/lot',
    'https://www.sothebys.com.evil.test/en/buy/auction/2026/sale/lot',
    'https://user:pass@www.sothebys.com/en/buy/auction/2026/sale/lot',
    'https://localhost/en/buy/auction/2026/sale/lot',
    'https://www.sothebys.com:444/en/buy/auction/2026/sale/lot',
    'https://www.sothebys.com/en/buy/_private-sale',
  ])('rejects unsupported page URL %s', url => {
    expect(() => sothebysLotUrl(url)).toThrow()
  })

  it('normalizes the page URL and rejects unrelated image hosts', () => {
    expect(sothebysLotUrl(sourceUrl.replace('www.', '') + '#details')).toBe(sourceUrl)
    expect(() => sothebysImageUrl('https://localhost/image.jpg')).toThrow()
    expect(() => sothebysImageUrl('https://sothebys-md.brightspotcdn.com.evil.test/x.jpg')).toThrow()
    expect(isSothebysLot(parsedLot)).toBe(true)
    expect(isSothebysLot({ ...parsedLot, estimate_low: 'unknown' })).toBe(false)
  })
})
