import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  maybeSingle: vi.fn(),
  logAuditEvent: vi.fn(),
}))
vi.mock('@/lib/apiAuth', () => ({ requireRole: mocks.requireRole, requireUser: vi.fn() }))
vi.mock('@/lib/supabaseAdmin', () => ({ supabaseAdmin: {} }))
vi.mock('@/lib/audit', () => ({ logAuditEvent: mocks.logAuditEvent }))

import { PATCH } from '@/app/api/artworks/[id]/route'

function update(quality: unknown) {
  return PATCH(
    new NextRequest('http://localhost/api/artworks/artwork-1', {
      method: 'PATCH', body: JSON.stringify({ quality }),
    }),
    { params: Promise.resolve({ id: 'artwork-1' }) }
  )
}

describe('artwork quality updates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireRole.mockResolvedValue({ userId: 'editor-1', supabase: { from: mocks.from } })
    mocks.from.mockReturnValue({ update: mocks.update })
    mocks.update.mockReturnValue({ eq: () => ({ select: () => ({ maybeSingle: mocks.maybeSingle }) }) })
    mocks.maybeSingle.mockResolvedValue({ data: { id: 'artwork-1', quality: 8 }, error: null })
  })

  it.each([0, 11, -1, 4.5, '8', '', true, {}])('rejects invalid quality %j', async quality => {
    const response = await update(quality)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Quality must be an integer from 1 to 10, or null' })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it.each([1, 10, null])('persists quality %j', async quality => {
    const response = await update(quality)
    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ quality }))
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'success' }))
  })

  it('does not allow a Viewer to update quality', async () => {
    mocks.requireRole.mockResolvedValue({ response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    expect((await update(8)).status).toBe(403)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('surfaces database errors without reporting a successful update', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'Quality history write failed' } })
    const response = await update(8)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Quality history write failed' })
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failure' }))
  })
})
