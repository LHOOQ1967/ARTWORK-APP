// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import ArtworkPrintToolbar from '@/components/artwork/ArtworkPrintToolbar'

describe('floating factsheet toolbar', () => {
  it('tracks header height, reserves space and cleans up its observer', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    let resize = () => {}
    const disconnect = vi.fn()
    const observe = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resize = callback }
      observe = observe
      disconnect = disconnect
    })
    const header = document.createElement('header')
    header.className = 'app-header'
    let bottom = 60
    vi.spyOn(header, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, 100, bottom))
    const container = document.createElement('div')
    document.body.append(header, container)
    const root = createRoot(container)
    try {
      await act(async () => root.render(<ArtworkPrintToolbar floating><button>Print</button></ArtworkPrintToolbar>))
      const toolbar = container.querySelector<HTMLDivElement>('[aria-label="Artwork status and actions"]')!
      expect(toolbar.className).toBe('artwork-print-toolbar-floating')
      expect(toolbar.style.top).toBe('68px')
      expect(observe).toHaveBeenCalledWith(header)
      bottom = 116
      await act(async () => resize())
      expect(toolbar.style.top).toBe('124px')
      expect(container.querySelector('.artwork-print-toolbar-space')).not.toBeNull()
      await act(async () => root.render(<ArtworkPrintToolbar floating={false}><button>Print</button></ArtworkPrintToolbar>))
      expect(container.querySelector('.artwork-print-toolbar-floating')).toBeNull()
      expect(disconnect).toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      header.remove()
      container.remove()
      vi.restoreAllMocks()
      vi.unstubAllGlobals()
    }
  })
})
