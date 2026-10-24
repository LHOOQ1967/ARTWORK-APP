import { isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import ArtworkList from '@/components/artwork/ArtworkList'
import { ArtworkFieldsLayout } from '@/components/artwork/ArtworkFieldsLayout'
import { QualitySelect } from '@/components/artwork/ArtworkQuality'
import { sortArtworkItems } from '@/components/artwork/artworkListHelpers'
import type { ArtworkForm } from '@/app/(protected)/types/artwork'

const session = vi.hoisted(() => ({ role: 'Editor' }))
vi.mock('@/contexts/SessionContext', () => ({ useSessionProfile: () => session }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/supabaseBrowser', () => ({ supabase: {} }))

function collectRows(node: ReactNode): { label: string; children: ReactNode }[] {
  if (Array.isArray(node)) return node.flatMap(collectRows)
  if (!isValidElement<{ label?: string; children?: ReactNode }>(node)) return []
  if (node.props.label) return [{ label: node.props.label, children: node.props.children }]
  return collectRows(node.props.children)
}

describe('artwork quality', () => {
  it('prefills View date when selecting Viewed in the creation form', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-24T10:00:00Z'))
    try {
      const setArtwork = vi.fn()
      const rows = collectRows(ArtworkFieldsLayout({
        artwork: { status: 'Draft', view_date: null } as ArtworkForm,
        setArtwork,
        isEditing: true,
      }))
      const status = rows.find(row => row.label === 'Status')?.children
      if (!isValidElement<{ onChange: (event: { target: { value: string } }) => void }>(status)) {
        throw new Error('Status select not found')
      }
      status.props.onChange({ target: { value: 'Viewed' } })
      expect(setArtwork).toHaveBeenCalledWith({ status: 'Viewed', view_date: '2026-10-24' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('offers exactly ten integer scores and an unrated choice', () => {
    const html = renderToStaticMarkup(<QualitySelect value={7} onChange={vi.fn()} />)
    expect(html.match(/<option /g)).toHaveLength(11)
    for (let score = 1; score <= 10; score++) {
      expect(html).toContain(`>${score}/10</option>`)
    }
    expect(html).toContain('value="7" selected=""')
    expect(html).toContain('Not rated')
  })

  it.each([['1', 1], ['10', 10], ['', null]])('returns the numeric score for %s', (value, expected) => {
    const onChange = vi.fn()
    const select = QualitySelect({ value: null, onChange })
    select.props.onChange({ target: { value } })
    expect(onChange).toHaveBeenCalledWith(expected)
  })

  it('disables quality selection when editing is unavailable', () => {
    const html = renderToStaticMarkup(<QualitySelect value={4} onChange={vi.fn()} disabled />)
    expect(html).toContain('disabled=""')
  })

  it('places Quality between Status and Priority in the creation form and preserves other fields', () => {
    const setArtwork = vi.fn()
    const rows = collectRows(ArtworkFieldsLayout({
      artwork: { status: 'Viewed', quality: 4, priority: 'High' } as ArtworkForm,
      setArtwork,
      isEditing: true,
    }))
    const statusIndex = rows.findIndex(row => row.label === 'Status')
    expect(rows.slice(statusIndex, statusIndex + 3).map(row => row.label)).toEqual(['Status', 'Quality', 'Priority'])
    const quality = rows[statusIndex + 1]?.children
    if (!isValidElement<{ onChange: (value: number | null) => void }>(quality)) {
      throw new Error('Quality select not found')
    }
    quality.props.onChange(9)
    expect(setArtwork).toHaveBeenCalledWith({ status: 'Viewed', quality: 9, priority: 'High' })
  })

  it.each(['market', 'auction', 'bought'] as const)('shows editable Quality between Status and Priority in %s lists', mode => {
    session.role = 'Editor'
    const html = renderToStaticMarkup(
      <ArtworkList artworks={[{ id: 'artwork-1', status: 'Viewed', quality: 8, priority: 'High' }]}
        mode={mode} canEditStatusPriority statusOptions={['Viewed']} onUpdateArtworkField={vi.fn()} />
    )
    expect(html.indexOf('aria-label="Status"')).toBeLessThan(html.indexOf('aria-label="Quality"'))
    expect(html.indexOf('aria-label="Quality"')).toBeLessThan(html.indexOf('aria-label="Priority"'))
    expect(html).toContain('value="8" selected=""')
    expect(html).not.toContain('View quality history')
  })

  it('shows a read-only rating without history in viewer lists', () => {
    session.role = 'Viewer'
    const html = renderToStaticMarkup(
      <ArtworkList artworks={[{ id: 'artwork-1', status: 'Viewed', quality: 8, priority: 'High' }]} />
    )
    expect(html).not.toContain('<select')
    expect(html).toContain('8/10')
    expect(html).not.toContain('View quality history')
  })

  it.each([true, false])('keeps collection Status, Quality and Priority on one line (editable: %s)', canEdit => {
    session.role = canEdit ? 'Editor' : 'Viewer'
    const html = renderToStaticMarkup(
      <ArtworkList
        artworks={[{ id: 'artwork-1', status: 'Bought', quality: 8, priority: 'High' }]}
        mode="bought"
        canEditStatusPriority={canEdit}
        statusOptions={['Bought']}
        onUpdateArtworkField={vi.fn()}
      />
    )
    const statusFields = canEdit
      ? html.match(/<div style="([^"]*)"><select aria-label="Status"/)
      : html.match(/<div style="([^"]*)"><span>Bought<\/span><span>8\/10<\/span><span>High<\/span>/)
    expect(statusFields).not.toBeNull()
    expect(statusFields?.[1]).toContain('flex-direction:row')
    expect(html).not.toContain('History')
  })

  it.each([true, false])('displays Info without changing the stored priority (editable: %s)', canEdit => {
    session.role = canEdit ? 'Editor' : 'Viewer'
    const html = renderToStaticMarkup(
      <ArtworkList
        artworks={[{ id: 'artwork-1', priority: 'Information' }]}
        canEditStatusPriority={canEdit}
        onUpdateArtworkField={vi.fn()}
      />
    )
    if (canEdit) {
      expect(html).toContain('value="Information" selected="">Info</option>')
      expect(html).toMatch(/aria-label="Status"[^>]*style="[^"]*width:110px/)
      expect(html).toMatch(/aria-label="Quality"[^>]*style="[^"]*width:64px/)
      expect(html).toMatch(/aria-label="Priority"[^>]*style="[^"]*width:84px/)
      for (const label of ['Status', 'Quality', 'Priority']) {
        expect(html).toMatch(new RegExp(`aria-label="${label}"[^>]*style="[^"]*font-size:1rem`))
      }
    } else {
      expect(html).toContain('>Info</span>')
    }
  })

  it.each(['asc', 'desc'] as const)('sorts scores numerically with unrated artworks last (%s)', direction => {
    const sorted = sortArtworkItems(
      [{ id: 'low', quality: 2 }, { id: 'unrated', quality: null }, { id: 'high', quality: 10 }],
      'market', { key: 'date', dir: 'desc' }, 'quality', direction
    )
    expect(sorted.map(artwork => artwork.id)).toEqual(
      direction === 'asc' ? ['low', 'high', 'unrated'] : ['high', 'low', 'unrated']
    )
  })
})
