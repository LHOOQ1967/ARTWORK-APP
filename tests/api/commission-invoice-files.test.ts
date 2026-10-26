import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(), requireUser: vi.fn(), rpc: vi.fn(),
  insert: vi.fn(), remove: vi.fn(), maybeSingle: vi.fn(),
  uploadDocument: vi.fn(), deleteDocument: vi.fn(), downloadDocument: vi.fn(), loadArtworks: vi.fn(),
}))
vi.mock('@/lib/apiAuth', () => ({
  requireRole: mocks.requireRole, requireUser: mocks.requireUser,
}))
vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }))
vi.mock('@/lib/sharepoint', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/sharepoint')>(),
  uploadDocument: mocks.uploadDocument,
  deleteDocument: mocks.deleteDocument,
  downloadDocument: mocks.downloadDocument,
}))

import { POST } from '@/app/api/commissions/route'

const artworkInvoice = {
  kind: 'artwork', artworkId: 'art-1', invoicedAt: '2026-10-26',
  commissionAmount: 800, invoiceUrl: '',
}
const correctionInvoice = {
  kind: 'correction', calendarYear: 2026, company: 'Florac', invoicedAt: '2026-10-26',
  artworkCommissions: [{ artworkId: 'art-1', commissionAmount: 700 }],
}
const item = {
  id: 'item-1', driveId: 'drive-1', name: 'Invoice.pdf', size: 7,
  mimeType: 'application/pdf', webUrl: 'https://sharepoint.example/invoice',
}
function uploadRequest(invoice: unknown = artworkInvoice, files = [
  new File(['invoice'], 'Invoice.pdf', { type: 'application/pdf' }),
]) {
  const form = new FormData()
  form.set('invoice', JSON.stringify(invoice))
  files.forEach(file => form.append('file', file))
  return new NextRequest('http://localhost/api/commissions', { method: 'POST', body: form })
}
function jsonRequest(invoice: unknown) {
  return new NextRequest('http://localhost/api/commissions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(invoice),
  })
}

describe('commission invoice files', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    const supabase = {
      rpc: mocks.rpc,
      from: vi.fn((table: string) => table === 'artworks' ? {
        select: () => ({ in: mocks.loadArtworks }),
      } : ({
        insert: mocks.insert,
        delete: () => ({ in: mocks.remove }),
        select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
      })),
    }
    const authorization = { response: null, supabase, userId: 'editor-1', role: 'Editor' }
    mocks.requireRole.mockResolvedValue(authorization)
    mocks.requireUser.mockResolvedValue(authorization)
    mocks.rpc.mockResolvedValue({ error: null })
    mocks.loadArtworks.mockResolvedValue({ data: [{
      id: 'art-1', title: 'Artwork', artist: { first_name: 'First', last_name: 'Artist' },
    }], error: null })
    mocks.insert.mockResolvedValue({ error: null })
    mocks.remove.mockResolvedValue({ error: null })
    mocks.uploadDocument.mockResolvedValue(item)
    mocks.deleteDocument.mockResolvedValue(undefined)
    mocks.downloadDocument.mockImplementation(async () => new Response('invoice'))
    mocks.maybeSingle.mockResolvedValue({
      data: {
        sharepoint_drive_id: 'drive-1', sharepoint_item_id: 'item-1',
        file_name: 'Invoice.pdf', mime_type: 'application/pdf',
      },
      error: null,
    })
  })

  it.each([
    [artworkInvoice, 'record_artwork_commission_invoice', 'invoice'],
    [correctionInvoice, 'record_artwork_commission_correction_invoice', 'correctionInvoice'],
  ])('uploads one file and saves the %j invoice', async (invoice, rpc, key) => {
    const response = await POST(uploadRequest(invoice))
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload[key].invoice_url).toMatch(/^\/api\/documents\/[0-9a-f-]{36}\/open$/)
    expect(mocks.uploadDocument).toHaveBeenCalledOnce()
    expect(mocks.uploadDocument).toHaveBeenCalledWith(expect.objectContaining({
      folderPath: 'Artistes/Artist First/Artwork (art-1)', fileName: 'Invoice.pdf',
      mimeType: 'application/pdf',
    }))
    expect(mocks.insert).toHaveBeenCalledWith([expect.objectContaining({
      artwork_id: 'art-1', sharepoint_drive_id: 'drive-1', sharepoint_item_id: 'item-1',
      visibility: 'all_clients', document_type: 'link',
    })])
    expect(mocks.rpc).toHaveBeenCalledWith(rpc, expect.objectContaining({
      p_invoice_url: payload[key].invoice_url, p_invoiced_at: '2026-10-26',
    }))
    expect(mocks.deleteDocument).not.toHaveBeenCalled()
  })

  it.each([
    { files: [] },
    { files: [new File(['first'], 'first.pdf'), new File(['second'], 'second.pdf')] },
    { files: [new File([], 'empty.pdf')] },
  ])('rejects invalid single-file selection %j', async ({ files }) => {
    expect((await POST(uploadRequest(artworkInvoice, files))).status).toBe(400)
    expect(mocks.uploadDocument).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each([
    [100 * 1024 * 1024, 200],
    [100 * 1024 * 1024 + 1, 413],
  ])('enforces the exact file-size boundary at %s bytes', async (size, status) => {
    const file = new File(['invoice'], 'Invoice.pdf')
    Object.defineProperty(file, 'size', { value: size })
    const form = new FormData()
    form.set('invoice', JSON.stringify(artworkInvoice))
    form.set('file', file)
    const request = jsonRequest({})
    vi.spyOn(request.headers, 'get').mockReturnValue('multipart/form-data')
    vi.spyOn(request, 'formData').mockResolvedValue(form)
    expect((await POST(request)).status).toBe(status)
    expect(mocks.uploadDocument).toHaveBeenCalledTimes(status === 200 ? 1 : 0)
  })

  it.each([
    { ...artworkInvoice, invoicedAt: '' },
    { ...artworkInvoice, commissionAmount: -1 },
    { ...correctionInvoice, artworkCommissions: [{ artworkId: 'art-1', commissionAmount: -1 }] },
    { ...correctionInvoice, calendarYear: 2200 },
    { kind: 'invalid' }, null,
  ])('validates invoice fields before uploading (%j)', async invoice => {
    expect((await POST(uploadRequest(invoice))).status).toBe(400)
    expect(mocks.uploadDocument).not.toHaveBeenCalled()
  })

  it.each([
    'https://onedrive.example/existing.pdf',
    '/api/documents/11111111-1111-4111-8111-111111111111/open',
  ])('preserves existing invoice links without uploading (%s)', async invoiceUrl => {
    const response = await POST(jsonRequest({ ...artworkInvoice, invoiceUrl }))
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('record_artwork_commission_invoice',
      expect.objectContaining({ p_invoice_url: invoiceUrl }))
    expect(mocks.uploadDocument).not.toHaveBeenCalled()
  })

  it.each(['insert', 'rpc'] as const)('cleans up an upload if %s fails', async stage => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mocks[stage].mockResolvedValue({ error: { message: 'Save failed' } })
      const response = await POST(uploadRequest())
      expect(response.status).toBe(stage === 'insert' ? 500 : 400)
      expect(mocks.deleteDocument).toHaveBeenCalledWith('drive-1', 'item-1')
      expect(mocks.remove).toHaveBeenCalledWith('id', [expect.any(String)])
      if (stage === 'insert') expect(mocks.rpc).not.toHaveBeenCalled()
    } finally {
      log.mockRestore()
    }
  })

  it('reports SharePoint failures without recording an invoice', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mocks.uploadDocument.mockRejectedValue(new Error('Unavailable'))
      expect((await POST(uploadRequest())).status).toBe(502)
      expect(mocks.rpc).not.toHaveBeenCalled()
    } finally {
      log.mockRestore()
    }
  })

  it('requires an editor role before accepting file uploads', async () => {
    mocks.requireRole.mockResolvedValue({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    })
    expect((await POST(uploadRequest())).status).toBe(403)
    expect(mocks.uploadDocument).not.toHaveBeenCalled()
  })

})
