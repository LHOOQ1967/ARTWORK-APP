import { isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ArtistViewPage from '@/app/(protected)/artists/[id]/page'

const mocks = vi.hoisted(() => ({
  states: [] as unknown[],
  index: 0,
  setState: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'artist-1' }),
  useRouter: () => ({ refresh: mocks.refresh }),
}))
vi.mock('@/contexts/SessionContext', () => ({
  useSessionProfile: () => ({ role: 'Editor', loading: false }),
}))
vi.mock('@/lib/supabaseBrowser', () => ({ supabase: { from: mocks.from } }))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => [mocks.states[mocks.index++] ?? initial, mocks.setState],
  useEffect: vi.fn(),
}))

function findSave(node: ReactNode): (() => void) | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findSave(child)
      if (found) return found
    }
  }
  if (isValidElement<{ children?: ReactNode; onClick?: () => void }>(node)) {
    if (node.type === 'button' && node.props.children === 'Save') return node.props.onClick
    return findSave(node.props.children)
  }
}

describe('saving an artist', () => {
  const artist = {
    id: 'artist-1', legacy_no: 1, first_name: 'Pablo', last_name: 'Picasso',
    year_of_birth: null, year_of_death: null, place_of_birth: null, place_of_death: null,
    notes: null, artist_category_no: null, created_at: null, created_by: null, source: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.index = 0
    mocks.states = [
      artist,
      { first_name: 'Pablo', last_name: 'Updated', year_of_birth: '', year_of_death: '', place_of_birth: '', place_of_death: '', notes: '', artist_category_no: '' },
      '—', false, '—', [], false, '',
    ]
    mocks.from.mockReturnValue({ update: mocks.update })
    mocks.update.mockReturnValue({ eq: mocks.eq })
    mocks.eq.mockReturnValue({ select: mocks.select })
    mocks.select.mockReturnValue({ maybeSingle: mocks.maybeSingle })
  })

  it('updates the displayed record only when the database confirms a saved row', async () => {
    const updated = { ...artist, last_name: 'Updated' }
    mocks.maybeSingle.mockResolvedValue({ data: updated, error: null })
    findSave(ArtistViewPage())?.()
    await vi.waitFor(() => expect(mocks.refresh).toHaveBeenCalled())
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ last_name: 'Updated' }))
    expect(mocks.eq).toHaveBeenCalledWith('id', 'artist-1')
    expect(mocks.setState).toHaveBeenCalledWith(updated)
  })

  it('reports an update that affected no rows instead of treating it as success', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
    findSave(ArtistViewPage())?.()
    await vi.waitFor(() => expect(mocks.setState).toHaveBeenCalledWith('Artist was not saved. You may not have permission to edit this record.'))
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('shows database errors on the artist page', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'Database error' } })
    findSave(ArtistViewPage())?.()
    await vi.waitFor(() => expect(mocks.setState).toHaveBeenCalledWith('Database error'))
    mocks.index = 0
    mocks.states[7] = 'Database error'
    expect(renderToStaticMarkup(<ArtistViewPage />)).toContain('role="alert"')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
