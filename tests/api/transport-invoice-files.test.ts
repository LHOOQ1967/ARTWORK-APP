import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(), loadTransport: vi.fn(), loadArtwork: vi.fn(),
  update: vi.fn(), updated: vi.fn(), insert: vi.fn(), remove: vi.fn(),
  upload: vi.fn(), deleteFile: vi.fn(),
}))
vi.mock('@/lib/apiAuth', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/sharepoint', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/sharepoint')>(),
  uploadDocument: mocks.upload, deleteDocument: mocks.deleteFile,
}))
import { PATCH } from '@/app/api/transports/[id]/route'

const context = { params: Promise.resolve({ id: 'transport-1' }) }
const item = {
  id: 'item-1', driveId: 'drive-1', name: 'Invoice.pdf', size: 7,
  mimeType: 'application/pdf', webUrl: 'https://sharepoint.example/invoice',
}
function request(files = [new File(['invoice'], 'Invoice.pdf', { type: 'application/pdf' })], changes: unknown = { notes: 'Updated notes' }) {
  const form = new FormData()
  form.set('transport', JSON.stringify(changes))
  files.forEach(file => form.append('file', file))
  return new NextRequest('http://localhost/api/transports/transport-1', { method: 'PATCH', body: form })
}

describe('transport final invoice files', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.requireRole.mockResolvedValue({
      response: null,
      supabase: {
        from: (table: string) => table === 'artwork_transports' ? {
          select: () => ({ eq: () => ({ maybeSingle: mocks.loadTransport }) }),
          update: mocks.update,
        } : table === 'artworks' ? {
          select: () => ({ eq: () => ({ maybeSingle: mocks.loadArtwork }) }),
        } : {
          insert: mocks.insert, delete: () => ({ eq: mocks.remove }),
        },
      },
    })
    mocks.loadTransport.mockResolvedValue({ data: { artwork_id: 'artwork-1' }, error: null })
    mocks.loadArtwork.mockResolvedValue({ data: {
      id: 'artwork-1', title: 'Artwork', artist: { first_name: 'First', last_name: 'Artist' },
    }, error: null })
    mocks.update.mockReturnValue({ eq: () => ({ select: () => ({ maybeSingle: mocks.updated }) }) })
    mocks.updated.mockResolvedValue({ data: { id: 'transport-1' }, error: null })
    mocks.insert.mockResolvedValue({ error: null })
    mocks.remove.mockResolvedValue({ error: null })
    mocks.upload.mockResolvedValue(item)
    mocks.deleteFile.mockResolvedValue(undefined)
  })

  it('uploads into the artwork SharePoint folder and saves a protected document URL', async () => {
    expect((await PATCH(request(), context)).status).toBe(200)
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({
      folderPath: 'Artistes/Artist First/Artwork (artwork-)',
      fileName: 'Invoice.pdf', mimeType: 'application/pdf',
    }))
    const doc = mocks.insert.mock.calls[0][0]
    expect(doc).toMatchObject({
      artwork_id: 'artwork-1', label: 'Transport final invoice',
      document_type: 'link', storage_provider: 'sharepoint',
      visibility: 'all_clients', link_category: 'general',
      sharepoint_drive_id: item.driveId, sharepoint_item_id: item.id,
      file_name: item.name,
    })
    expect(doc.url).toMatch(/^\/api\/documents\/[0-9a-f-]{36}\/open$/)
    expect(mocks.update).toHaveBeenCalledWith({ notes: 'Updated notes', final_invoice_pdf_url: doc.url })
    expect(mocks.deleteFile).not.toHaveBeenCalled()
  })

  it('preserves an existing invoice when editing without a file', async () => {
    const incoming = new NextRequest('http://localhost/api/transports/transport-1', {
      method: 'PATCH', body: JSON.stringify({ notes: 'Only notes' }),
    })
    expect((await PATCH(incoming, context)).status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ notes: 'Only notes' })
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it.each([
    { files: [] }, { files: [new File([], 'empty.pdf')] },
    { files: [new File(['one'], 'one.pdf'), new File(['two'], 'two.pdf')] },
  ])('rejects missing, empty or multiple files (%j)', async ({ files }) => {
    expect((await PATCH(request(files), context)).status).toBe(400)
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it.each([[100 * 1024 * 1024, 200], [100 * 1024 * 1024 + 1, 413]])('enforces file size %s bytes', async (size, status) => {
    const incoming = request()
    const invoiceFile = new File(['invoice'], 'Invoice.pdf')
    Object.defineProperty(invoiceFile, 'size', { value: size })
    const form = new FormData()
    form.set('transport', '{}')
    form.set('file', invoiceFile)
    vi.spyOn(incoming, 'formData').mockResolvedValue(form)
    expect((await PATCH(incoming, context)).status).toBe(status)
    expect(mocks.upload).toHaveBeenCalledTimes(status === 200 ? 1 : 0)
  })

  it('requires Editor/Admin before reading the file', async () => {
    mocks.requireRole.mockResolvedValue({ response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    expect((await PATCH(request(), context)).status).toBe(403)
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it.each(['loadTransport', 'loadArtwork'] as const)('checks RLS before upload (%s)', async method => {
    mocks[method].mockResolvedValue({ data: null, error: null })
    expect((await PATCH(request(), context)).status).toBe(404)
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('rejects changing the artwork together with an invoice upload', async () => {
    expect((await PATCH(request(undefined, { artwork_id: 'another-artwork' }), context)).status).toBe(400)
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it.each([null, [], { transport_date: 'invalid' }])('rejects invalid transport data %j', async changes => {
    expect((await PATCH(request(undefined, changes), context)).status).toBe(400)
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it.each(['insert', 'updated'] as const)('cleans up file and document when %s fails', async method => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mocks[method].mockResolvedValue({ error: { message: 'Database unavailable' }, data: null })
      expect((await PATCH(request(), context)).status).toBe(500)
      expect(mocks.remove).toHaveBeenCalledOnce()
      expect(mocks.deleteFile).toHaveBeenCalledWith(item.driveId, item.id)
    } finally {
      log.mockRestore()
    }
  })

  it('cleans up if the transport disappeared during upload', async () => {
    mocks.updated.mockResolvedValue({ data: null, error: null })
    expect((await PATCH(request(), context)).status).toBe(404)
    expect(mocks.deleteFile).toHaveBeenCalledOnce()
  })

  it('reports SharePoint failures without saving a document or transport', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mocks.upload.mockRejectedValue(new Error('SharePoint unavailable'))
      expect((await PATCH(request(), context)).status).toBe(502)
      expect(mocks.insert).not.toHaveBeenCalled()
      expect(mocks.update).not.toHaveBeenCalled()
    } finally {
      log.mockRestore()
    }
  })

  it('surfaces cleanup failure rather than pretending the upload was removed', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mocks.updated.mockResolvedValue({ data: null, error: { message: 'Update failed' } })
      mocks.deleteFile.mockRejectedValue(new Error('Cleanup failed'))
      const response = await PATCH(request(), context)
      expect(response.status).toBe(500)
      expect((await response.json()).error).toContain('unsaved SharePoint invoice')
    } finally {
      log.mockRestore()
    }
  })
})
