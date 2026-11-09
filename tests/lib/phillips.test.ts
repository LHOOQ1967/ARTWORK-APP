import { describe, expect, it } from 'vitest'
import { parsePhillipsLot, phillipsImageUrl, phillipsLotUrl } from '@/lib/imports/phillips'
import { isAuctionLot } from '@/lib/imports/auction'
import { imageUrl, lotHtml, parsedLot, sourceUrl } from '../fixtures/phillipsLot'

describe('Phillips lot extraction', () => {
  it('extracts the exact lot, primary currency, dimensions, execution range and local sale time', () => {
    const lot = parsePhillipsLot(lotHtml(), sourceUrl)
    expect(lot).toEqual(parsedLot)
    expect(isAuctionLot(lot)).toBe(true)
    expect(lot.notes).not.toMatch(/Auction:|Source:|https:|Priority Bidding|1968|1970/)
  })

  it('ignores videos, video poster frames, auction banners and other lots', () => {
    const lot = parsePhillipsLot(lotHtml({
      videoSource: 'https://localhost/secret',
      videoPoster: 'https://localhost/poster.jpg',
      enhancedLotComponents: [{ type: 'video', src: 'javascript:throw new Error()' }],
    }), sourceUrl)
    expect(lot.images).toEqual(parsedLot.images)
    expect(lot.images).toHaveLength(3)
  })

  it('can import a video-only lot without offering any images or video thumbnails', () => {
    const lot = parsePhillipsLot(lotHtml({ mainImagePath: null, additionalImagePaths: [] }), sourceUrl)
    expect(lot.images).toEqual([])
  })

  it('extracts signatures and editions independently from execution dates and marketing', () => {
    expect(parsePhillipsLot(lotHtml({
      sigEdtMan: "signed 'AM' lower right\r\nEdition: 3/10\r\nExecuted in 1912.\r\nMarketing text.",
    }), sourceUrl)).toMatchObject({
      signature: "signed 'AM' lower right", edition: '3/10', year: 1912, year_start: null,
      notes: 'Execution date: Executed in 1912.',
    })
  })

  it('deduplicates alternative image renditions', () => {
    const lot = parsePhillipsLot(lotHtml({ additionalImagePaths: [`${imageUrl(1)}?width=500`, imageUrl(2)] }), sourceUrl)
    expect(lot.images).toEqual(parsedLot.images.slice(0, 2))
  })

  it('leaves unpublished fields empty without using provenance dates or converted estimates', () => {
    expect(parsePhillipsLot(lotHtml({
      estimate: {}, medium: null, dimensions: null, sigEdtMan: '', lotNumberFull: null,
    }), sourceUrl)).toMatchObject({
      year: null, year_start: null, signature: null, edition: null, height_cm: null,
      medium: null, estimate_low: null, estimate_high: null, notes: '', lot: '9',
    })
  })

  it.each([
    { objectNumber: 'other' }, { lotType: 'PrivateSaleLot' }, { auctionId: 999 },
    { makerName: '' }, { description: '' },
  ])('rejects mismatched or unsupported lot data', overrides => {
    expect(() => parsePhillipsLot(lotHtml(overrides), sourceUrl)).toThrow()
  })

  it('uses the published auction timezone, including DST and date rollover', () => {
    expect(parsePhillipsLot(lotHtml({}, { auctionStartDateTime: '2026-06-17T00:30Z' }), sourceUrl))
      .toMatchObject({ sale_date: '2026-06-16', sale_time: '20:30' })
  })

  it('rejects excessive galleries and image URLs outside the allowlist', () => {
    expect(() => parsePhillipsLot(lotHtml({ additionalImagePaths: ['https://localhost/image.jpg'] }), sourceUrl)).toThrow('image')
    expect(() => parsePhillipsLot(lotHtml({
      additionalImagePaths: Array.from({ length: 31 }, (_, index) => imageUrl(index + 2)),
    }), sourceUrl)).toThrow('30 images')
  })

  it.each([
    '<html>Verify you are human</html>',
    '<script>window.__reactRouterContext.streamController.enqueue("bad json");</script>',
    '<script>window.__reactRouterContext.streamController.enqueue("[{\\"_999\\":1},{}]");</script>',
  ])('rejects blocked and malformed data without executing page scripts', html => {
    expect(() => parsePhillipsLot(html, sourceUrl)).toThrow()
  })

  it('normalizes lot URLs and bounded image renditions', () => {
    expect(phillipsLotUrl(`${sourceUrl.replace('www.', '')}/?utm_source=ref#details`)).toBe(sourceUrl)
    expect(phillipsImageUrl(`${imageUrl(1)}?width=99999#image`)).toBe(parsedLot.images[0].url)
  })

  it.each([
    'https://localhost/detail/amedeo-modigliani/241743',
    'http://www.phillips.com/detail/amedeo-modigliani/241743',
    'https://www.phillips.com.evil.test/detail/amedeo-modigliani/241743',
    'https://user:pass@www.phillips.com/detail/amedeo-modigliani/241743',
    'https://www.phillips.com:444/detail/amedeo-modigliani/241743',
    'https://www.phillips.com/auction/NY010726',
  ])('rejects unsupported lot URL %s', url => {
    expect(() => phillipsLotUrl(url)).toThrow()
  })

  it.each([
    'https://localhost/auction-assets/NY010726/241743_001.jpg',
    'https://dist.phillips.com.evil.test/auction-assets/NY010726/241743_001.jpg',
    'https://dist.phillips.com/auction-assets/NY010726/video.mp4',
    'https://dist.phillips.com/auction-assets/../../secret.jpg',
    'https://dist.phillips.com/auction-assets/NY010726/test.svg',
    'https://dist.phillips.com@localhost/auction-assets/NY010726/241743_001.jpg',
  ])('rejects unsupported media URL %s', url => {
    expect(() => phillipsImageUrl(url)).toThrow()
  })
})
