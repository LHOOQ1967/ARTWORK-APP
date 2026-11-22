import { describe, expect, it } from 'vitest'
import { buildOutlookEventUrl, resolveAuctionCityTimeZone } from '@/lib/outlookEvent'

describe('buildOutlookEventUrl', () => {
  it('builds an Outlook compose deeplink with subject, location, times and body', () => {
    const url = buildOutlookEventUrl({
      title: 'Evening Sale',
      auctionHouse: 'Christie’s',
      city: 'Paris',
      auctionDateTime: '2026-03-12T14:30:00',
      url: 'https://example.com/sale',
      notes: 'Lots 12–18',
    })

    expect(url).not.toBeNull()
    const parsed = new URL(url!)
    expect(parsed.origin + parsed.pathname).toBe(
      'https://outlook.office.com/calendar/deeplink/compose'
    )
    expect(parsed.searchParams.get('rru')).toBe('addevent')
    expect(parsed.searchParams.get('subject')).toBe('Evening Sale – Christie’s')
    expect(parsed.searchParams.get('location')).toBe('Christie’s, Paris')
    expect(parsed.searchParams.get('body')).toBe('https://example.com/sale\n\nLots 12–18')
    // Paris is UTC+1 on 12 March (winter time).
    expect(parsed.searchParams.get('startdt')).toBe('2026-03-12T13:30:00.000Z')
    expect(parsed.searchParams.get('enddt')).toBe('2026-03-12T14:30:00.000Z')
  })

  it('converts the sale-city wall clock across timezones and DST', () => {
    const startdt = (city: string, auctionDateTime: string) => {
      const url = buildOutlookEventUrl({ title: 'Sale', city, auctionDateTime })
      return new URL(url!).searchParams.get('startdt')
    }

    // 13:00 London in summer (BST, UTC+1) → 12:00 UTC → 14:00 in Geneva.
    expect(startdt('London', '2026-07-01T13:00:00')).toBe('2026-07-01T12:00:00.000Z')
    // 13:00 London in winter (GMT) → 13:00 UTC.
    expect(startdt('London', '2026-12-01T13:00:00')).toBe('2026-12-01T13:00:00.000Z')
    // 18:30 New York in November (EST, UTC-5) → 23:30 UTC.
    expect(startdt('New York', '2026-11-17 18:30')).toBe('2026-11-17T23:30:00.000Z')
    // 10:00 Hong Kong (UTC+8) → 02:00 UTC.
    expect(startdt('Hong Kong', '2026-05-20T10:00:00')).toBe('2026-05-20T02:00:00.000Z')
  })

  it('omits optional parts when auction house, link and notes are missing', () => {
    const url = buildOutlookEventUrl({
      title: 'Evening Sale',
      city: 'Geneva',
      auctionDateTime: '2026-03-12T09:00:00',
    })

    const parsed = new URL(url!)
    expect(parsed.searchParams.get('subject')).toBe('Evening Sale')
    expect(parsed.searchParams.get('location')).toBe('Geneva')
    expect(parsed.searchParams.has('body')).toBe(false)
  })

  it('returns null without a known sale city, to avoid a wrong meeting time', () => {
    expect(
      buildOutlookEventUrl({ title: 'Sale', auctionDateTime: '2026-03-12T14:00:00' })
    ).toBeNull()
    expect(
      buildOutlookEventUrl({ title: 'Sale', city: 'Atlantis', auctionDateTime: '2026-03-12T14:00:00' })
    ).toBeNull()
  })

  it('returns null without a parsable auction datetime', () => {
    expect(buildOutlookEventUrl({ title: 'Sale', city: 'London', auctionDateTime: null })).toBeNull()
    expect(buildOutlookEventUrl({ title: 'Sale', city: 'London', auctionDateTime: '2026-03-12' })).toBeNull()
    expect(buildOutlookEventUrl({ title: 'Sale', city: 'London', auctionDateTime: 'invalid' })).toBeNull()
  })
})

describe('resolveAuctionCityTimeZone', () => {
  it('matches known cities case-insensitively, including with a suffix', () => {
    expect(resolveAuctionCityTimeZone('london')).toBe('Europe/London')
    expect(resolveAuctionCityTimeZone('New York, Rockefeller Center')).toBe('America/New_York')
    expect(resolveAuctionCityTimeZone('Geneva')).toBe('Europe/Zurich')
    expect(resolveAuctionCityTimeZone('Unknown')).toBeNull()
    expect(resolveAuctionCityTimeZone(null)).toBeNull()
  })
})
