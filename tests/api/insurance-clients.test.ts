import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireUser: vi.fn() }))
vi.mock('@/lib/apiAuth', () => ({ requireUser: mocks.requireUser }))
import { GET } from '@/app/api/insurance/clients/route'

beforeEach(() => vi.clearAllMocks())

describe('viewer insurance clients', () => {
  it('requires authentication', async () => {
    mocks.requireUser.mockResolvedValue({ response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) })
    expect((await GET(new NextRequest('http://localhost/api/insurance/clients'))).status).toBe(401)
  })

  it('loads only the current user links and excludes non-clients', async () => {
    const returns = vi.fn().mockResolvedValue({ error: null, data: [
      { contact: { id: 'client', company_name: 'Florac', is_client: true } },
      { contact: { id: 'artist', company_name: 'Artist', is_client: false } },
      { contact: null },
    ] })
    const eq = vi.fn(() => ({ returns }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    mocks.requireUser.mockResolvedValue({ response: null, role: 'Viewer', userId: 'viewer-id', supabase: { from } })
    const response = await GET(new NextRequest('http://localhost/api/insurance/clients?userId=other'))
    expect(eq).toHaveBeenCalledWith('user_id', 'viewer-id')
    expect(await response.json()).toEqual({ clients: [{ id: 'client', label: 'Florac' }] })
  })

  it('reports failed link loading without returning a success-shaped empty list', async () => {
    const from = vi.fn(() => ({ select: () => ({ eq: () => ({ returns: async () => ({ data: null, error: { message: 'Failed' } }) }) }) }))
    mocks.requireUser.mockResolvedValue({ response: null, userId: 'viewer', supabase: { from } })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await GET(new NextRequest('http://localhost/api/insurance/clients'))).status).toBe(500)
    log.mockRestore()
  })
})
