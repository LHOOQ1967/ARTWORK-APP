import { describe, expect, it } from 'vitest'
import { artworkYearError, formatArtworkYears } from '@/lib/artworkYears'
import { getTitleWithYear } from '@/components/artwork/artworkListHelpers'
import type { ArtworkListItem } from '@/app/(protected)/types/artwork'

describe('artwork execution years', () => {
  it.each([
    [2026, 2024, '2024/2026'],
    ['2026', 2024, '2024/2026'],
    [2026, null, '2026'],
    [2026, undefined, '2026'],
    [2026, 2026, '2026'],
    [null, null, ''],
    [null, 2024, '2024'],
  ])('formats end %s and start %s as %s', (end, start, expected) => {
    expect(formatArtworkYears(end, start)).toBe(expected)
  })

  it('includes the range in list labels without changing the title', () => {
    const artwork: ArtworkListItem = { id: 'work', title: 'Untitled', year_execution: 2026, year_execution_start: 2024 }
    expect(getTitleWithYear(artwork)).toBe('Untitled, 2024/2026')
    expect(artwork.title).toBe('Untitled')
  })

  it('validates optional start years and requires a compatible end year', () => {
    expect(artworkYearError(null, 2026)).toBeNull()
    expect(artworkYearError(undefined, null)).toBeNull()
    expect(artworkYearError(2024, 2026)).toBeNull()
    expect(artworkYearError(2026, 2026)).toBeNull()
    expect(artworkYearError(2024, null)).toContain('required')
    expect(artworkYearError(2027, 2026)).toContain('later')
    expect(artworkYearError(2024.5, 2026)).toContain('whole number')
  })
})
