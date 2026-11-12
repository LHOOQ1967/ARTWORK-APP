import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requireUser: vi.fn(),
  ensureFolderPath: vi.fn(),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
  downloadDocument: vi.fn(),
}))
vi.mock('@/lib/apiAuth', () => ({ requireRole: mocks.requireRole, requireUser: mocks.requireUser }))
vi.mock('@/lib/sharepoint', () => ({
  ensureFolderPath: mocks.ensureFolderPath,
  uploadDocument: mocks.uploadDocument,
  deleteDocument: mocks.deleteDocument,
  downloadDocument: mocks.downloadDocument,
  sanitizeSegment: (value: string) => value,
}))

import { POST, PUT } from '@/app/api/market/items/[itemId]/auction-files/route'
import { DELETE, GET } from '@/app/api/market/auction-files/[id]/route'

const itemContext = { params: Promise.resolve({ itemId: 'sale' }) }
const fileContext = { params: Promise.resolve({ id: 'catalogue' }) }

function database(responses: Record<string, Array<{ data: unknown; error: unknown }>>) {
  const operations: Array<{ table: string; method: string; args: unknown[] }> = []
  const from = (table: string) => {
    const chain = {
      select: (...args: unknown[]) => { operations.push({ table, method: 'select', args }); return chain },
      eq: (...args: unknown[]) => { operations.push({ table, method: 'eq', args }); return chain },
      insert: (...args: unknown[]) => { operations.push({ table, method: 'insert', args }); return chain },
      update: (...args: unknown[]) => { operations.push({ table, method: 'update', args }); return chain },
      delete: (...args: unknown[]) => { operations.push({ table, method: 'delete', args }); return chain },
      maybeSingle: () => Promise.resolve(responses[table].shift()),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(responses[table].shift()).then(resolve),
    }
    return chain
  }
  return { from, operations }
}

const auction = { id: 'sale', section_id: 'section', market_sections: { title: 'Sale', category: 'Ventes aux enchères' } }
const ok = (data: unknown) => ({ data, error: null })
function pdfRequest(content = '%PDF-1.7') {
  const form = new FormData()
  form.append('kind', 'catalogue')
  form.append('file', new File([content], 'sale.pdf', { type: 'application/pdf' }))
  return new Request('http://localhost', { method: 'POST', body: form })
}

describe('Market auction PDF routes', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.ensureFolderPath.mockResolvedValue(undefined)
    mocks.uploadDocument.mockResolvedValue({ driveId: 'drive', id: 'new' })
    mocks.deleteDocument.mockResolvedValue(undefined)
  })

  it('rejects unauthorized writes before accessing files', async () => {
    mocks.requireRole.mockResolvedValue({ response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    expect((await POST(pdfRequest(), itemContext)).status).toBe(403)
    expect(mocks.uploadDocument).not.toHaveBeenCalled()
  })

  it('rejects non-PDF content before uploading', async () => {
    const db = database({ market_section_items: [ok(auction)] })
    mocks.requireRole.mockResolvedValue({ response: null, supabase: db })
    expect((await POST(pdfRequest('not pdf'), itemContext)).status).toBe(400)
    expect(mocks.uploadDocument).not.toHaveBeenCalled()
  })

  it('replaces the shared file record and removes its previous SharePoint file', async () => {
    const db = database({
      market_section_items: [ok(auction)],
      market_auction_file_links: [ok({ file_id: 'catalogue' })],
      market_auction_files: [ok({ sharepoint_drive_id: 'drive', sharepoint_item_id: 'old' }), ok({ id: 'catalogue' })],
    })
    mocks.requireRole.mockResolvedValue({ response: null, supabase: db })
    expect((await POST(pdfRequest(), itemContext)).status).toBe(200)
    expect(db.operations).toContainEqual({ table: 'market_auction_files', method: 'eq', args: ['id', 'catalogue'] })
    expect(mocks.deleteDocument).toHaveBeenCalledWith('drive', 'old')
    expect(db.operations.some(operation => operation.table === 'market_auction_file_links' && operation.method === 'update')).toBe(false)
  })

  it('creates a new individual result and cleans up if linking fails', async () => {
    const db = database({
      market_section_items: [ok(auction)],
      market_auction_file_links: [ok(null), { data: null, error: { message: 'link failed' } }],
      market_auction_files: [ok({ id: 'new-file' }), ok(null)],
    })
    mocks.requireRole.mockResolvedValue({ response: null, supabase: db })
    const form = new FormData()
    form.append('kind', 'result')
    form.append('file', new File(['%PDF-1.7'], 'result.pdf', { type: 'application/pdf' }))
    const response = await POST(new Request('http://localhost', { method: 'POST', body: form }), itemContext)
    expect(response.status).toBe(500)
    expect(mocks.deleteDocument).toHaveBeenCalledWith('drive', 'new')
    expect(db.operations.some(operation => operation.table === 'market_auction_files' && operation.method === 'delete')).toBe(true)
  })

  it('rejects a catalogue outside the sale section', async () => {
    const db = database({
      market_section_items: [ok(auction)],
      market_auction_file_links: [ok(null)],
      market_auction_files: [ok(null)],
    })
    mocks.requireRole.mockResolvedValue({ response: null, supabase: db })
    const request = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ fileId: 'other' }) })
    expect((await PUT(request, itemContext)).status).toBe(404)
    expect(db.operations).toContainEqual({ table: 'market_auction_files', method: 'eq', args: ['section_id', 'section'] })
    expect(db.operations.some(operation => operation.method === 'insert')).toBe(false)
  })

  it('links an existing catalogue only when the sale has none', async () => {
    const db = database({
      market_section_items: [ok(auction)],
      market_auction_file_links: [ok(null), ok(null)],
      market_auction_files: [ok({ id: 'catalogue' })],
    })
    mocks.requireRole.mockResolvedValue({ response: null, supabase: db })
    const request = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ fileId: 'catalogue' }) })
    expect((await PUT(request, itemContext)).status).toBe(200)
    expect(db.operations).toContainEqual({
      table: 'market_auction_file_links', method: 'insert',
      args: [{ item_id: 'sale', section_id: 'section', kind: 'catalogue', file_id: 'catalogue' }],
    })
  })

  it('reports an old-file cleanup failure after replacement', async () => {
    const db = database({
      market_section_items: [ok(auction)],
      market_auction_file_links: [ok({ file_id: 'catalogue' })],
      market_auction_files: [ok({ sharepoint_drive_id: 'drive', sharepoint_item_id: 'old' }), ok({ id: 'catalogue' })],
    })
    mocks.requireRole.mockResolvedValue({ response: null, supabase: db })
    mocks.deleteDocument.mockRejectedValue(new Error('offline'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await POST(pdfRequest(), itemContext)
    expect(response.status).toBe(502)
    expect((await response.json()).error).toMatch(/new PDF was saved/)
    error.mockRestore()
  })

  it('does not remove metadata when SharePoint deletion fails', async () => {
    const db = database({ market_auction_files: [ok({ sharepoint_drive_id: 'drive', sharepoint_item_id: 'old' })] })
    mocks.requireRole.mockResolvedValue({ response: null, supabase: db })
    mocks.deleteDocument.mockRejectedValue(new Error('offline'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await DELETE(new Request('http://localhost'), fileContext)).status).toBe(502)
    expect(db.operations.some(operation => operation.method === 'delete')).toBe(false)
    error.mockRestore()
  })

  it('streams authenticated documents', async () => {
    const db = database({ market_auction_files: [ok({ file_name: 'sale.pdf', sharepoint_drive_id: 'drive', sharepoint_item_id: 'item' })] })
    mocks.requireUser.mockResolvedValue({ response: null, supabase: db })
    mocks.downloadDocument.mockResolvedValue(new Response('pdf'))
    const response = await GET(new Request('http://localhost'), fileContext)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(await response.text()).toBe('pdf')
  })
})
