// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import ArtworkList from '@/components/artwork/ArtworkList'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/contexts/SessionContext', () => ({ useSessionProfile: () => ({ role: 'Editor' }) }))
vi.mock('@/lib/supabaseBrowser', () => ({ supabase: {} }))

it('uses the surname only when the measured full name does not fit, and restores it after resizing', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  let resize = () => {}
  let width = 120
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback }
    observe() {}
    disconnect() {}
  })
  const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width)
  const scrollWidth = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(180)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<ArtworkList artworks={[{
      id: 'work', artist: { id: 'artist', first_name: 'Thomas', last_name: 'SCHUTTE' },
    }]} canEditStatusPriority statusOptions={['Viewed']} onUpdateArtworkField={vi.fn()} />))
    const name = container.querySelector('[title="Thomas SCHUTTE"]')!
    expect(name.lastChild?.textContent).toBe('SCHUTTE')
    width = 220
    await act(async () => resize())
    expect(name.lastChild?.textContent).toBe('Thomas SCHUTTE')
    const status = container.querySelector<HTMLSelectElement>('[aria-label="Status"]')!
    const priority = container.querySelector<HTMLSelectElement>('[aria-label="Priority"]')!
    expect(status.style.width).toBe('88px')
    expect(priority.style.width).toBe('77px')
  } finally {
    await act(async () => root.unmount())
    container.remove()
    clientWidth.mockRestore()
    scrollWidth.mockRestore()
    vi.unstubAllGlobals()
  }
})
