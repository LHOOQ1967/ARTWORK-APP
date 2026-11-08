import { expect, it } from 'vitest'
import { artworkNavigationUrl } from '@/lib/factsheetNavigation'

it('preserves the filtered proposal destination across editing and saving or cancelling', () => {
  const returnTo = '/artworks/active?marketType=auction&artistId=artist&search=bronze&fromDate=2026-01-01'
  const edit = new URL(artworkNavigationUrl('/artworks/work/edit', returnTo), 'http://localhost')
  expect(edit.searchParams.get('returnTo')).toBe(returnTo)
  const factsheet = new URL(artworkNavigationUrl('/artworks/print/work', edit.searchParams.get('returnTo')), 'http://localhost')
  expect(factsheet.searchParams.get('returnTo')).toBe(returnTo)
})

it('keeps direct navigation unchanged and does not propagate external destinations', () => {
  expect(artworkNavigationUrl('/artworks/work/edit', null)).toBe('/artworks/work/edit')
  expect(artworkNavigationUrl('/artworks/work/edit', 'https://example.com')).toBe('/artworks/work/edit')
})
