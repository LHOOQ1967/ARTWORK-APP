// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ArtworkViewerComments from '@/components/artwork/ArtworkViewerComment'

const mocks = vi.hoisted(() => ({
  role: 'Editor', user: { id: 'editor' }, from: vi.fn(), rpc: vi.fn(),
}))
vi.mock('@/lib/supabaseBrowser', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@/contexts/SessionContext', () => ({ useSessionProfile: () => ({ role: mocks.role, user: mocks.user }) }))
const clients = [{ id: 'client-a', label: 'Client A' }, { id: 'client-b', label: 'Client B' }]
const ownComment = {
  id: 'own', artwork_id: 'work', user_id: 'editor', recipient_contact_id: null,
  comment: '<p>Internal staff note</p>', created_at: '2026-10-24T10:00:00Z', updated_at: '2026-10-24T10:00:00Z',
  recipient: null,
}
const clientComment = {
  ...ownComment, id: 'client-note', user_id: 'viewer', recipient_contact_id: 'client-a',
  comment: 'Viewer A message', recipient: { company_name: 'Client A', first_name: null, last_name: null },
}
let history: ReturnType<typeof query>
let profiles: ReturnType<typeof query>
let container: HTMLDivElement
let root: Root
function query() {
  const chain = {
    select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), returns: vi.fn(),
    in: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), single: vi.fn(),
  }
  for (const key of ['select', 'eq', 'order', 'range', 'insert', 'update', 'delete'] as const) chain[key].mockReturnValue(chain)
  chain.single.mockResolvedValue({ data: { id: 'saved' }, error: null })
  return chain
}
async function render(artworkId = 'work') {
  await act(async () => root.render(<ArtworkViewerComments artworkId={artworkId} />))
}
async function choose(label: string, value: string) {
  await act(async () => {
    const select = container.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
async function type(text: string) {
  await act(async () => {
    const editor = container.querySelector('[aria-label="Comment"]')!
    editor.innerHTML = text
    editor.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function click(text: string) {
  const button = Array.from(container.querySelectorAll('button')).find(item => item.textContent === text)
  if (!button) throw new Error(`Missing button: ${text}`)
  await act(async () => button.click())
}

describe('client-addressed artwork comments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    mocks.role = 'Editor'
    mocks.user = { id: 'editor' }
    mocks.rpc.mockResolvedValue({ data: clients, error: null })
    history = query()
    history.returns.mockResolvedValue({ data: [ownComment, clientComment], error: null })
    profiles = query()
    profiles.in.mockResolvedValue({ data: [{ id: 'viewer', email: 'viewer@example.com' }], error: null })
    mocks.from.mockImplementation(table => table === 'profiles' ? profiles : history)
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

  it.each(['Editor', 'Administrator'])('allows %s to read all supplied comments and send a comment to a client', async role => {
    mocks.role = role
    await render()
    expect(container.textContent).toContain('Internal staff note')
    expect(container.textContent).toContain('Viewer A message')
    expect(mocks.rpc).toHaveBeenCalledWith('artwork_comment_clients', { p_artwork_id: 'work' })
    await choose('Comment client', 'client-b')
    await type('Reply for B')
    await click('Save Comment')
    expect(history.insert).toHaveBeenCalledWith({
      artwork_id: 'work', user_id: 'editor', recipient_contact_id: 'client-b', comment: 'Reply for B',
    })
  })
  it('keeps internal staff comments explicitly marked and allows manual attribution of legacy notes', async () => {
    await render()
    expect(container.textContent).toContain('Internal (Editors / Administrators only)')
    await choose('Client for comment client-note', 'client-b')
    expect(history.update).toHaveBeenCalledWith({ recipient_contact_id: 'client-b', updated_by: 'editor' })
    expect(history.eq).toHaveBeenCalledWith('id', 'client-note')
  })
  it('preserves the visible draft when assigning an existing comment reloads the history', async () => {
    await render()
    await type('Unsent staff draft')
    await choose('Client for comment client-note', 'client-b')
    expect(container.querySelector('[aria-label="Comment"]')?.textContent).toBe('Unsent staff draft')
    await choose('Comment client', 'client-a')
    await click('Save Comment')
    expect(history.insert).toHaveBeenCalledWith(expect.objectContaining({ comment: 'Unsent staff draft' }))
  })
  it('automatically addresses Viewer comments to their single eligible client', async () => {
    mocks.role = 'Viewer'
    mocks.user = { id: 'viewer' }
    mocks.rpc.mockResolvedValue({ data: [clients[0]], error: null })
    history.returns.mockResolvedValue({ data: [clientComment], error: null })
    await render()
    expect(container.textContent).not.toContain('Internal staff note')
    expect(container.querySelector('[aria-label="Client for comment client-note"]')).toBeNull()
    expect(container.querySelector<HTMLSelectElement>('[aria-label="Comment client"]')?.value).toBe('client-a')
    await type('My client conversation')
    await click('Save Comment')
    expect(history.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'viewer', recipient_contact_id: 'client-a' }))
  })
  it('requires a recipient for a Viewer linked to multiple clients and never offers internal comments', async () => {
    mocks.role = 'Viewer'
    await render()
    const select = container.querySelector<HTMLSelectElement>('[aria-label="Comment client"]')!
    expect(select.textContent).not.toContain('Internal')
    await type('Choose client first')
    const save = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Save Comment')!
    expect(save.disabled).toBe(true)
    expect(history.insert).not.toHaveBeenCalled()
    await choose('Comment client', 'client-b')
    await click('Save Comment')
    expect(history.insert).toHaveBeenCalledWith(expect.objectContaining({ recipient_contact_id: 'client-b' }))
  })
  it('does not allow a Viewer without an eligible client to submit', async () => {
    mocks.role = 'Viewer'
    mocks.rpc.mockResolvedValue({ data: [], error: null })
    history.returns.mockResolvedValue({ data: [], error: null })
    await render()
    await type('No client')
    await click('Save Comment')
    expect(history.insert).not.toHaveBeenCalled()
  })
  it('updates the owner comment while preserving the chosen recipient', async () => {
    mocks.role = 'Viewer'
    mocks.user = { id: 'viewer' }
    mocks.rpc.mockResolvedValue({ data: [clients[0]], error: null })
    history.returns.mockResolvedValue({ data: [clientComment], error: null })
    await render()
    await click('Edit')
    await type('Revised message')
    await click('Save Comment')
    expect(history.update).toHaveBeenCalledWith({
      comment: 'Revised message', recipient_contact_id: 'client-a', updated_by: 'viewer',
    })
    expect(history.eq).toHaveBeenCalledWith('user_id', 'viewer')
  })
  it('does not provide edit or delete controls for another author', async () => {
    history.returns.mockResolvedValue({ data: [clientComment], error: null })
    await render()
    expect(container.querySelector('[aria-label="Edit comment"]')).toBeNull()
    expect(container.querySelector('[aria-label="Delete comment"]')).toBeNull()
  })
  it('detects denied or zero-row saves and keeps the draft', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    history.single.mockResolvedValue({ data: null, error: null })
    await render()
    await type('Keep this draft')
    await click('Save Comment')
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Unable to save the comment.')
    expect(container.querySelector('[aria-label="Comment"]')?.textContent).toBe('Keep this draft')
    expect(container.textContent).not.toContain('Saved')
  })
  it('surfaces recipient load failures and does not show cached comments', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await render()
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Permission denied' } })
    await render('different-work')
    expect(container.textContent).not.toContain('Internal staff note')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Unable to load client comments')
    mocks.rpc.mockResolvedValue({ data: [], error: null })
    history.returns.mockResolvedValue({ data: [], error: null })
    await click('Retry')
    expect(container.textContent).not.toContain('Unable to load')
  })
  it('loads every history page instead of silently truncating comments', async () => {
    history.returns.mockResolvedValueOnce({
      data: Array.from({ length: 200 }, (_, i) => ({ ...clientComment, id: `comment-${i}` })), error: null,
    }).mockResolvedValueOnce({ data: [{ ...clientComment, id: 'last' }], error: null })
    await render()
    expect(history.range).toHaveBeenCalledWith(200, 399)
    expect(container.querySelectorAll('time')).toHaveLength(201)
  })
  it('does not show comments from a previous session identity while the new request is pending', async () => {
    await render()
    mocks.user = { id: 'viewer' }
    mocks.role = 'Viewer'
    mocks.rpc.mockReturnValue(new Promise(() => {}))
    await render()
    expect(container.textContent).not.toContain('Internal staff note')
    expect(container.textContent).not.toContain('Viewer A message')
    expect(container.textContent).toContain('Loading client comments')
  })
  it('keeps previous comments hidden when a later history page fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    history.returns.mockResolvedValueOnce({
      data: Array.from({ length: 200 }, (_, i) => ({ ...clientComment, id: String(i) })), error: null,
    }).mockResolvedValueOnce({ data: null, error: { message: 'Page failed' } })
    await render()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Unable to load client comments')
    expect(container.textContent).not.toContain('Viewer A message')
  })
  it('deletes only the author-owned comment and confirms the deletion result', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await render()
    await click('Delete')
    expect(history.delete).toHaveBeenCalled()
    expect(history.eq).toHaveBeenCalledWith('id', 'own')
    expect(history.eq).toHaveBeenCalledWith('user_id', 'editor')
  })
  it('does not report recipient assignment failures as success', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    history.single.mockResolvedValue({ data: null, error: { message: 'RLS denied' } })
    await render()
    await choose('Client for comment own', 'client-a')
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Unable to change the comment recipient.')
    expect(container.querySelector<HTMLSelectElement>('[aria-label="Client for comment own"]')?.value).toBe('')
  })
})
