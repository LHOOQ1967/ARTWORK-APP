import { describe, expect, it } from 'vitest'
import { ARTWORK_LIST_COLUMNS } from '@/lib/artworkListQuery'
import { resolveSource } from '@/lib/viewerSources'

describe('lightweight artwork lists', () => {
  it.each(['Editor', 'Administrator', 'Viewer'] as const)('uses a role-specific list without changing detail sources for %s', role => {
    expect(resolveSource('artwork-lists', role)).toBe(role === 'Viewer'
      ? 'viewer_artworks_list_secure' : 'artworks_list_admin')
    expect(resolveSource('artworks', role)).toBe(role === 'Viewer'
      ? 'viewer_artworks_full_secure' : 'artworks_full_admin')
    expect(resolveSource('prints', role)).toBe(resolveSource('artworks', role))
  })

  it('excludes full documents, history and detail-only text', () => {
    const columns = ARTWORK_LIST_COLUMNS.split(',')
    expect(columns).not.toContain('*')
    for (const field of ['documents', 'notes', 'provenance', 'exhibition_literature', 'changed_diff', 'changed_fields']) {
      expect(columns).not.toContain(field)
    }
    for (const field of ['id', 'artist_id', 'proposed_by_id', 'artist', 'images', 'quality', 'year_execution_start',
      'location', 'location_of_work', 'sale_time', 'cost_amount', 'sold_premium', 'date_acquisition']) {
      expect(columns).toContain(field)
    }
    expect(new Set(columns).size).toBe(columns.length)
  })
})
