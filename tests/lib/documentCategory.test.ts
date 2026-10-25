import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOCUMENT_CATEGORIES, groupDocumentLinks, isDocumentCategory, saveDocumentLinkCategory } from '@/lib/documentCategory'

afterEach(() => vi.unstubAllGlobals())

describe('document link categories', () => {
  it('offers exactly three groups in the expected order', () => {
    expect(DOCUMENT_CATEGORIES).toEqual(['general', 'images', 'exhibitions_literature'])
    expect(groupDocumentLinks([]).map(group => group.label))
      .toEqual(['General', 'Images', 'Exhibitions & Literature'])
  })

  it.each(['', null, 'General', 'literature', 3, {}])('rejects invalid category %j', value => {
    expect(isDocumentCategory(value)).toBe(false)
  })

  it('defaults legacy records to General, preserves ordering and does not group by file extension', () => {
    const documents = [
      { id: 'old', label: 'Legacy' },
      { id: 'scan', label: 'catalogue.jpg', link_category: 'exhibitions_literature' as const },
      { id: 'photos', label: 'Photo archive.pdf', link_category: 'images' as const },
      { id: 'report', label: 'Report', link_category: 'general' as const },
    ]
    expect(groupDocumentLinks(documents).map(group => group.documents.map(document => document.id)))
      .toEqual([['old', 'report'], ['photos'], ['scan']])
    expect(documents[0]).not.toHaveProperty('link_category')
  })

  it('updates only the category and requires confirmation from the server', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: 'doc', link_category: 'images' }))
    vi.stubGlobal('fetch', fetchMock)
    await saveDocumentLinkCategory('work', 'doc', 'images')
    expect(fetchMock).toHaveBeenCalledWith('/api/artworks/work/documents/doc', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link_category: 'images' }),
    })
  })

  it.each([
    [null, 200, 'not confirmed'],
    [{ id: 'other', link_category: 'images' }, 200, 'not confirmed'],
    [{ id: 'doc', link_category: 'general' }, 200, 'not confirmed'],
    [{ error: 'Forbidden' }, 403, 'Forbidden'],
  ])('rejects failed or unconfirmed category writes', async (body, status, error) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body, { status })))
    await expect(saveDocumentLinkCategory('work', 'doc', 'images')).rejects.toThrow(error)
  })
})
