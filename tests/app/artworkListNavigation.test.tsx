// @vitest-environment jsdom
import { act, useEffect, useLayoutEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ArtworkList from '@/components/artwork/ArtworkList'
import { DEFAULT_ARTWORK_TABLE_STATE, useArtworkListNavigation } from '@/components/artwork/useArtworkListNavigation'

const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/contexts/SessionContext', () => ({ useSessionProfile: () => ({ role: 'Editor' }) }))
vi.mock('@/lib/supabaseBrowser', () => ({ supabase: {} }))
let container: HTMLDivElement
let root: Root
let navigation: ReturnType<typeof useArtworkListNavigation>
let frames: FrameRequestCallback[]
const scroll = vi.fn()
const works = Array.from({ length: 8 }, (_, index) => ({
  id: `work-${index}`, title: `Title ${index}`, date_proposition: `2026-01-0${index + 1}`,
}))

function Page({ ready = true, scope = 'user:active', committedUrl }: { ready?: boolean; scope?: string; committedUrl?: string }) {
  const state = useArtworkListNavigation(scope, ready)
  useLayoutEffect(() => {
    if (committedUrl) window.history.replaceState(null, '', committedUrl)
  }, [committedUrl])
  useEffect(() => { navigation = state }, [state])
  return <>
    <p>{state.filters.artistId} / {state.filters.search}</p>
    <ArtworkList artworks={works} tableState={state.tables.market ?? DEFAULT_ARTWORK_TABLE_STATE}
      onTableStateChange={table => state.updateTable('market', table)}
      onOpenArtwork={state.saveScroll} />
  </>
}

async function render(ready = true, scope = 'user:active') {
  await act(async () => root.render(<Page ready={ready} scope={scope} />))
}
async function flushFrames() {
  await act(async () => {
    const pending = frames
    frames = []
    pending.forEach(callback => callback(0))
  })
}

describe('artwork list navigation restoration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    frames = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('scrollTo', scroll)
    vi.stubGlobal('scrollY', 0)
    window.history.replaceState({ nextRouterState: 'preserved' }, '', '/artworks/active?artistId=artist-a&proposedTo=legacy&proposedBy=legacy&unrelated=keep#list')
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it('stores all filters in the URL without dropping unrelated parameters, hash or router state', async () => {
    await render()
    expect(navigation.filters.artistId).toBe('artist-a')
    await act(async () => navigation.updateFilters({
      marketType: 'auction',
      search: 'Bronze & stone', fromDate: '2026-01-01',
    }))
    const url = new URL(window.location.href)
    expect(url.searchParams.get('search')).toBe('Bronze & stone')
    expect(url.searchParams.has('proposedBy')).toBe(false)
    expect(url.searchParams.has('proposedTo')).toBe(false)
    expect(url.searchParams.get('marketType')).toBe('auction')
    expect(url.searchParams.get('fromDate')).toBe('2026-01-01')
    expect(url.searchParams.get('unrelated')).toBe('keep')
    expect(url.hash).toBe('#list')
    expect(window.history.state.nextRouterState).toBe('preserved')
    await act(async () => root.render(null))
    await render()
    expect(navigation.filters.search).toBe('Bronze & stone')
  })

  it('persists filters when the router commits the destination URL after rendering the list', async () => {
    window.history.replaceState(null, '', '/')
    await act(async () => root.render(<Page committedUrl="/artworks/active" />))
    await act(async () => navigation.updateFilters({
      artistId: 'artist-a', marketType: 'auction', search: 'bronze',
    }))
    const url = new URL(window.location.href)
    expect(url.pathname).toBe('/artworks/active')
    expect(url.searchParams.get('artistId')).toBe('artist-a')
    expect(url.searchParams.get('marketType')).toBe('auction')
    expect(url.searchParams.get('search')).toBe('bronze')
    await act(async () => container.querySelector('tbody tr')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const destination = new URL(push.mock.calls[0][0], 'http://localhost')
    expect(destination.searchParams.get('returnTo')).toBe(url.pathname + url.search)
  })

  it('restores sorting and expanded rows before restoring scroll after the data becomes ready', async () => {
    await render()
    await flushFrames()
    const showMore = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Show 3 more')!
    await act(async () => showMore.click())
    const sort = container.querySelector<HTMLElement>('[title="Sort by title"]')!
    expect(sort).not.toBeNull()
    await act(async () => sort.click())
    await act(async () => sort.click())
    expect(navigation.tables.market).toEqual({ showAll: true, sortKey: 'title', sortDirection: 'desc' })
    vi.stubGlobal('scrollY', 1450)
    await act(async () => container.querySelector('tbody tr')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(push).toHaveBeenCalled()
    expect(window.history.state.artmuseArtworkNavigation.scrollY).toBe(1450)
    await act(async () => root.render(null))
    scroll.mockClear()
    await render(false)
    await flushFrames()
    expect(scroll).not.toHaveBeenCalled()
    expect(container.querySelectorAll('tbody tr')).toHaveLength(8)
    expect(container.querySelector('tbody tr')?.textContent).toContain('Title 7')
    await render(true)
    await flushFrames()
    expect(scroll).toHaveBeenCalledWith({ top: 1450, behavior: 'instant' })
    expect(navigation.filters.artistId).toBe('artist-a')
  })

  it('resets URL filters and responds to browser Back/Forward popstate', async () => {
    await render()
    await act(async () => navigation.updateFilters({ artistId: 'all', search: '' }))
    expect(new URL(window.location.href).searchParams.has('artistId')).toBe(false)
    window.history.replaceState(null, '', '/artworks/active?search=returned')
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(navigation.filters.search).toBe('returned')
    expect(navigation.tables).toEqual({})
  })

  it('does not reuse another user or list scope scroll and table state', async () => {
    await render()
    await act(async () => navigation.updateTable('market', { sortKey: 'priority', sortDirection: 'desc', showAll: true }))
    await act(async () => root.render(null))
    await render(true, 'another-user:collections')
    expect(navigation.tables).toEqual({})
    expect(navigation.scrollY).toBe(0)
  })
})
