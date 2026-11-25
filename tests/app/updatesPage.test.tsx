// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UpdatesPage from '@/app/(protected)/updates/page'

const mocks = vi.hoisted(() => ({
  role: 'Viewer',
  single: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
}))
vi.mock('@/contexts/SessionContext', () => ({
  useSessionProfile: () => ({ user: { id: 'user' }, role: mocks.role }),
}))
vi.mock('@/lib/supabaseBrowser', () => {
  const query = {
    select: vi.fn(() => query),
    eq: mocks.eq,
    single: mocks.single,
    maybeSingle: mocks.maybeSingle,
    update: mocks.update,
  }
  mocks.eq.mockImplementation(() => query)
  mocks.update.mockImplementation(() => query)
  return { supabase: { from: vi.fn(() => query) } }
})

const documentData = { content: 'Latest improvements\nAuction sale ordering', updated_at: '2026-11-15T20:00:00Z' }
let container: HTMLDivElement
let root: Root

async function render() {
  await act(async () => root.render(<UpdatesPage />))
}

async function click(label: string) {
  const button = [...container.querySelectorAll('button')].find(item => item.textContent === label)
  if (!button) throw new Error(`Missing button: ${label}`)
  await act(async () => button.click())
}

async function enterText(text: string) {
  const editor = container.querySelector('[aria-label="Updates content"]') as HTMLDivElement
  await act(async () => {
    editor.textContent = text
    editor.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function enterHtml(html: string) {
  const editor = container.querySelector('[aria-label="Updates content"]') as HTMLDivElement
  await act(async () => {
    editor.innerHTML = html
    editor.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mocks.role = 'Viewer'
  mocks.single.mockResolvedValue({ data: documentData, error: null })
  mocks.maybeSingle.mockResolvedValue({
    data: { content: 'New release notes', updated_at: '2026-11-16T20:00:00Z' }, error: null,
  })
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

describe('shared Updates page', () => {
  it.each(['Viewer', 'Editor', 'Administrator'])('allows %s to read updates but only administrators to edit', async role => {
    mocks.role = role
    await render()
    expect(container.querySelector('article')?.textContent).toContain(documentData.content)
    expect(container.querySelector('time')?.dateTime).toBe(documentData.updated_at)
    expect(container.textContent?.includes('Edit updates')).toBe(role === 'Administrator')
    expect(container.querySelector('[role="textbox"]')).toBeNull()
  })

  it('lets an administrator save shared content with a stale-write guard and show the persisted result', async () => {
    mocks.role = 'Administrator'
    await render()
    await click('Edit updates')
    expect(container.querySelector('[aria-label="Updates content"]')?.innerHTML)
      .toBe('Latest improvements<br>Auction sale ordering')
    await enterText('New release notes')
    await click('Save updates')
    expect(mocks.update).toHaveBeenCalledWith({ content: 'New release notes' })
    expect(mocks.eq).toHaveBeenCalledWith('id', true)
    expect(mocks.eq).toHaveBeenCalledWith('updated_at', documentData.updated_at)
    expect(container.querySelector('[role="textbox"]')).toBeNull()
    expect(container.querySelector('article')?.textContent).toContain('New release notes')
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Updates saved.')
  })

  it('cancels edits without changing the saved document', async () => {
    mocks.role = 'Administrator'
    await render()
    await click('Edit updates')
    await enterText('Unsaved draft')
    await click('Cancel')
    expect(mocks.update).not.toHaveBeenCalled()
    expect(container.querySelector('article')?.textContent).toContain(documentData.content)
    await click('Edit updates')
    expect(container.querySelector('[aria-label="Updates content"]')?.innerHTML)
      .toBe('Latest improvements<br>Auction sale ordering')
  })

  it.each([
    { data: null, error: { message: 'Save denied' }, expected: 'Save denied' },
    { data: null, error: null, expected: 'The updates have changed or you no longer have permission' },
  ])('preserves the draft and reports failed or zero-row saves: $expected', async response => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.role = 'Administrator'
    mocks.maybeSingle.mockResolvedValue(response)
    await render()
    await click('Edit updates')
    await enterText('Keep this draft')
    await click('Save updates')
    expect(container.querySelector('[aria-label="Updates content"]')?.textContent).toBe('Keep this draft')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(response.expected)
    expect(container.textContent).not.toContain('Updates saved.')
  })

  it('reports a blank draft without sending a write', async () => {
    mocks.role = 'Administrator'
    await render()
    await click('Edit updates')
    await enterText('   ')
    await click('Save updates')
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Enter the updates before saving.')
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('shows load failures and supports retrying rather than displaying a false empty state', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.single.mockResolvedValueOnce({ data: null, error: { message: 'Load denied' } })
    await render()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Load denied')
    expect(container.textContent).not.toContain('No updates have been published')
    await click('Retry')
    expect(container.querySelector('article')?.textContent).toContain(documentData.content)
  })

  it('allows the administrator to publish the initially empty page', async () => {
    mocks.role = 'Administrator'
    mocks.single.mockResolvedValue({ data: { ...documentData, content: '' }, error: null })
    await render()
    expect(container.textContent).toContain('No updates have been published yet.')
    await click('Edit updates')
    await enterText('New release notes')
    await click('Save updates')
    expect(container.querySelector('article')?.textContent).toContain('New release notes')
  })

  it('saves and displays bold text as rich formatting', async () => {
    mocks.role = 'Administrator'
    mocks.maybeSingle.mockResolvedValue({
      data: { content: 'New **release** notes', updated_at: '2026-11-16T20:00:00Z' }, error: null,
    })
    await render()
    await click('Edit updates')
    await enterHtml('New <strong>release</strong> notes')
    await click('Save updates')
    expect(mocks.update).toHaveBeenCalledWith({ content: 'New **release** notes' })
    expect(container.querySelector('article strong')?.textContent).toBe('release')
  })
})
