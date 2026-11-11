import { describe, expect, it } from 'vitest'
import { localSaleDate } from '@/lib/imports/auction'

describe('auction local sale date and time', () => {
  it.each([
    ['New York', '2026-11-17T23:30Z', '2026-11-17', '18:30'],
    ['New York', '2026-06-17T22:30Z', '2026-06-17', '18:30'],
    ['London', '2026-11-17T23:30Z', '2026-11-17', '23:30'],
    ['London', '2026-06-17T23:30Z', '2026-06-18', '00:30'],
    ['Paris', '2026-11-17T23:30Z', '2026-11-18', '00:30'],
    ['Hong Kong', '2026-11-17T23:30Z', '2026-11-18', '07:30'],
    ['New York, Rockefeller Center', '2026-11-17T23:30Z', '2026-11-17', '18:30'],
  ])('uses %s local date and time for %s', (city, timestamp, date, time) => {
    expect(localSaleDate(timestamp, city)).toEqual({ sale_date: date, sale_time: time })
  })

  it('prefers the published IANA timezone and applies daylight saving to legacy abbreviations', () => {
    expect(localSaleDate('2026-06-17T22:30Z', null, 'America/New_York').sale_time).toBe('18:30')
    expect(localSaleDate('2026-06-17T22:30Z', 'New York', 'EST').sale_time).toBe('18:30')
    expect(localSaleDate('2026-06-17T22:30Z', null, 'EST').sale_time).toBe('18:30')
  })

  it('does not silently use the server or Geneva timezone when the sale location is unknown', () => {
    expect(() => localSaleDate('2026-11-17T23:30Z', 'Unknown')).toThrow('timezone')
    expect(() => localSaleDate('invalid', 'New York')).toThrow('sale date')
    expect(localSaleDate(null, null)).toEqual({ sale_date: null, sale_time: null })
  })
})
