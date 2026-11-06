import { NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  audit: vi.fn(),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
  schedule: vi.fn(),
  artworkUpdate: vi.fn(),
  documentInsert: vi.fn(),
  imageUpload: vi.fn(),
  imageRemove: vi.fn(),
}))

vi.mock('@/lib/apiAuth', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/audit', () => ({ logAuditEvent: mocks.audit }))
vi.mock('@/lib/sharepoint', () => ({
  buildArtworkFolderPath: vi.fn(() => 'Artistes/Modigliani/Portrait'),
  deleteDocument: mocks.deleteDocument,
  uploadDocument: mocks.uploadDocument,
}))
vi.mock('@/lib/scheduleThumbnailCleanup', () => ({ scheduleThumbnailGeneration: mocks.schedule }))

import { POST } from '@/app/api/artworks/[id]/blondeau-imports/route'

const artworkId = 'c6388e07-9a7c-4c93-b38f-a2f58f56d840'
const artwork = {
  id: artworkId,
  title: 'Portrait de Paul Alexandre',
  artist_id: 'a0f2df07-b738-4bab-9ea1-aaf548d12c20',
  medium: 'Oil on canvas',
  signature: null,
  edition: null,
  year_execution: 1915,
  year_execution_start: null,
  artist: { first_name: 'Amedeo', last_name: 'MODIGLIANI' },
}
const insertedDocuments = [{
  id: 'document-1',
  artwork_id: artworkId,
  document_type: 'link',
  url: '/api/documents/document-1/open',
  label: 'Fiche Blondeau',
  position: 0,
}]

const artworkSelectChain = {
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}
artworkSelectChain.eq.mockReturnValue(artworkSelectChain)
artworkSelectChain.maybeSingle.mockResolvedValue({ data: artwork, error: null })

const documentPositionChain = {
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  maybeSingle: vi.fn(),
}
for (const method of ['eq', 'order', 'limit'] as const) {
  documentPositionChain[method].mockReturnValue(documentPositionChain)
}
documentPositionChain.maybeSingle.mockResolvedValue({ data: null, error: null })

const imageBucket = {
  upload: mocks.imageUpload,
  remove: mocks.imageRemove,
  getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://storage.test/work/image.png' } })),
}
const artworkTable = {
  select: vi.fn(() => artworkSelectChain),
  update: vi.fn((fields: unknown) => ({
    eq: vi.fn(async () => {
      mocks.artworkUpdate(fields)
      return { error: null }
    }),
  })),
}
const documentsTable = {
  select: vi.fn(() => documentPositionChain),
  insert: vi.fn((records: unknown[]) => ({
    select: vi.fn(async () => {
      mocks.documentInsert(records)
      return { data: insertedDocuments, error: null }
    }),
  })),
  delete: vi.fn(() => ({ in: vi.fn(async () => ({ error: null })) })),
}
const supabase = {
  from: vi.fn(),
  storage: { from: vi.fn(() => imageBucket) },
}

function request(options: {
  pdf?: File
  fields?: string
  image?: File
} = {}) {
  const form = new FormData()
  form.append('pdf', options.pdf ?? new File(['%PDF-1.7'], 'sheet.pdf', { type: 'application/pdf' }))
  form.append('fields', options.fields ?? JSON.stringify({ title: 'New title' }))
  if (options.image) form.append('image', options.image)
  return new Request('https://artmuse.test/api/artworks/test/blondeau-imports', { method: 'POST', body: form })
}

describe('Blondeau sheet import', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    artworkSelectChain.eq.mockReturnValue(artworkSelectChain)
    artworkSelectChain.maybeSingle.mockResolvedValue({ data: artwork, error: null })
    for (const method of ['eq', 'order', 'limit'] as const) {
      documentPositionChain[method].mockReturnValue(documentPositionChain)
    }
    documentPositionChain.maybeSingle.mockResolvedValue({ data: null, error: null })
    imageBucket.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://storage.test/work/image.png' } })
    artworkTable.select.mockReturnValue(artworkSelectChain)
    artworkTable.update.mockImplementation((fields: unknown) => ({
      eq: vi.fn(async () => {
        mocks.artworkUpdate(fields)
        return { error: null }
      }),
    }))
    documentsTable.select.mockReturnValue(documentPositionChain)
    documentsTable.insert.mockImplementation((records: unknown[]) => ({
      select: vi.fn(async () => {
        mocks.documentInsert(records)
        return { data: insertedDocuments, error: null }
      }),
    }))
    documentsTable.delete.mockReturnValue({ in: vi.fn(async () => ({ error: null })) })
    supabase.from.mockImplementation((table: string) => table === 'artworks' ? artworkTable : documentsTable)
    supabase.storage.from.mockReturnValue(imageBucket)
    mocks.requireRole.mockResolvedValue({ response: null, userId: 'editor', supabase })
    mocks.uploadDocument.mockResolvedValue({
      id: 'sharepoint-1',
      driveId: 'drive-1',
      name: 'sheet.pdf',
      webUrl: 'https://sharepoint.test/sheet.pdf',
      size: 7,
      mimeType: 'application/pdf',
    })
    mocks.imageUpload.mockResolvedValue({ error: null })
    mocks.imageRemove.mockResolvedValue({ error: null })
    mocks.audit.mockResolvedValue(undefined)
    mocks.deleteDocument.mockResolvedValue(undefined)
  })

  it('requires an editor or administrator', async () => {
    mocks.requireRole.mockResolvedValue({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    })
    const response = await POST(request(), { params: Promise.resolve({ id: artworkId }) })
    expect(response.status).toBe(403)
    expect(mocks.uploadDocument).not.toHaveBeenCalled()
  })

  it('rejects invalid PDFs and unapproved field names before uploading', async () => {
    const invalidPdf = new File(['not a PDF'], 'sheet.pdf', { type: 'application/pdf' })
    const response = await POST(request({
      pdf: invalidPdf,
      fields: JSON.stringify({ buyer_contact_id: 'not-allowed' }),
    }), { params: Promise.resolve({ id: artworkId }) })
    expect(response.status).toBe(400)
    expect(mocks.uploadDocument).not.toHaveBeenCalled()
    expect(mocks.documentInsert).not.toHaveBeenCalled()
  })

  it('saves the PDF, selected field changes, and optional artwork crop', async () => {
    const png = new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], 'crop.png', { type: 'image/png' })
    const response = await POST(request({
      fields: JSON.stringify({
        title: 'Portrait de Paul Alexandre',
        year_execution: 1915,
        year_execution_start: null,
      }),
      image: png,
    }), { params: Promise.resolve({ id: artworkId }) })

    expect(response.status).toBe(200)
    expect((await response.json()).documents).toEqual(insertedDocuments)
    expect(mocks.uploadDocument).toHaveBeenCalledWith(expect.objectContaining({
      fileName: 'sheet.pdf',
      mimeType: 'application/pdf',
    }))
    expect(mocks.documentInsert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ label: 'Fiche Blondeau', document_type: 'link', storage_provider: 'sharepoint' }),
      expect.objectContaining({ label: 'Blondeau artwork image', document_type: 'image' }),
    ]))
    expect(mocks.artworkUpdate).toHaveBeenCalledWith({
      title: 'Portrait de Paul Alexandre',
      year_execution: 1915,
      year_execution_start: null,
    })
    expect(mocks.schedule).toHaveBeenCalledTimes(1)
  })
})
