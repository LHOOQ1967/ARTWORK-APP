import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(), from: vi.fn(), update: vi.fn(), maybeSingle: vi.fn(), logAuditEvent: vi.fn(),
}))
vi.mock('@/lib/apiAuth', () => ({ requireRole: mocks.requireRole, requireUser: vi.fn() }))
vi.mock('@/lib/supabaseAdmin', () => ({ supabaseAdmin: {} }))
vi.mock('@/lib/audit', () => ({ logAuditEvent: mocks.logAuditEvent }))
import { PATCH } from '@/app/api/artworks/[id]/route'

function save(fields: Record<string, unknown>) {
  return PATCH(new NextRequest('http://localhost/api/artworks/work', {
    method: 'PATCH', body: JSON.stringify(fields),
  }), { params: Promise.resolve({ id: 'work' }) })
}

describe('artwork certificate location API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireRole.mockResolvedValue({ userId: 'editor', supabase: { from: mocks.from } })
    mocks.from.mockReturnValue({ update: mocks.update })
    mocks.update.mockReturnValue({ eq: () => ({ select: () => ({ maybeSingle: mocks.maybeSingle }) }) })
    mocks.maybeSingle.mockResolvedValue({ data: { id: 'work' }, error: null })
  })
  it.each([
    { certificate_location_contact_id: 'contact', certificate_location_address_id: 'address' },
    { certificate_location_address_id: 'other-address' },
    { certificate_location_contact_id: null, certificate_location_address_id: null },
  ])('persists certificate contact/address changes: %j', async fields => {
    expect((await save(fields)).status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining(fields))
  })
  it('does not allow callers to forge certificate history', async () => {
    await save({ certificate_location_address_id: 'address', artwork_certificate_location_history: [{ actor_id: 'fake' }] })
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ certificate_location_address_id: 'address' }))
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty('artwork_certificate_location_history')
  })
  it('surfaces address validation failures without reporting success', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'Certificate address must belong to the selected contact' } })
    const response = await save({ certificate_location_address_id: 'other-contact-address' })
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('Certificate address must belong to the selected contact')
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failure' }))
  })
  it('rejects Viewer changes before accessing artworks', async () => {
    mocks.requireRole.mockResolvedValue({ response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    expect((await save({ certificate_location_address_id: null })).status).toBe(403)
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
