import { describe, expect, it } from 'vitest'
import { categoryFactsheetsUrl, parseCategoryArtworkIds, matchesArtworkCategory } from '@/lib/categoryFactsheets'

describe('category factsheets', () => {
  it('preserves filters and sorting in the destination URL', () => {
    const url = new URL(categoryFactsheetsUrl('market-High-others',
      { status: 'Active', search: 'Bronze & stone', artistId: 'artist' },
      { 'market-High-others': { sortKey: 'title', sortDirection: 'desc', showAll: false } }), 'http://localhost')
    expect(url.pathname).toBe('/artworks/print/category')
    expect(url.searchParams.get('search')).toBe('Bronze & stone')
    expect(url.searchParams.get('category')).toBe('market-High-others')
    expect(JSON.parse(url.searchParams.get('tables')!)).toHaveProperty('market-High-others.sortKey', 'title')
  })

  it('accepts a complete category without a 20-row limit and preserves order', () => {
    const ids = Array.from({ length: 551 }, (_, index) => `work-${index}`)
    expect(parseCategoryArtworkIds(ids)).toEqual(ids)
    expect(parseCategoryArtworkIds([])).toEqual([])
  })

  it.each(['market-High-others', 'auction-Low-drafts', 'bought', 'archived-market', 'archived-auction'])(
    'supports exact category %s', category => {
      expect(matchesArtworkCategory(category, category)).toBe(true)
    })

  it('does not mix archived or auction works into private market', () => {
    expect(matchesArtworkCategory('archived-market', 'market')).toBe(false)
    expect(matchesArtworkCategory('auction-High-others', 'market')).toBe(false)
    expect(matchesArtworkCategory('archived-auction', 'archived')).toBe(true)
  })

  it.each([null, {}, [1], ['duplicate', 'duplicate']])('rejects invalid identifier responses: %j', value => {
    expect(() => parseCategoryArtworkIds(value)).toThrow('Invalid category artwork identifiers')
  })
})
