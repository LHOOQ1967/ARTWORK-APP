import { describe, expect, it } from 'vitest'
import { sortArtworkItems } from '@/components/artwork/artworkListHelpers'
import type { ArtworkListItem } from '@/app/(protected)/types/artwork'

const auctionRows: ArtworkListItem[] = [
  { id: 'lot-10', sale_date: '2026-11-17', lot: '10' },
  { id: 'late', sale_date: '2026-11-17', sale_time: '23:59:00', lot: '100' },
  { id: 'no-lot', sale_date: '2026-11-17' },
  { id: 'next-day', sale_date: '2026-11-18', sale_time: '00:00:00' },
  { id: 'lot-2a', sale_date: '2026-11-17', lot: '2 A' },
  { id: 'midnight', sale_date: '2026-11-17', sale_time: '00:00:00' },
  { id: 'previous-day', sale_date: '2026-11-16' },
  { id: 'lot-2', sale_date: '2026-11-17', lot: '2' },
]

describe('auction sale ordering', () => {
  it.each(['asc', 'desc'] as const)('sorts by date, time with nulls last, then numeric lot (%s)', direction => {
    const sorted = sortArtworkItems(auctionRows, 'auction', { key: 'date', dir: 'asc' }, 'date', direction)
    expect(sorted.map(row => row.id)).toEqual(direction === 'asc'
      ? ['previous-day', 'midnight', 'late', 'lot-2', 'lot-2a', 'lot-10', 'no-lot', 'next-day']
      : ['next-day', 'late', 'midnight', 'lot-2', 'lot-2a', 'lot-10', 'no-lot', 'previous-day'])
  })

  it('uses the same auction order to break ties in other column sorts', () => {
    const sorted = sortArtworkItems(auctionRows, 'auction', { key: 'date', dir: 'asc' }, 'title', 'desc')
    expect(sorted.map(row => row.id)).toEqual([
      'previous-day', 'midnight', 'late', 'lot-2', 'lot-2a', 'lot-10', 'no-lot', 'next-day',
    ])
  })
})
