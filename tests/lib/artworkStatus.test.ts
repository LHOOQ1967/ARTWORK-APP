import { describe, expect, it } from 'vitest'
import { artworkStatusChange } from '@/lib/artworkStatus'

describe('artwork status view date', () => {
  it('fills an empty view date on transition to Viewed', () => {
    expect(artworkStatusChange({ status: 'Draft', view_date: null }, 'Viewed', new Date('2026-10-24T10:00:00Z')))
      .toEqual({ status: 'Viewed', view_date: '2026-10-24' })
  })

  it('preserves an existing date', () => {
    expect(artworkStatusChange({ status: 'Draft', view_date: '2025-01-01' }, 'Viewed'))
      .toEqual({ status: 'Viewed' })
  })

  it('does not fill a date for an already Viewed artwork', () => {
    expect(artworkStatusChange({ status: 'Viewed', view_date: null }, 'Viewed'))
      .toEqual({ status: 'Viewed' })
  })

  it.each(['Draft', 'Negotiation', 'Bought', 'Archived', null])('does not set a date for %s', status => {
    expect(artworkStatusChange({ status: 'Draft' }, status)).toEqual({ status })
  })

  it.each([
    ['2026-10-24T23:30:00Z', '2026-10-25'],
    ['2026-01-01T23:30:00Z', '2026-01-02'],
  ])('uses the Swiss calendar date for %s', (instant, date) => {
    expect(artworkStatusChange({}, 'Viewed', new Date(instant)))
      .toEqual({ status: 'Viewed', view_date: date })
  })
})
