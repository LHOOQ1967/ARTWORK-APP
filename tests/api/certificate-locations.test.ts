import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireUser: vi.fn() }))
vi.mock('@/lib/apiAuth', () => ({ requireUser: mocks.requireUser }))
import { GET } from '@/app/api/inventory/certificates/route'

const request = () => new NextRequest('http://localhost/api/inventory/certificates')
function query() {
  const chain = { select: vi.fn(), or: vi.fn(), eq: vi.fn(), limit: vi.fn(), order: vi.fn(), range: vi.fn(), returns: vi.fn() }
  for (const key of ['select', 'or', 'eq', 'limit', 'order', 'range'] as const) chain[key].mockReturnValue(chain)
  chain.returns.mockResolvedValue({ data: [], error: null })
  return chain
}
beforeEach(() => vi.clearAllMocks())

describe('certificate locations API', () => {
  it('rejects unauthenticated access', async () => {
    mocks.requireUser.mockResolvedValue({ response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) })
    expect((await GET(request())).status).toBe(401)
  })
  it.each(['Viewer', 'Editor', 'Administrator'])('uses the authenticated RLS client for %s', async role => {
    const chain = query()
    const from = vi.fn(() => chain)
    const row = { id: 'work', title: 'Artwork', certificate_contact: null, certificate_address: null }
    chain.returns.mockResolvedValue({ data: [row], error: null })
    mocks.requireUser.mockResolvedValue({ response: null, role, supabase: { from } })
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ artworks: [{ ...row, image_url: null }] })
    expect(mocks.requireUser).toHaveBeenCalledWith(expect.any(NextRequest))
    expect(from).toHaveBeenCalledWith('artworks')
    expect(chain.or).toHaveBeenCalledWith('certificate.eq.true,certificate_location_contact_id.not.is.null,certificate_location_address_id.not.is.null')
    expect(chain.select).toHaveBeenCalledWith(expect.stringContaining('artworks_certificate_location_address_id_fkey'))
    expect(chain.select).toHaveBeenCalledWith(expect.stringContaining('images:documents!documents_artwork_id_fkey(url)'))
    expect(chain.range).toHaveBeenCalledWith(0, 499)
    expect(chain.eq).toHaveBeenCalledWith('images.document_type', 'image')
    expect(chain.order).toHaveBeenCalledWith('position', { referencedTable: 'images', nullsFirst: false })
    expect(chain.limit).toHaveBeenCalledWith(1, { referencedTable: 'images' })
  })
  it('loads beyond a single database page without losing rows', async () => {
    const chain = query()
    const rows = Array.from({ length: 500 }, (_, index) => ({ id: `work-${index}` }))
    chain.returns.mockResolvedValueOnce({ data: rows, error: null })
      .mockResolvedValueOnce({ data: [{ id: 'last' }], error: null })
    mocks.requireUser.mockResolvedValue({ response: null, supabase: { from: () => chain } })
    const response = await GET(request())
    expect((await response.json()).artworks).toHaveLength(501)
    expect(chain.range).toHaveBeenNthCalledWith(2, 500, 999)
    expect(chain.order).toHaveBeenCalledWith('id')
  })
  it('returns the first artwork image without exposing the nested documents array', async () => {
    const chain = query()
    chain.returns.mockResolvedValue({ data: [{ id: 'work', images: [{ url: 'image.jpg' }] }], error: null })
    mocks.requireUser.mockResolvedValue({ response: null, supabase: { from: () => chain } })
    expect(await (await GET(request())).json()).toEqual({ artworks: [{ id: 'work', image_url: 'image.jpg' }] })
  })
  it('reports a later-page failure instead of returning a partial inventory', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const chain = query()
    chain.returns.mockResolvedValueOnce({ data: Array.from({ length: 500 }, () => ({ id: 'work' })), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Query failed' } })
    mocks.requireUser.mockResolvedValue({ response: null, supabase: { from: () => chain } })
    const response = await GET(request())
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Unable to load certificate locations.' })
    vi.restoreAllMocks()
  })
})
