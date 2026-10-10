import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import NewArtistPage from '@/app/(protected)/artists/new/page'

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  order: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  push: vi.fn(),
  setState: vi.fn(),
  states: [] as unknown[],
  index: 0,
  effect: null as (() => void) | null,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, back: vi.fn() }),
}))
vi.mock('@/lib/supabaseBrowser', () => ({
  supabase: { from: mocks.from },
}))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => [
    mocks.states[mocks.index++] ?? initial,
    mocks.setState,
  ],
  useEffect: (effect: () => void) => {
    mocks.effect = effect
  },
}))

function findSave(node: ReactNode): (() => Promise<void>) | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findSave(child)
      if (found) return found
    }
  }
  if (isValidElement<{ children?: ReactNode; onClick?: () => Promise<void> }>(node)) {
    if (node.type === 'button' && node.props.children === 'Save') return node.props.onClick
    return findSave(node.props.children)
  }
}

describe('new artist categories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.index = 0
    mocks.states = ['Pablo', 'Picasso', '12', [
      { legacy_no: 12, description: 'Modern' },
      { legacy_no: 25, description: 'Contemporary' },
    ], false]
    mocks.from.mockReturnValue({ insert: mocks.insert, select: mocks.select })
    mocks.select.mockReturnValue({ order: mocks.order })
    mocks.order.mockResolvedValue({
      data: [{ legacy_no: 12, description: 'Modern' }],
      error: null,
    })
    mocks.insert.mockResolvedValue({ error: null })
  })

  it('renders the same category options as the artist record', () => {
    const html = renderToStaticMarkup(<NewArtistPage />)
    expect(html).toContain('id="artist-category"')
    expect(html).toContain('<option value="12" selected="">Modern</option>')
    expect(html).toContain('<option value="25">Contemporary</option>')
  })

  it('loads categories ordered by their legacy number', async () => {
    NewArtistPage()
    mocks.effect?.()
    await vi.waitFor(() => expect(mocks.setState).toHaveBeenCalledWith(false))
    expect(mocks.from).toHaveBeenCalledWith('artist_categories')
    expect(mocks.select).toHaveBeenCalledWith('legacy_no, description')
    expect(mocks.order).toHaveBeenCalledWith('legacy_no', { ascending: true })
  })

  it.each([['12', 12], ['', null]])('saves category %s as %s', async (selection, expected) => {
    mocks.states[2] = selection
    const save = findSave(NewArtistPage())
    expect(save).toBeDefined()
    await save?.()
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      last_name: 'Picasso',
      artist_category_no: expected,
    }))
    expect(mocks.push).toHaveBeenCalledWith('/referentials')
  })

  it('displays category loading errors without hiding the artist form', () => {
    mocks.states[5] = 'Database unavailable'
    const html = renderToStaticMarkup(<NewArtistPage />)
    expect(html).toContain('Failed to load artist categories: Database unavailable')
    expect(html).toContain('id="artist-last-name"')
  })
})
