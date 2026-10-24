// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CertificateAddress, CertificateLocationHistory } from '@/components/artwork/CertificateLocation'

const mocks = vi.hoisted(() => ({ from: vi.fn(), single: vi.fn(), range: vi.fn() }))
vi.mock('@/lib/supabaseBrowser', () => ({ supabase: { from: mocks.from } }))
let container: HTMLDivElement
let root: Root
let chain: { select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; order: ReturnType<typeof vi.fn>; single: typeof mocks.single; range: typeof mocks.range }
async function history() {
  await act(async () => root.render(<CertificateLocationHistory artworkId="artwork-1" />))
  await act(async () => container.querySelector('button')!.click())
}

describe('certificate location and history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true } })
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) {
      this.open = false
      this.dispatchEvent(new Event('close'))
    } })
    chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), single: mocks.single, range: mocks.range }
    chain.select.mockReturnValue(chain)
    chain.eq.mockReturnValue(chain)
    chain.order.mockReturnValue(chain)
    mocks.from.mockReturnValue(chain)
    mocks.range.mockResolvedValue({ data: [], error: null })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('loads the selected address and clears it when the selection is removed', async () => {
    mocks.single.mockResolvedValue({ data: { label: 'Safe', address: '1 Main Street', city: 'Geneva', country: 'Switzerland' }, error: null })
    await act(async () => root.render(<CertificateAddress addressId="address-1" />))
    expect(container.textContent).toBe('Safe, 1 Main Street, Geneva, Switzerland')
    expect(chain.eq).toHaveBeenCalledWith('id', 'address-1')
    await act(async () => root.render(<CertificateAddress addressId={null} />))
    expect(container.textContent).toBe('')
  })

  it('shows old and new location snapshots, date, actor and initial-record label', async () => {
    mocks.range.mockResolvedValue({ data: [{
      id: 'change-1', old_location: 'Office / Safe', new_location: 'Client / Home',
      actor_email: 'editor@example.com', created_at: '2026-10-24T10:00:00Z', is_initial: true,
    }], error: null })
    await history()
    const dialog = document.querySelector('dialog')!
    expect(dialog.textContent).toContain('Office / Safe')
    expect(dialog.textContent).toContain('Client / Home')
    expect(dialog.textContent).toContain('editor@example.com')
    expect(dialog.textContent).toContain('24/10/2026')
    expect(dialog.textContent).toContain('initial record')
    expect(chain.eq).toHaveBeenCalledWith('artwork_id', 'artwork-1')
    await act(async () => dialog.querySelector('button')!.click())
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('paginates history rather than truncating it', async () => {
    const entry = { old_location: null, new_location: 'Safe', actor_email: null, created_at: '2026-10-24', is_initial: false }
    mocks.range.mockResolvedValueOnce({ data: Array.from({ length: 200 }, (_, i) => ({ ...entry, id: String(i) })), error: null })
      .mockResolvedValueOnce({ data: [{ ...entry, id: 'last' }], error: null })
    await history()
    expect(mocks.range).toHaveBeenNthCalledWith(2, 200, 399)
    expect(document.querySelectorAll('tbody tr')).toHaveLength(201)
    expect(document.querySelector('dialog')!.textContent).toContain('Not specified')
  })

  it('surfaces history query failures', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.range.mockResolvedValue({ data: null, error: { message: 'Permission denied' } })
    await history()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Unable to load certificate location history')
    expect(log).toHaveBeenCalled()
  })

  it('surfaces address errors rather than showing a blank location', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.single.mockResolvedValue({ data: null, error: { message: 'Missing address' } })
    await act(async () => root.render(<CertificateAddress addressId="missing" />))
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Unable to load certificate address.')
  })
})
