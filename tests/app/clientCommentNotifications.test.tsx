// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HeaderNav from '@/components/layout/HeaderNav'

const mocks = vi.hoisted(() => ({
  role: 'Viewer', user: { id: 'viewer-a' }, from: vi.fn(),
}))
vi.mock('@/lib/supabaseBrowser', () => ({ supabase: { from: mocks.from } }))
vi.mock('next/navigation', () => ({ usePathname: () => '/' }))
vi.mock('@/contexts/SessionContext', () => ({ useSessionProfile: () => ({ role: mocks.role, user: mocks.user, loading: false }) }))
vi.mock('@/contexts/ClientFilterContext', () => ({
  useClientFilter: () => ({ canSelectClient: false, clients: [], selectedClient: null, selectedClientId: null, setSelectedClientId: vi.fn() }),
}))
function query() {
  const chain = { select: vi.fn(), neq: vi.fn(), order: vi.fn(), limit: vi.fn(), returns: vi.fn(), in: vi.fn() }
  for (const key of ['select', 'neq', 'order'] as const) chain[key].mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  chain.returns.mockResolvedValue({ data: [], error: null })
  chain.in.mockResolvedValue({ data: [], error: null })
  return chain
}
const clientNotification = {
  id: 'comment-a', artwork_id: 'work', user_id: 'editor', comment: 'Private reply for Client A',
  created_at: '2026-10-24T10:00:00Z', updated_at: '2026-10-24T10:00:00Z',
  recipient_contact_id: 'client-a',
  recipient: { company_name: 'Client A', first_name: null, last_name: null },
}
let comments: ReturnType<typeof query>
let container: HTMLDivElement
let root: Root
async function render() { await act(async () => root.render(<HeaderNav />)) }

describe('client comment notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    localStorage.clear()
    mocks.role = 'Viewer'
    mocks.user = { id: 'viewer-a' }
    comments = query()
    comments.returns.mockResolvedValue({ data: [clientNotification], error: null })
    const acquisitions = query()
    acquisitions.limit.mockResolvedValue({ data: [], error: null })
    const profiles = query()
    profiles.in.mockResolvedValue({ data: [{ id: 'editor', email: 'editor@example.com' }], error: null })
    const artworks = query()
    artworks.in.mockResolvedValue({ data: [{ id: 'work', title: 'Shared artwork', artist: [] }], error: null })
    mocks.from.mockImplementation(table => ({
      artwork_viewer_comments: comments, artwork_acquisition_events: acquisitions, profiles, artworks,
    })[table as 'profiles'])
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses the RLS-scoped comments query and labels the recipient in notifications', async () => {
    await render()
    expect(comments.select).toHaveBeenCalledWith(expect.stringContaining('recipient_contact_id'))
    expect(comments.neq).toHaveBeenCalledWith('user_id', 'viewer-a')
    const button = container.querySelector<HTMLButtonElement>('[aria-label^="Messages and acquisitions"]')!
    await act(async () => button.click())
    expect(container.textContent).toContain('Private reply for Client A')
    expect(container.textContent).toContain('Client A')
    expect(container.textContent).toContain('Shared artwork')
  })
  it('does not reuse old notification contents after changing the session user', async () => {
    await render()
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label^="Messages and acquisitions"]')!.click())
    mocks.user = { id: 'viewer-b' }
    comments.returns.mockReturnValue(new Promise(() => {}))
    await render()
    expect(container.textContent).not.toContain('Private reply for Client A')
    expect(container.textContent).not.toContain('Client A')
  })
  it('clears cached notifications when reloading fails instead of retaining private content', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await render()
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label^="Messages and acquisitions"]')!.click())
    comments.returns.mockResolvedValue({ data: null, error: { message: 'Permission denied' } })
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(container.textContent).not.toContain('Private reply for Client A')
    expect(container.textContent).toContain('No recent activity.')
  })
  it('allows staff to see internal notifications returned by RLS', async () => {
    mocks.role = 'Editor'
    comments.returns.mockResolvedValue({ data: [{
      ...clientNotification, recipient_contact_id: null, recipient: null, comment: 'Internal team note',
    }], error: null })
    await render()
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label^="Messages and acquisitions"]')!.click())
    expect(container.textContent).toContain('Internal team note')
    expect(container.textContent).toContain('Internal')
  })
})
