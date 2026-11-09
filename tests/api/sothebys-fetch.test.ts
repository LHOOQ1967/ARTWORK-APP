import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSothebysBytes, fetchSothebysLot } from '@/lib/imports/fetchSothebys'
import { POST } from '@/app/api/artwork-imports/sothebys/route'
import { lotHtml, parsedLot, sourceUrl } from '../fixtures/sothebysLot'

const mocks = vi.hoisted(() => ({ authorize: vi.fn() }))
const contactDefaults = { contact_id: 'sothebys', location_address_id: 'new-york', city: 'New York', warning: null }
const supabase = {
  from: (table: string) => ({
    select: () => table === 'contacts' ? {
      ilike: async () => ({ data: [{ id: 'sothebys', company_name: "Sotheby's" }], error: null }),
    } : {
      eq: () => ({ ilike: async () => ({ data: [{ id: 'new-york', city: 'New York' }], error: null }) }),
    },
  }),
}
vi.mock('@/lib/apiAuth', () => ({ requireRole: mocks.authorize }))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe("Sotheby's fetch boundary", () => {
  it('reads the real HTML data shape without a third-party extraction service', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(lotHtml(), { headers: { 'Content-Type': 'text/html' } }))
    vi.stubGlobal('fetch', fetch)
    expect(await fetchSothebysLot(sourceUrl)).toEqual(parsedLot)
    expect(fetch).toHaveBeenCalledWith(sourceUrl, expect.objectContaining({ redirect: 'manual', cache: 'no-store' }))
  })

  it('never follows a redirect to another host', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'https://localhost/secret' } }))
    vi.stubGlobal('fetch', fetch)
    await expect(fetchSothebysLot(sourceUrl)).rejects.toThrow('Sotheby')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it.each([
    new Response('denied', { status: 403 }),
    new Response('not html', { headers: { 'Content-Type': 'text/plain' } }),
    new Response('large', { headers: { 'Content-Type': 'text/html', 'Content-Length': '6000000' } }),
  ])('reports blocked, invalid or oversized pages', async response => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    await expect(fetchSothebysBytes(sourceUrl, 'page')).rejects.toThrow()
  })

  it('bounds streamed responses even without a content length', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array(5 * 1024 * 1024 + 1), {
      headers: { 'Content-Type': 'text/html' },
    })))
    await expect(fetchSothebysLot(sourceUrl)).rejects.toThrow('size limit')
  })

  it('requires an editor role before making any external request', async () => {
    mocks.authorize.mockResolvedValue({ response: new Response('Forbidden', { status: 403 }) })
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect((await POST(new Request('https://artmuse.test/api/artwork-imports/sothebys', { method: 'POST' }))).status).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns parsed lot data to an authorized caller and rejects invalid input', async () => {
    mocks.authorize.mockResolvedValue({ response: null, supabase })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(lotHtml(), { headers: { 'Content-Type': 'text/html' } })))
    const request = (url: string) => new Request('https://artmuse.test/api/artwork-imports/sothebys', {
      method: 'POST', body: JSON.stringify({ url }), headers: { 'Content-Type': 'application/json' },
    })
    expect(await (await POST(request(sourceUrl))).json()).toEqual({ ...parsedLot, contact_defaults: contactDefaults })
    expect((await POST(request('https://localhost'))).status).toBe(400)
  })
})
