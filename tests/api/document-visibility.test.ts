import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(), from: vi.fn(), update: vi.fn(), insert: vi.fn(),
  single: vi.fn(), maybeSingle: vi.fn(), rpc: vi.fn(), uploadDocument: vi.fn(),
  deleteDocument: vi.fn(), getShareLink: vi.fn(),
}))
vi.mock('@/lib/apiAuth', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/scheduleThumbnailCleanup', () => ({
  scheduleThumbnailCleanup: vi.fn(), scheduleThumbnailGeneration: vi.fn(),
}))
vi.mock('@/lib/sharepoint', () => ({
  uploadDocument: mocks.uploadDocument, deleteDocument: mocks.deleteDocument,
  getShareLink: mocks.getShareLink, buildArtworkFolderPath: () => 'artist/work',
}))

import { PATCH, POST as nestedPost } from '@/app/api/artworks/[id]/documents/[documentId]/route'
import { POST as create } from '@/app/api/artworks/[id]/documents/route'
import { POST as upload } from '@/app/api/artworks/[id]/sharepoint-documents/route'
import { GET as shareLink } from '@/app/api/documents/[id]/share-link/route'

const clientId = '11111111-1111-4111-8111-111111111111'
const context = { params: Promise.resolve({ id: 'work', documentId: 'doc' }) }
function request(body: unknown, method = 'PATCH') {
  return new NextRequest('https://artmuse.test/api/artworks/work/documents/doc', {
    method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  })
}
function uploadRequest(access: Record<string, string> = {}) {
  const form = new FormData()
  form.append('file', new File(['PDF'], 'report.pdf', { type: 'application/pdf' }))
  for (const [key, value] of Object.entries(access)) form.append(key, value)
  return new Request('https://artmuse.test/api/artworks/work/sharepoint-documents', { method: 'POST', body: form })
}

describe('document visibility API', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    const chain = {
      select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(),
      single: mocks.single, maybeSingle: mocks.maybeSingle, update: mocks.update, insert: mocks.insert,
    }
    for (const method of ['select', 'eq', 'order', 'limit'] as const) chain[method].mockReturnValue(chain)
    mocks.from.mockReturnValue(chain)
    mocks.update.mockReturnValue(chain)
    mocks.insert.mockReturnValue(chain)
    mocks.requireRole.mockResolvedValue({ supabase: { from: mocks.from, rpc: mocks.rpc } })
    mocks.single.mockResolvedValue({ data: { id: 'doc' }, error: null })
    mocks.maybeSingle.mockImplementation(async () => ({
      data: { id: 'work', title: 'Painting', artist: null, position: 1, storage_provider: 'sharepoint',
        visibility: 'all_clients', sharepoint_drive_id: 'drive', sharepoint_item_id: 'item' },
      error: null,
    }))
    mocks.rpc.mockResolvedValue({ data: [{ id: clientId, label: 'Client A' }], error: null })
    mocks.uploadDocument.mockResolvedValue({ id: 'item', driveId: 'drive', name: 'report.pdf', webUrl: 'https://sharepoint.test/file', mimeType: 'application/pdf', size: 3 })
    mocks.getShareLink.mockResolvedValue('https://sharepoint.test/shared')
  })

  it('updates visibility without overwriting the label', async () => {
    const response = await PATCH(request({ visibility: 'selected_client', recipient_contact_id: clientId }), context)
    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ visibility: 'selected_client', recipient_contact_id: clientId })
  })

  it('preserves visibility when only the label changes', async () => {
    expect((await PATCH(request({ label: 'New label' }), context)).status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ label: 'New label' })
  })

  it.each(['general', 'images', 'exhibitions_literature'])('changes category to %s without changing permissions or labels', async category => {
    expect((await PATCH(request({ link_category: category }), context)).status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ link_category: category })
  })

  it.each([null, '', 'other', 5])('rejects invalid category %j before writing', async category => {
    expect((await PATCH(request({ link_category: category }), context)).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('persists a category for uploads independently of visibility', async () => {
    expect((await upload(uploadRequest({ link_category: 'exhibitions_literature', visibility: 'internal' }), context)).status).toBe(200)
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      link_category: 'exhibitions_literature', visibility: 'internal', recipient_contact_id: null,
    }))
  })

  it('rejects invalid upload categories before sending files to SharePoint', async () => {
    expect((await upload(uploadRequest({ link_category: 'other' }), context)).status).toBe(400)
    expect(mocks.uploadDocument).not.toHaveBeenCalled()
  })

  it.each([
    {}, null, [], { visibility: 'everyone' }, { visibility: 'selected_client' },
    { recipient_contact_id: clientId }, { visibility: 'internal', recipient_contact_id: clientId },
  ])('rejects invalid visibility updates %j', async body => {
    expect((await PATCH(request(body), context)).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('requires staff permissions before updating visibility', async () => {
    mocks.requireRole.mockResolvedValue({ response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    expect((await PATCH(request({ visibility: 'internal' }), context)).status).toBe(403)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each([create, nestedPost])('defaults new document records to All artwork clients', async handler => {
    const response = await handler(request({ document_type: 'link', label: 'Report', url: 'https://example.test' }, 'POST'), context)
    expect(response.status).toBe(200)
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      visibility: 'all_clients', recipient_contact_id: null,
      link_category: 'general',
    }))
  })

  it('persists access settings for uploaded files', async () => {
    const response = await upload(uploadRequest({ visibility: 'selected_client', recipient_contact_id: clientId }), context)
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('artwork_comment_clients', { p_artwork_id: 'work' })
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      visibility: 'selected_client', recipient_contact_id: clientId,
    }))
  })

  it('defaults uploads without visibility to All artwork clients', async () => {
    expect((await upload(uploadRequest(), context)).status).toBe(200)
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'all_clients', recipient_contact_id: null }))
  })

  it('rejects unrelated clients before uploading to SharePoint', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null })
    expect((await upload(uploadRequest({ visibility: 'selected_client', recipient_contact_id: clientId }), context)).status).toBe(400)
    expect(mocks.uploadDocument).not.toHaveBeenCalled()
  })

  it('rejects missing recipients before uploading to SharePoint', async () => {
    expect((await upload(uploadRequest({ visibility: 'selected_client' }), context)).status).toBe(400)
    expect(mocks.uploadDocument).not.toHaveBeenCalled()
  })

  it('surfaces database validation errors without reporting success', async () => {
    mocks.single.mockResolvedValue({ data: null, error: { message: 'Document recipient must be a proposed client or the artwork buyer' } })
    expect((await PATCH(request({ visibility: 'selected_client', recipient_contact_id: clientId }), context)).status).toBe(400)
  })

  it.each(['internal', 'selected_client'])('refuses direct SharePoint share links for %s files', async visibility => {
    mocks.maybeSingle.mockResolvedValue({ data: { storage_provider: 'sharepoint', visibility }, error: null })
    expect((await shareLink(new Request('https://artmuse.test/api/documents/doc/share-link'), { params: Promise.resolve({ id: 'doc' }) })).status).toBe(403)
    expect(mocks.getShareLink).not.toHaveBeenCalled()
  })

  it('preserves SharePoint sharing for All artwork clients files', async () => {
    expect((await shareLink(new Request('https://artmuse.test/api/documents/doc/share-link'), { params: Promise.resolve({ id: 'doc' }) })).status).toBe(200)
    expect(mocks.getShareLink).toHaveBeenCalledWith('drive', 'item')
  })
})
