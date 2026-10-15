import { describe, expect, it } from 'vitest'
import type { ArtworkIndexItem } from '@/components/artwork/artworkIndexHelpers'
import { groupByPriority, splitDraftArtworks } from '@/components/artwork/artworkIndexHelpers'

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
