import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(), audit: vi.fn(), schedule: vi.fn(),
  upload: vi.fn(), insert: vi.fn(), remove: vi.fn(),
}))
vi.mock('@/lib/apiAuth', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/audit', () => ({ logAuditEvent: mocks.audit }))
vi.mock('@/lib/scheduleThumbnailCleanup', () => ({ scheduleThumbnailGeneration: mocks.schedule }))
import { POST } from '@/app/api/artworks/[id]/images/route'

describe('image upload thumbnail scheduling', () => {
  const url = 'https://db.test/storage/v1/object/public/artwork-images/work/image.png'
  const client = {
    storage: { from: () => ({
      upload: mocks.upload, remove: mocks.remove,
      getPublicUrl: () => ({ data: { publicUrl: url } }),
    }) },
    from: () => ({ insert: mocks.insert }),
  }
  function request() {
    const body = new FormData()
    body.append('file', new File(['image'], 'image.png', { type: 'image/png' }))
    return new NextRequest('https://artmuse.test/api/artworks/work/images', { method: 'POST', body })
  }
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.requireRole.mockResolvedValue({ supabase: client, userId: 'editor' })
    mocks.upload.mockResolvedValue({ error: null })
    mocks.insert.mockResolvedValue({ error: null })
    mocks.remove.mockResolvedValue({ error: null })
  })

  it('schedules generation with the uploaded bytes only after saving the source document', async () => {
    const response = await POST(request(), { params: Promise.resolve({ id: 'work' }) })
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ url })
    expect(mocks.schedule).toHaveBeenCalledWith(client, url, expect.any(File))
    expect(mocks.insert.mock.invocationCallOrder[0]).toBeLessThan(mocks.schedule.mock.invocationCallOrder[0])
  })

  it('does not generate a derivative for an unsuccessful original upload', async () => {
    mocks.upload.mockResolvedValue({ error: { message: 'Upload failed' } })
    expect((await POST(request(), { params: Promise.resolve({ id: 'work' }) })).status).toBe(400)
    expect(mocks.schedule).not.toHaveBeenCalled()
  })

  it('does not generate a derivative for an unsaved source document', async () => {
    mocks.insert.mockResolvedValue({ error: { message: 'Insert failed' } })
    expect((await POST(request(), { params: Promise.resolve({ id: 'work' }) })).status).toBe(400)
    expect(mocks.remove).toHaveBeenCalled()
    expect(mocks.schedule).not.toHaveBeenCalled()
  })

  it('preserves role checks', async () => {
    mocks.requireRole.mockResolvedValue({ response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    expect((await POST(request(), { params: Promise.resolve({ id: 'work' }) })).status).toBe(403)
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.schedule).not.toHaveBeenCalled()
  })
})
