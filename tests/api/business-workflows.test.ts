import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  supabaseAdmin: {
    from: vi.fn(),
    storage: {
      from: vi.fn(),
    },
  },
  runLabelOcr: vi.fn(),
  parseLabelText: vi.fn(),
  findBestArtistMatch: vi.fn(),
  logAuditEvent: vi.fn(),
}))

vi.mock('@/lib/apiAuth', () => ({
  requireRole: mocks.requireRole,
}))

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: mocks.supabaseAdmin,
}))

vi.mock('@/lib/audit', () => ({
  logAuditEvent: mocks.logAuditEvent,
}))

vi.mock('@/lib/imports/ocr', () => ({
  runLabelOcr: mocks.runLabelOcr,
}))

vi.mock('@/lib/imports/parseLabelText', () => ({
  parseLabelText: mocks.parseLabelText,
}))

vi.mock('@/lib/imports/findBestArtistMatch', () => ({
  findBestArtistMatch: mocks.findBestArtistMatch,
}))

import { POST as analyzeImport } from '@/app/api/artwork-imports/[id]/analyze/route'
import { POST as createImport } from '@/app/api/artwork-imports/route'
import { POST as createDocument } from '@/app/api/artworks/[id]/documents/route'
import { PATCH as updateDocument } from '@/app/api/artworks/[id]/documents/[documentId]/route'
import { PATCH as updateArtwork } from '@/app/api/artworks/[id]/route'
import { canEditArtworks } from '@/lib/permissions'

type AllowedRole = 'Editor' | 'Administrator'

function successfulQuery(data: unknown) {
  const single = vi.fn().mockResolvedValue({ data, error: null })
  const maybeSingle = vi.fn().mockResolvedValue({ data, error: null })
  const select = vi.fn(() => ({ eq, single, maybeSingle }))
  const eq = vi.fn(() => ({ eq, select, single, maybeSingle }))
  const update = vi.fn(() => ({ eq, select, single, maybeSingle }))
  const insert = vi.fn(() => ({ select, single, maybeSingle }))

  return { eq, insert, maybeSingle, select, single, update }
}

function authorize(role: AllowedRole, supabase: { from: ReturnType<typeof vi.fn> }) {
  mocks.requireRole.mockResolvedValue({
    response: null,
    role,
    userId: `${role.toLowerCase()}-1`,
    supabase,
  })
}

function requestJson(url: string, method: 'PATCH' | 'POST', body: unknown) {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('critical artwork workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each<AllowedRole>(['Editor', 'Administrator'])(
    '%s can create an artwork import and records its ownership',
    async (role) => {
      const createdImport = { id: 'import-1', status: 'pending' }
      const uploadedImport = {
        ...createdImport,
        image_path: `${role.toLowerCase()}-1/import-1/label.jpg`,
        image_url: 'https://cdn.example.com/label.jpg',
        status: 'uploaded',
      }
      const insertQuery = successfulQuery(createdImport)
      const updateQuery = successfulQuery(uploadedImport)
      mocks.supabaseAdmin.from
        .mockReturnValueOnce(insertQuery)
        .mockReturnValueOnce(updateQuery)
      const upload = vi.fn().mockResolvedValue({ error: null })
      const getPublicUrl = vi.fn(() => ({
        data: { publicUrl: 'https://cdn.example.com/label.jpg' },
      }))
      mocks.supabaseAdmin.storage.from.mockReturnValue({
        upload,
        getPublicUrl,
      })
      authorize(role, { from: vi.fn() })

      const formData = new FormData()
      formData.set('file', new File(['label'], 'label.jpg', { type: 'image/jpeg' }))
      const response = await createImport(
        new NextRequest('http://localhost/api/artwork-imports', {
          method: 'POST',
          body: formData,
        })
      )

      expect(response.status).toBe(200)
      expect(insertQuery.insert).toHaveBeenCalledWith({
        created_by: `${role.toLowerCase()}-1`,
        source_type: 'label_photo',
        status: 'pending',
      })
      expect(upload).toHaveBeenCalledWith(
        `${role.toLowerCase()}-1/import-1/label.jpg`,
        expect.any(Buffer),
        { contentType: 'image/jpeg', upsert: true }
      )
      expect(updateQuery.update).toHaveBeenCalledWith({
        image_path: `${role.toLowerCase()}-1/import-1/label.jpg`,
        image_url: 'https://cdn.example.com/label.jpg',
        status: 'uploaded',
      })
      await expect(response.json()).resolves.toEqual({ import: uploadedImport })
    }
  )

  it.each<AllowedRole>(['Editor', 'Administrator'])(
    '%s can update an artwork',
    async (role) => {
      const updatedArtwork = { id: 'artwork-1', title: 'Updated title' }
      const artworkQuery = successfulQuery(updatedArtwork)
      const supabase = { from: vi.fn(() => artworkQuery) }
      authorize(role, supabase)

      const response = await updateArtwork(
        requestJson('http://localhost/api/artworks/artwork-1', 'PATCH', {
          title: 'Updated title',
          status: 'Viewed',
        }),
        { params: Promise.resolve({ id: 'artwork-1' }) }
      )

      expect(response.status).toBe(200)
      expect(artworkQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'Viewed',
          title: 'Updated title',
        })
      )
      expect(artworkQuery.eq).toHaveBeenCalledWith('id', 'artwork-1')
      expect(mocks.logAuditEvent).toHaveBeenCalledWith({
        actorId: `${role.toLowerCase()}-1`,
        action: 'artwork_update',
        outcome: 'success',
        subjectId: 'artwork-1',
        subjectType: 'artwork',
      })
      await expect(response.json()).resolves.toEqual(updatedArtwork)
    }
  )

  it.each<AllowedRole>(['Editor', 'Administrator'])(
    '%s can add and relabel an artwork document',
    async (role) => {
      const document = {
        id: 'document-1',
        artwork_id: 'artwork-1',
        document_type: 'provenance',
        label: 'Certificate',
        url: 'https://example.com/certificate.pdf',
      }
      const insertQuery = successfulQuery(document)
      const updateQuery = successfulQuery({ ...document, label: 'Updated certificate' })
      const supabase = {
        from: vi
          .fn()
          .mockReturnValueOnce(insertQuery)
          .mockReturnValueOnce(updateQuery),
      }
      authorize(role, supabase)

      const createResponse = await createDocument(
        requestJson('http://localhost/api/artworks/artwork-1/documents', 'POST', {
          document_type: document.document_type,
          label: document.label,
          url: document.url,
          position: 2,
        }),
        { params: Promise.resolve({ id: 'artwork-1' }) }
      )
      const updateResponse = await updateDocument(
        requestJson(
          'http://localhost/api/artworks/artwork-1/documents/document-1',
          'PATCH',
          { label: 'Updated certificate' }
        ),
        { params: Promise.resolve({ id: 'artwork-1', documentId: 'document-1' }) }
      )

      expect(createResponse.status).toBe(200)
      expect(insertQuery.insert).toHaveBeenCalledWith({
        artwork_id: 'artwork-1',
        document_type: 'provenance',
        label: 'Certificate',
        url: 'https://example.com/certificate.pdf',
        position: 2,
      })
      expect(updateResponse.status).toBe(200)
      expect(updateQuery.update).toHaveBeenCalledWith({ label: 'Updated certificate' })
      expect(updateQuery.eq).toHaveBeenCalledWith('id', 'document-1')
      expect(updateQuery.eq).toHaveBeenCalledWith('artwork_id', 'artwork-1')
    }
  )

  it.each<AllowedRole>(['Editor', 'Administrator'])(
    '%s can analyze an import with OCR and save the parsed result',
    async (role) => {
      const importRow = {
        id: 'import-1',
        image_url: 'https://cdn.example.com/label.jpg',
      }
      const parsedData = { normalized: { artist_name: 'Louise Bourgeois' } }
      const updatedImport = { ...importRow, parsed_data: parsedData, status: 'parsed' }
      const fetchQuery = successfulQuery(importRow)
      const processingQuery = {
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      }
      const resultQuery = successfulQuery(updatedImport)
      const supabase = {
        from: vi
          .fn()
          .mockReturnValueOnce(fetchQuery)
          .mockReturnValueOnce(processingQuery)
          .mockReturnValueOnce(resultQuery),
      }
      authorize(role, supabase)
      mocks.runLabelOcr.mockResolvedValue({
        provider: 'azure-vision-image-analysis-4.0',
        languages: ['fr'],
        text: 'Louise Bourgeois\nUntitled',
        lines: [],
        blocks: [],
      })
      mocks.parseLabelText.mockReturnValue({
        parsedData,
        confidence: { artist_name: 0.95 },
      })
      const artistMatch = { id: 'artist-1', name: 'Louise Bourgeois', score: 1 }
      mocks.findBestArtistMatch.mockResolvedValue(artistMatch)

      const response = await analyzeImport(
        new NextRequest('http://localhost/api/artwork-imports/import-1/analyze', {
          method: 'POST',
        }),
        { params: Promise.resolve({ id: 'import-1' }) }
      )

      expect(response.status).toBe(200)
      expect(mocks.runLabelOcr).toHaveBeenCalledWith(importRow.image_url)
      expect(mocks.findBestArtistMatch).toHaveBeenCalledWith(
        supabase,
        'Louise Bourgeois'
      )
      expect(resultQuery.update).toHaveBeenCalledWith({
        artist_match_id: 'artist-1',
        confidence: { artist_name: 0.95 },
        error_message: null,
        ocr_language: ['fr'],
        ocr_provider: 'azure-vision-image-analysis-4.0',
        ocr_text: 'Louise Bourgeois\nUntitled',
        parsed_data: parsedData,
        status: 'parsed',
      })
      await expect(response.json()).resolves.toEqual({
        artistMatch,
        import: updatedImport,
      })
    }
  )

  it('reserves artwork creation and editing for Editor and Administrator roles', () => {
    expect(canEditArtworks('Viewer')).toBe(false)
    expect(canEditArtworks(undefined)).toBe(false)
    expect(canEditArtworks('Editor')).toBe(true)
    expect(canEditArtworks('Administrator')).toBe(true)
  })
})
