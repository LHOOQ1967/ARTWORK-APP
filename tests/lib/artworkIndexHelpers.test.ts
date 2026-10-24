import { describe, expect, it } from 'vitest'
import type { ArtworkIndexItem } from '@/components/artwork/artworkIndexHelpers'
import { groupByPriority, matchesArtworkSearch, splitDraftArtworks } from '@/components/artwork/artworkIndexHelpers'

describe('artwork location search', () => {
  it.each([
    [{ location: { id: 'contact', company_name: 'Florac Works' } }, ' FLORAC '],
    [{ location: { id: 'contact', first_name: 'Jean', last_name: 'Dupont' } }, 'jean dupont'],
    [{ location_of_work: 'Geneva Freeport' }, 'freeport'],
    [{ location: null, location_of_work: 'Paris' }, 'paris'],
  ])('matches the displayed location', (fields, query) => {
    expect(matchesArtworkSearch({ id: 'artwork', ...fields }, query)).toBe(true)
  })

  it('does not match absent locations', () => {
    expect(matchesArtworkSearch({ id: 'artwork' }, 'Geneva')).toBe(false)
  })

  it('continues matching existing searchable fields', () => {
    const artwork: ArtworkIndexItem = {
      id: 'artwork', artist_label: 'Picasso', title: 'Portrait', medium: 'Oil',
      status: 'Viewed', priority: 'High', proposed_by_label: 'Gallery',
      proposals: [{ contact_label: 'Collector' }],
    }
    for (const query of ['picasso', 'portrait', 'oil', 'viewed', 'high', 'gallery', 'collector', '']) {
      expect(matchesArtworkSearch(artwork, query)).toBe(true)
    }
  })
})

describe('artwork priority groups', () => {
  it('groups Low artworks separately while preserving the other categories', () => {
    const artworks: ArtworkIndexItem[] = [
      { id: 'high', priority: 'High' },
      { id: 'medium', priority: 'Medium' },
      { id: 'low', priority: 'Low' },
      { id: 'information', priority: 'Information' },
      { id: 'other', priority: null },
    ]

    const groups = groupByPriority(artworks)

    expect(groups.High.map(({ id }) => id)).toEqual(['high'])
    expect(groups.Medium.map(({ id }) => id)).toEqual(['medium'])
    expect(groups.Low.map(({ id }) => id)).toEqual(['low'])
    expect(groups.Information.map(({ id }) => id)).toEqual(['information'])
    expect(groups.Other.map(({ id }) => id)).toEqual(['other'])
  })
})

describe('active artwork status groups', () => {
  it('separates Draft artworks from every other status', () => {
    const artworks: ArtworkIndexItem[] = [
      { id: 'draft', status: 'Draft' },
      { id: 'viewed', status: 'Viewed' },
      { id: 'no-status', status: null },
    ]

    const groups = splitDraftArtworks(artworks)

    expect(groups.drafts.map(({ id }) => id)).toEqual(['draft'])
    expect(groups.others.map(({ id }) => id)).toEqual(['viewed', 'no-status'])
  })
})
