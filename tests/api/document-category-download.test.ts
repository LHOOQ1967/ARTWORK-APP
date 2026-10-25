import { NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(), from: vi.fn(), eq: vi.fn(), in: vi.fn(), range: vi.fn(),
  returns: vi.fn(), downloadDocument: vi.fn(),
}))
vi.mock('@/lib/apiAuth', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/sharepoint', () => ({ downloadDocument: mocks.downloadDocument }))
import { GET } from '@/app/api/artworks/[id]/documents/download/route'

const context = { params: Promise.resolve({ id: 'work' }) }
const document = {
  id: 'doc-1', file_name: 'report.pdf', link_category: 'general',
  sharepoint_drive_id: 'drive', sharepoint_item_id: 'item-1',
}
function request(query = 'category=general') {
  return new Request(`https://artmuse.test/api/artworks/work/documents/download?${query}`)
}

function entries(buffer: Buffer) {
  const end = buffer.length - 22
  expect(buffer.readUInt32LE(end)).toBe(0x06054b50)
  const count = buffer.readUInt16LE(end + 10)
  let offset = buffer.readUInt32LE(end + 16)
  const files: { name: string; content: string }[] = []
  for (let index = 0; index < count; index++) {
    expect(buffer.readUInt32LE(offset)).toBe(0x02014b50)
    const size = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const local = buffer.readUInt32LE(offset + 42)
    const contentOffset = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28)
    files.push({
      name: buffer.subarray(offset + 46, offset + 46 + nameLength).toString(),
      content: buffer.subarray(contentOffset, contentOffset + size).toString(),
    })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return files
}

describe('category ZIP downloads', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const chain = {
      select: vi.fn(), eq: mocks.eq, in: mocks.in, order: vi.fn(), range: mocks.range,
      returns: mocks.returns,
    }
    for (const method of ['select', 'eq', 'in', 'order', 'range'] as const) chain[method].mockReturnValue(chain)
    mocks.from.mockReturnValue(chain)
    mocks.requireUser.mockResolvedValue({ role: 'Viewer', supabase: { from: mocks.from } })
    mocks.returns.mockResolvedValue({ data: [document], error: null })
    mocks.downloadDocument.mockImplementation(async (_drive, id) => new Response(`File ${id}`))
  })
  afterEach(() => vi.restoreAllMocks())

  it('streams a valid ZIP containing only RLS-returned files with category folders', async () => {
    mocks.returns.mockResolvedValue({ data: [
      document,
      { ...document, id: 'doc-2', sharepoint_item_id: 'item-2', file_name: 'photo.jpg', link_category: 'images' },
    ], error: null })
    const response = await GET(request('category=general&category=images'), context)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/zip')
    expect(response.headers.get('content-disposition')).toContain('attachment;')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(entries(Buffer.from(await response.arrayBuffer()))).toEqual([
      { name: 'General/report.pdf', content: 'File item-1' },
      { name: 'Images/photo.jpg', content: 'File item-2' },
    ])
    expect(mocks.eq).toHaveBeenCalledWith('artwork_id', 'work')
    expect(mocks.eq).toHaveBeenCalledWith('storage_provider', 'sharepoint')
    expect(mocks.in).toHaveBeenCalledWith('link_category', ['general', 'images'])
    expect(mocks.in).toHaveBeenCalledWith('document_type', ['link', 'onedrive'])
    expect(mocks.downloadDocument).toHaveBeenCalledTimes(2)
  })

  it('keeps duplicate filenames and sanitizes archive paths', async () => {
    mocks.returns.mockResolvedValue({ data: [
      document, { ...document, id: 'doc-2' },
      { ...document, id: 'doc-3', file_name: '../../escape.pdf' },
    ], error: null })
    const response = await GET(request(), context)
    const files = entries(Buffer.from(await response.arrayBuffer()))
    expect(files.map(file => file.name)).toEqual([
      'General/report.pdf', 'General/report (2).pdf', 'General/_.._escape.pdf',
    ])
    expect(files.every(file => !file.name.split('/').includes('..'))).toBe(true)
  })

  it('paginates beyond 200 files without omitting documents', async () => {
    mocks.returns.mockResolvedValueOnce({ data: Array.from({ length: 200 }, (_, index) => ({
      ...document, id: `doc-${index}`, file_name: `file-${index}.pdf`,
    })), error: null }).mockResolvedValueOnce({ data: [{ ...document, file_name: 'last.pdf' }], error: null })
    const response = await GET(request(), context)
    expect(entries(Buffer.from(await response.arrayBuffer()))).toHaveLength(201)
    expect(mocks.range.mock.calls).toEqual([[0, 199], [200, 399]])
  })

  it.each(['', 'category=other', 'category=general&category=invalid'])('rejects invalid selection %s', async query => {
    expect((await GET(request(query), context)).status).toBe(400)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('requires authorization', async () => {
    mocks.requireUser.mockResolvedValue({ response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) })
    expect((await GET(request(), context)).status).toBe(401)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('does not download any file when RLS returns no accessible files', async () => {
    mocks.returns.mockResolvedValue({ data: [], error: null })
    expect((await GET(request(), context)).status).toBe(404)
    expect(mocks.downloadDocument).not.toHaveBeenCalled()
  })

  it('surfaces query failures', async () => {
    mocks.returns.mockResolvedValue({ data: null, error: { message: 'Database unavailable' } })
    expect((await GET(request(), context)).status).toBe(502)
    expect(mocks.downloadDocument).not.toHaveBeenCalled()
  })

  it('surfaces initial SharePoint failures before sending a ZIP', async () => {
    mocks.downloadDocument.mockRejectedValue(new Error('SharePoint unavailable'))
    expect((await GET(request(), context)).status).toBe(502)
  })

  it('aborts the download rather than silently skipping failed files', async () => {
    mocks.returns.mockResolvedValue({ data: [document, { ...document, id: 'doc-2' }], error: null })
    mocks.downloadDocument.mockResolvedValueOnce(new Response('First file')).mockRejectedValueOnce(new Error('File unavailable'))
    const response = await GET(request(), context)
    await expect(response.arrayBuffer()).rejects.toThrow('File unavailable')
    expect(console.error).toHaveBeenCalled()
  })
})
