import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), requireUser: vi.fn(), logAuditEvent: vi.fn() }))
vi.mock('@/lib/apiAuth', () => ({ requireRole: mocks.requireRole, requireUser: mocks.requireUser }))
vi.mock('@/lib/audit', () => ({ logAuditEvent: mocks.logAuditEvent }))
import { GET } from '@/app/api/inventory/geneva-freeport/route'
import { PUT } from '@/app/api/inventory/geneva-freeport/[id]/route'
import { FREEPORT_ADDRESS_ID, FREEPORT_CONTACT_ID } from '@/lib/genevaFreeport'

const id = '00000000-0000-4000-8000-000000000001'
const params = { params: Promise.resolve({ id }) }
const request = (body: unknown) => new NextRequest(`http://localhost/api/inventory/geneva-freeport/${id}`, {
  method: 'PUT', body: JSON.stringify(body),
})
function query(data: unknown, error: unknown = null) {
  const chain = {
    select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), in: vi.fn(),
    returns: vi.fn().mockResolvedValue({ data, error }),
  }
  for (const key of ['select', 'eq', 'order', 'range', 'in'] as const) chain[key].mockReturnValue(chain)
  return chain
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockImplementation(() => mocks.requireRole())
})

describe('Geneva Freeport API', () => {
  it('rejects unauthorized reads and writes before accessing inventory', async () => {
    mocks.requireRole.mockResolvedValue({ response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    expect((await GET(new NextRequest('http://localhost/api/inventory/geneva-freeport'))).status).toBe(403)
    expect((await PUT(request({ inventory: {}, documents: [] }), params)).status).toBe(403)
    expect(mocks.requireRole).toHaveBeenCalledWith(['Editor', 'Administrator'], expect.anything())
  })

  it('allows viewer reads through RLS while rejecting viewer writes', async () => {
    const from = vi.fn().mockReturnValue(query([]))
    mocks.requireUser.mockResolvedValue({ response: null, role: 'Viewer', userId: 'viewer', supabase: { from } })
    mocks.requireRole.mockResolvedValue({ response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    expect((await GET(new NextRequest('http://localhost/api/inventory/geneva-freeport'))).status).toBe(200)
    expect((await PUT(request({ inventory: {}, documents: [] }), params)).status).toBe(403)
    expect(mocks.requireUser).toHaveBeenCalled()
  })

  it('filters by exact Florac contact and PF address and keeps distinct customs histories', async () => {
    const artworks = query([{ id, title: 'ArtMuse title' }])
    const inventory = query([{ artwork_id: id, inventory_number: 'HES.1' }])
    const documents = query([{ artwork_id: id, document_reference: 'A', position: 0 }, { artwork_id: id, document_reference: 'B', position: 1 }])
    const images = query([{ artwork_id: id, url: 'first.jpg', position: 0 }, { artwork_id: id, url: 'second.jpg', position: 1 }])
    const from = vi.fn(table => ({ artworks, geneva_freeport_inventory: inventory, geneva_freeport_customs_documents: documents, documents: images })[table as 'artworks'])
    mocks.requireRole.mockResolvedValue({ response: null, supabase: { from } })
    const response = await GET(new NextRequest('http://localhost/api/inventory/geneva-freeport'))
    expect(response.status).toBe(200)
    expect(artworks.eq).toHaveBeenCalledWith('location_contact_id', FREEPORT_CONTACT_ID)
    expect(artworks.eq).toHaveBeenCalledWith('location_address_id', FREEPORT_ADDRESS_ID)
    expect(documents.order).toHaveBeenCalledWith('position')
    const body = await response.json()
    expect(body.artworks[0].title).toBe('ArtMuse title')
    expect(body.artworks[0].documents).toHaveLength(2)
    expect(body.artworks[0].image_url).toBe('first.jpg')
    expect(images.eq).toHaveBeenCalledWith('document_type', 'image')
  })

  it('surfaces missing inventory migration instead of returning an empty success', async () => {
    const error = { message: 'Table missing' }
    const from = vi.fn().mockReturnValueOnce(query([{ id }])).mockReturnValueOnce(query(null, error)).mockReturnValueOnce(query([])).mockReturnValueOnce(query([]))
    mocks.requireRole.mockResolvedValue({ response: null, supabase: { from } })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await GET(new NextRequest('http://localhost/api/inventory/geneva-freeport'))).status).toBe(500)
    log.mockRestore()
  })

  it('saves inventory and document history with one atomic RPC, not artwork updates', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn()
    mocks.requireRole.mockResolvedValue({ response: null, userId: 'editor', supabase: { rpc, from } })
    const response = await PUT(request({
      inventory: { inventory_number: 'HES.1', insured_value_usd: '70000' },
      documents: [{ document_reference: 'A', document_date: '2024-01-31' }, { document_reference: 'B' }],
    }), params)
    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('save_geneva_freeport_inventory', expect.objectContaining({
      p_artwork_id: id, p_inventory: expect.objectContaining({ insured_value_usd: 70000 }),
      p_documents: [expect.objectContaining({ document_reference: 'A' }), expect.objectContaining({ document_reference: 'B' })],
    }))
    expect(from).not.toHaveBeenCalled()
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'success' }))
  })

  it('rejects invalid input without calling the save RPC', async () => {
    const rpc = vi.fn()
    mocks.requireRole.mockResolvedValue({ response: null, supabase: { rpc } })
    expect((await PUT(request({ inventory: { entry_value: -10 }, documents: [] }), params)).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('reports failed saves and audits failure without claiming success', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: 'Artwork moved from PF' } })
    mocks.requireRole.mockResolvedValue({ response: null, userId: 'editor', supabase: { rpc } })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await PUT(request({ inventory: {}, documents: [] }), params)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Artwork moved from PF' })
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failure' }))
    log.mockRestore()
  })
})
