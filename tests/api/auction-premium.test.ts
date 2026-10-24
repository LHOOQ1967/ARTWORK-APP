import { NextResponse } from 'next/server'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/auctions/premium/route'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(), maybeSingle: vi.fn(), fetch: vi.fn(),
}))
vi.mock('@/lib/apiAuth', () => ({ requireRole: mocks.requireRole }))

const houseId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const input = { houseId, date: '2026-10-24', currency: 'USD', field: 'hammer', amount: 100000 }
const calculation = {
  house: "Christie's", currency: 'USD', date: input.date, field: 'hammer', amount: 100000,
  hammer: 100000, premium: 27000, total: 127000,
  schedule: { valid_from: '2026-01-01', valid_to: null },
}
const request = (body: unknown) => new Request('http://localhost/api/auctions/premium', {
  method: 'POST', body: JSON.stringify(body),
})

describe('auction premium proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mocks.fetch)
    mocks.requireRole.mockResolvedValue({
      supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }) },
    })
    mocks.maybeSingle.mockResolvedValue({ data: { company_name: "Christie's" }, error: null })
    mocks.fetch.mockResolvedValue(Response.json(calculation))
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('resolves the house server-side and forwards only calculation data', async () => {
    const response = await POST(request(input))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(calculation)
    const [url, options] = mocks.fetch.mock.calls[0]
    expect(url).toBe('https://buyerspremium.blondeau.ch/api.php')
    expect(JSON.parse(options.body)).toEqual({
      house: "Christie's", date: input.date, currency: 'USD', field: 'hammer', amount: 100000,
    })
    expect(options.cache).toBe('no-store')
    expect(options.headers).not.toHaveProperty('Authorization')
  })

  it('supports total-to-hammer calculation', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ ...calculation, field: 'total', amount: 127000 }))
    expect((await POST(request({ ...input, field: 'total', amount: 127000 }))).status).toBe(200)
  })

  it('supports zero without treating it as empty', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ ...calculation, amount: 0, hammer: 0, total: 0 }))
    expect((await POST(request({ ...input, amount: 0 }))).status).toBe(200)
  })

  it.each([
    { amount: -1 }, { amount: '100' }, { amount: 1e16 }, { date: '2026-02-30' },
    { date: '' }, { houseId: 'bad' }, { field: 'premium' },
  ])('rejects invalid input %j', async invalid => {
    expect((await POST(request({ ...input, ...invalid }))).status).toBe(400)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('rejects unsupported currencies without guessing a city', async () => {
    const response = await POST(request({ ...input, currency: 'CHF' }))
    expect(response.status).toBe(422)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON', async () => {
    expect((await POST(new Request('http://localhost/api/auctions/premium', { method: 'POST', body: '{' }))).status).toBe(400)
  })

  it('rejects viewers before querying a house or the calculator', async () => {
    mocks.requireRole.mockResolvedValue({ response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    expect((await POST(request(input))).status).toBe(403)
    expect(mocks.maybeSingle).not.toHaveBeenCalled()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('does not calculate for inaccessible contacts', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
    expect((await POST(request(input))).status).toBe(404)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('surfaces missing scale messages', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ error: 'No premium scale is available for this date.' }, { status: 422 }))
    const response = await POST(request(input))
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: 'No premium scale is available for this date.' })
  })

  it.each([
    { currency: 'EUR' }, { house: "Sotheby's" }, { hammer: -1 }, { total: 1 }, { amount: 123 },
    { date: '2025-01-01' }, { field: 'total' },
    { schedule: { valid_from: '2027-01-01', valid_to: null } },
    { schedule: { valid_from: '2020-01-01', valid_to: '2021-01-01' } },
  ])('rejects incompatible calculator responses %j', async invalid => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.fetch.mockResolvedValue(Response.json({ ...calculation, ...invalid }))
    expect((await POST(request(input))).status).toBe(502)
  })

  it('handles unavailable APIs or non-JSON error pages explicitly', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.fetch.mockResolvedValue(new Response('<html>Unavailable</html>', { status: 503 }))
    const response = await POST(request(input))
    expect(response.status).toBe(502)
    expect(await response.json()).toHaveProperty('error')
  })
})
