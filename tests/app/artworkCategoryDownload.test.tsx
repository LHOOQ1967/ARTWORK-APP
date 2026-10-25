// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ArtworkCategoryDownload from '@/components/artwork/ArtworkCategoryDownload'

let container: HTMLDivElement
let root: Root
describe('category download selection', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it('selects multiple categories, counts files and reports excluded external links', async () => {
    await act(async () => root.render(<ArtworkCategoryDownload artworkId="work" documents={[
      { storage_provider: 'sharepoint', link_category: 'general' },
      { storage_provider: 'sharepoint', link_category: 'images' },
      { storage_provider: 'legacy', link_category: 'images' },
      { storage_provider: 'sharepoint', link_category: 'exhibitions_literature' },
    ]} />))
    expect(container.querySelector('button')?.disabled).toBe(true)
    expect(container.querySelector('a')).toBeNull()
    const checkboxes = container.querySelectorAll<HTMLInputElement>('input')
    await act(async () => { checkboxes[0].click(); checkboxes[1].click() })
    expect(container.querySelector('a')?.getAttribute('href'))
      .toBe('/api/artworks/work/documents/download?category=general&category=images')
    expect(container.querySelector('a')?.textContent).toContain('2 files')
    expect(container.querySelector('[role="status"]')?.textContent).toContain('1 external link(s)')
    await act(async () => checkboxes[0].click())
    expect(container.querySelector('a')?.getAttribute('href'))
      .toBe('/api/artworks/work/documents/download?category=images')
  })

  it('cannot download a category containing only external links', async () => {
    await act(async () => root.render(<ArtworkCategoryDownload artworkId="work" documents={[
      { link_category: 'general', storage_provider: 'legacy' },
    ]} />))
    await act(async () => container.querySelector<HTMLInputElement>('input')!.click())
    expect(container.querySelector('button')?.disabled).toBe(true)
    expect(container.querySelector('[role="status"]')?.textContent).toContain('1 external link(s)')
  })
})
