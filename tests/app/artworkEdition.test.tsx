import { isValidElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ArtworkFieldsLayout } from '@/components/artwork/ArtworkFieldsLayout'
import type { ArtworkForm } from '@/app/(protected)/types/artwork'
import { mapImportToArtworkPrefill } from '@/lib/imports/mapImportToArtworkPrefill'

vi.mock('@/lib/supabaseBrowser', () => ({ supabase: {} }))

function collectRows(node: ReactNode): { label: string; children: ReactNode }[] {
  if (Array.isArray(node)) return node.flatMap(collectRows)
  if (!isValidElement<{ label?: string; children?: ReactNode }>(node)) return []
  if (node.props.label) {
    return [{ label: node.props.label, children: node.props.children }]
  }
  return collectRows(node.props.children)
}

describe('artwork edition', () => {
  it('places Year (start) before Year (end)', () => {
    const rows = collectRows(ArtworkFieldsLayout({
      artwork: { year_execution: 2026, year_execution_start: 2024 } as ArtworkForm,
      setArtwork: vi.fn(),
      isEditing: true,
    }))
    const startIndex = rows.findIndex(row => row.label === 'Year (start)')
    expect(startIndex).toBeGreaterThanOrEqual(0)
    expect(rows[startIndex + 1]?.label).toBe('Year (end)')
  })

  it.each([['2024', 2024], ['', null]])('updates start year %s independently of end year', (value, expected) => {
    const setArtwork = vi.fn()
    const row = collectRows(ArtworkFieldsLayout({
      artwork: { year_execution: 2026, year_execution_start: null } as ArtworkForm,
      setArtwork,
      isEditing: true,
    })).find(item => item.label === 'Year (start)')
    if (!isValidElement<{ onChange: (event: { target: { value: string } }) => void }>(row?.children)) {
      throw new Error('Start year input not found')
    }
    row.children.props.onChange({ target: { value } })
    expect(setArtwork).toHaveBeenCalledWith(expect.objectContaining({
      year_execution: 2026,
      year_execution_start: expected,
    }))
  })

  it('places edition immediately after signature in the creation form', () => {
    const artwork = { signature: 'Signed', edition: '3/10' } as ArtworkForm
    const rows = collectRows(ArtworkFieldsLayout({
      artwork,
      setArtwork: vi.fn(),
      isEditing: true,
    }))
    const signatureIndex = rows.findIndex((row) => row.label === 'Signature')
    expect(rows[signatureIndex + 1]?.label).toBe('Edition')
  })

  it.each([['AP', 'AP'], ['', null]])('saves edition %s without altering signature', (value, expected) => {
    const artwork = { signature: 'Signed', edition: '3/10' } as ArtworkForm
    const setArtwork = vi.fn()
    const row = collectRows(ArtworkFieldsLayout({
      artwork,
      setArtwork,
      isEditing: true,
    })).find((item) => item.label === 'Edition')
    if (!isValidElement<{ onChange: (event: { target: { value: string } }) => void }>(row?.children)) {
      throw new Error('Edition input not found')
    }
    row.children.props.onChange({ target: { value } })
    expect(setArtwork).toHaveBeenCalledWith(expect.objectContaining({
      signature: 'Signed',
      edition: expected,
    }))
  })

  it('preserves a separate edition when prefilling an imported artwork', () => {
    const prefill = mapImportToArtworkPrefill({
      id: 'import-1',
      artist_match_id: null,
      parsed_data: { normalized: { signature: 'Signed', edition: ' 3/10 ', year_start: 2024, year: 2026 } },
    })
    expect(prefill.signature).toBe('Signed')
    expect(prefill.edition).toBe('3/10')
    expect(prefill.year_start).toBe('2024')
    expect(prefill.year).toBe('2026')
    expect(mapImportToArtworkPrefill(null).year_start).toBe('')
    expect(mapImportToArtworkPrefill(null).edition).toBe('')
  })
})
