// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import ArtworkThumbnail from '@/components/artwork/ArtworkThumbnail'
import { privateImageUrl } from '@/lib/privateImageUrl'

const source = 'https://db.test/storage/v1/object/public/artwork-images/work/photo.jpg'

describe('artwork list thumbnail', () => {
  it('uses a lazy thumbnail and shows an explicit failure without loading the original', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const container = document.createElement('div')
    const root = createRoot(container)
    try {
      await act(async () => root.render(<ArtworkThumbnail url={source} />))
      const image = container.querySelector('img')!
      expect(image.getAttribute('src')).toBe(privateImageUrl(source, true))
      expect(image.getAttribute('loading')).toBe('lazy')
      expect(image.getAttribute('width')).toBe('80')
      expect(image.getAttribute('height')).toBe('70')
      await act(async () => image.dispatchEvent(new Event('error')))
      expect(container.querySelector('[aria-label="Image unavailable"]')).not.toBeNull()
      expect(container.querySelector('img')).toBeNull()
      await act(async () => root.render(<ArtworkThumbnail url={`${source}?v=2`} />))
      expect(container.querySelector('img')).not.toBeNull()
    } finally {
      await act(async () => root.unmount())
      vi.unstubAllGlobals()
    }
  })

  it('leaves original and external URLs unchanged unless the thumbnail mode is requested for storage', () => {
    expect(privateImageUrl(source)).not.toContain('thumbnail=1')
    expect(privateImageUrl(source, true)).toContain('thumbnail=1')
    expect(privateImageUrl('https://external.test/photo.jpg', true)).toBe('https://external.test/photo.jpg')
    expect(privateImageUrl(null, true)).toBe('')
  })
})
