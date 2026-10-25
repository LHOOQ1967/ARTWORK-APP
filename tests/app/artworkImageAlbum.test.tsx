// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ArtworkImageAlbum, { type AlbumImage } from '@/components/artwork/ArtworkImageAlbum'

const images: AlbumImage[] = [
  { id: 'first', url: '/api/documents/first/open', label: 'Front', downloadUrl: '/api/documents/first/open?download=1' },
  { id: 'second', url: '/api/documents/second/open', label: 'Signature', downloadUrl: '/api/documents/second/open?download=1' },
]
let root: Root
let container: HTMLDivElement
const onClose = vi.fn()

async function click(label: string) {
  await act(async () => container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click())
}
async function render(initialId = 'first', albumImages = images) {
  await act(async () => root.render(<ArtworkImageAlbum images={albumImages} initialId={initialId} onClose={onClose} />))
}

describe('artwork image albums', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true, value: function (this: HTMLDialogElement) { this.open = true },
    })
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true, value: function (this: HTMLDialogElement) { this.open = false },
    })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
    vi.unstubAllGlobals()
  })

  it('opens at the clicked image and navigates in both directions with wraparound', async () => {
    await render('second')
    expect(container.querySelector('dialog')?.open).toBe(true)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/api/documents/second/open')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('2 / 2')
    await click('Next image')
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('Front')
    await click('Previous image')
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('Signature')
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/api/documents/second/open?download=1')
  })

  it('supports keyboard navigation and Escape cancellation', async () => {
    await render()
    await act(async () => container.querySelector('dialog')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    ))
    expect(container.querySelector('[role="status"]')?.textContent).toBe('2 / 2')
    await act(async () => container.querySelector('dialog')!.dispatchEvent(new Event('cancel')))
    expect(onClose).toHaveBeenCalled()
  })

  it('offers an explicit error and download when a browser cannot display the image', async () => {
    await render()
    await act(async () => container.querySelector('img')!.dispatchEvent(new Event('error')))
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('cannot be displayed')
    expect(container.querySelector('a')?.getAttribute('href')).toContain('?download=1')
    await click('Next image')
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('Signature')
  })

  it('disables navigation for a single image and closes via the button', async () => {
    await render('first', [images[0]])
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Next image"]')?.disabled).toBe(true)
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Previous image"]')?.disabled).toBe(true)
    await click('Close image album')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('restores scrolling and focus on unmount', async () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    document.body.style.overflow = 'auto'
    await render()
    expect(document.body.style.overflow).toBe('hidden')
    await act(async () => root.render(null))
    expect(document.body.style.overflow).toBe('auto')
    expect(document.activeElement).toBe(opener)
    opener.remove()
    document.body.style.overflow = ''
  })

  it('supports horizontal swipes', async () => {
    await render()
    const surface = container.querySelector('img')!.parentElement!
    await act(async () => {
      const start = new Event('touchstart', { bubbles: true })
      Object.defineProperty(start, 'touches', { value: [{ clientX: 200 }] })
      surface.dispatchEvent(start)
      const end = new Event('touchend', { bubbles: true })
      Object.defineProperty(end, 'changedTouches', { value: [{ clientX: 100 }] })
      surface.dispatchEvent(end)
    })
    expect(container.querySelector('[role="status"]')?.textContent).toBe('2 / 2')
  })
})
