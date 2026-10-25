import { describe, expect, it } from 'vitest'
import { artworkPageFilters, parseArtworkListPage } from '@/lib/paginatedArtworkLists'

const page = {
  total: 45, groups: [{ id: 'market-High-others', total: 45, rows: [{ id: 'work' }] }],
  artists: [{ id: 'artist', label: 'Painter' }], proposers: [], recipients: [], statuses: ['Viewed'],
}

describe('paginated artwork wire contract', () => {
  it('accepts an empty or populated page', () => {
    expect(parseArtworkListPage(page)).toEqual(page)
    expect(parseArtworkListPage({ ...page, groups: [], total: 0 }).groups).toEqual([])
  })

  it.each([
    null, {}, { ...page, total: -1 }, { ...page, groups: [{ id: 'group', total: 45, rows: Array(21).fill({ id: 'work' }) }] },
    { ...page, groups: [{ id: 'group', total: 45, rows: [{}] }] },
    { ...page, artists: [{ id: 'artist' }] }, { ...page, statuses: [4] },
  ])('rejects malformed or oversized pages', value => {
    expect(() => parseArtworkListPage(value)).toThrow('Invalid artwork list page response')
  })

  it('omits default filters and applies explicit scope restrictions', () => {
    expect(artworkPageFilters({ artistId: 'all', search: '', proposedBy: 'seller', proposedTo: 'other' },
      'Bought', 'global-client', 'fixed-client')).toEqual({
      status: 'Bought', proposedBy: 'seller', proposedTo: 'fixed-client', client: 'global-client',
    })
  })
})
