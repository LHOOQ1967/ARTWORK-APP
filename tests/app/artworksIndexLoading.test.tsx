// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ArtworksIndexPage from '@/components/pages/ArtworksIndexPage'
import { invalidateTemporaryCaches } from '@/lib/temporaryCache'

const mocks = vi.hoisted(() => ({
  role: 'Editor', userId: 'editor', clientId: null as string | null, rpc: vi.fn(),
}))
vi.mock('@/lib/supabaseBrowser', () => ({ supabase: { rpc: mocks.rpc } }))
vi.mock('@/contexts/SessionContext', () => ({ useSessionProfile: () => ({ role: mocks.role, user: { id: mocks.userId } }) }))
vi.mock('@/contexts/ClientFilterContext', () => ({ useClientFilter: () => ({ selectedClientId: mocks.clientId }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/ui/SearchSelect', () => ({
  default: (props: { label: string; valueId: string; onChangeId: (id: string) => void; options: { id: string; label: string }[] }) =>
    <select aria-label={props.label} value={props.valueId} onChange={event => props.onChangeId(event.target.value)}>
      <option value="all">All</option>{props.options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>,
}))

let container: HTMLDivElement
let root: Root
const rows = Array.from({ length: 45 }, (_, index) => ({
  id: `work-${index}`, title: `Painting ${String(index).padStart(2, '0')}`,
  status: 'Viewed', priority: 'High', quality: 8, artist_id: 'artist',
  artist: { id: 'artist', first_name: 'Jane', last_name: 'Painter' },
}))

function response(offset = 0) {
  return {
    total: 45, groups: [{ id: 'market-High-others', total: 45, rows: rows.slice(offset, offset + 20) }],
    artists: [{ id: 'artist', label: 'Painter' }], proposers: [], recipients: [], statuses: ['Viewed'],
  }
}
async function settle() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 260)) })
}
async function render(props: React.ComponentProps<typeof ArtworksIndexPage> = {}) {
  await act(async () => root.render(<ArtworksIndexPage {...props} />))
  await settle()
}
async function click(text: string) {
  const button = Array.from(container.querySelectorAll('button')).find(button => button.textContent === text)
  if (!button) throw new Error(`Missing button: ${text}`)
  await act(async () => button.click())
  await settle()
}

describe('server-paginated artwork index', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidateTemporaryCaches()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    window.history.replaceState(null, '', '/artworks')
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0))
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
    vi.stubGlobal('scrollTo', vi.fn())
    mocks.role = 'Editor'
    mocks.userId = 'editor'
    mocks.clientId = null
    mocks.rpc.mockImplementation(async (_name, args) => ({ data: response(args.p_offset), error: null }))
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it.each(['Editor', 'Administrator', 'Viewer'])('loads 20 rows with a global count for %s', async role => {
    mocks.role = role
    await render({ forcedStatus: 'Active' })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith('artwork_list_page', expect.objectContaining({
      p_filters: { status: 'Active' }, p_offset: 0, p_group: null,
    }))
    expect(container.querySelectorAll('tbody tr')).toHaveLength(20)
    expect(container.textContent).toContain('45 proposals')
    expect(container.textContent).toContain('20 of 45 artworks')
  })

  it('loads only the next 20 rows of the selected group and then the final five', async () => {
    await render()
    await click('Load more')
    expect(mocks.rpc).toHaveBeenLastCalledWith('artwork_list_page', expect.objectContaining({
      p_group: 'market-High-others', p_offset: 20,
    }))
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(40)
    await click('Load more')
    expect(mocks.rpc).toHaveBeenCalledTimes(3)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(45)
    expect(container.textContent).not.toContain('Load more')
  })

  it('sends sorting to the server and resets loaded pages for that table', async () => {
    await render()
    await click('Load more')
    await act(async () => container.querySelector<HTMLElement>('[title="Sort by title"]')!.click())
    await settle()
    expect(mocks.rpc).toHaveBeenLastCalledWith('artwork_list_page', expect.objectContaining({
      p_offset: 0, p_tables: { 'market-High-others': { sortKey: 'title', sortDirection: 'asc' } },
    }))
    expect(container.querySelectorAll('tbody tr')).toHaveLength(20)
  })

  it('filters across all rows on the server and preserves the filter in the URL', async () => {
    await render()
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Painting 44')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await settle()
    expect(mocks.rpc).toHaveBeenLastCalledWith('artwork_list_page', expect.objectContaining({
      p_filters: { status: 'all', search: 'Painting 44' },
    }))
    expect(new URL(window.location.href).searchParams.get('search')).toBe('Painting 44')
    expect(container.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('Painting 44')
  })

  it('restores previously loaded pages when returning to the history entry', async () => {
    await render()
    await click('Load more')
    await act(async () => root.render(null))
    mocks.rpc.mockClear()
    await render()
    expect(container.querySelectorAll('tbody tr')).toHaveLength(40)
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    expect(mocks.rpc).toHaveBeenLastCalledWith('artwork_list_page', expect.objectContaining({ p_offset: 20 }))
  })

  it('sends client, fixed recipient and status restrictions to the server', async () => {
    mocks.clientId = 'global-client'
    await render({ forcedStatus: 'Bought', fixedProposedToId: 'recipient' })
    expect(mocks.rpc).toHaveBeenCalledWith('artwork_list_page', expect.objectContaining({
      p_filters: { status: 'Bought', client: 'global-client', proposedTo: 'recipient' },
    }))
  })

  it('surfaces page failures without publishing a partial successful load', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await render()
      mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Page denied' } })
      await click('Load more')
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('Page denied')
      expect(container.querySelectorAll('tbody tr')).toHaveLength(0)
    } finally { log.mockRestore() }
  })

  it('revalidates after focus and invalidation', async () => {
    await render()
    await act(async () => window.dispatchEvent(new Event('focus')))
    await settle()
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    await act(async () => invalidateTemporaryCaches())
    await settle()
    expect(mocks.rpc).toHaveBeenCalledTimes(3)
  })

  it('reuses a recent cached page immediately while revalidating, but never for another user', async () => {
    await render()
    await act(async () => root.render(null))
    mocks.rpc.mockImplementation(() => new Promise(() => {}))
    await render()
    expect(container.querySelectorAll('tbody tr')).toHaveLength(20)
    expect(container.textContent).toContain('Refreshing artworks...')
    await act(async () => root.render(null))
    mocks.userId = 'another-user'
    await render()
    expect(container.querySelectorAll('tbody tr')).toHaveLength(0)
    expect(container.textContent).toContain('Loading artworks...')
  })

  it('does not reuse cached pages after sixty seconds', async () => {
    await render()
    await act(async () => root.render(null))
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_001)
    try {
      mocks.rpc.mockImplementation(() => new Promise(() => {}))
      await render()
      expect(container.querySelectorAll('tbody tr')).toHaveLength(0)
      expect(container.textContent).toContain('Loading artworks...')
    } finally { clock.mockRestore() }
  })

  it('ignores late pages started before a mutation invalidated the cache', async () => {
    await render()
    const pending: ((value: { data: ReturnType<typeof response>; error: null }) => void)[] = []
    mocks.rpc.mockImplementation(() => new Promise(resolve => pending.push(resolve)))
    await act(async () => window.dispatchEvent(new Event('focus')))
    await settle()
    await act(async () => invalidateTemporaryCaches())
    await settle()
    expect(pending).toHaveLength(2)
    await act(async () => pending[0]({ data: { ...response(), total: 999 }, error: null }))
    expect(container.textContent).not.toContain('999 proposals')
    await act(async () => pending[1]({ data: { ...response(), total: 46 }, error: null }))
    expect(container.textContent).toContain('46 proposals')
  })
})
