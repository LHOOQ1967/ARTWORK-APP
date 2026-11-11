import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchPhillipsBytes, fetchPhillipsLot } from '@/lib/imports/fetchPhillips'
import { POST } from '@/app/api/artwork-imports/phillips/route'
import { lotHtml, parsedLot, sourceUrl } from '../fixtures/phillipsLot'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), contact: vi.fn(), address: vi.fn(), contactId: vi.fn() }))
vi.mock('@/lib/apiAuth', () => ({ requireRole: mocks.authorize }))
const supabase = {
  from: (table: string) => ({
    select: () => table === 'contacts' ? { ilike: mocks.contact } : { eq: mocks.contactId },
  }),
}
const request = (url = sourceUrl) => new Request('https://artmuse.test/api/artwork-imports/phillips', {
  method: 'POST', body: JSON.stringify({ url }), headers: { 'Content-Type': 'application/json' },
})

describe('Phillips fetch and authorized preview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({ response: null, supabase })
    mocks.contact.mockResolvedValue({ data: [
      { id: 'other', company_name: 'Other Phillips' }, { id: 'phillips', company_name: 'Phillips' },
    ], error: null })
    mocks.contactId.mockReturnValue({ ilike: mocks.address })
    mocks.address.mockResolvedValue({ data: [{ id: 'new-york', city: 'New York' }], error: null })
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(lotHtml(), { headers: { 'Content-Type': 'text/html' } })))
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('reads the public HTML directly and does not request video URLs', async () => {
    expect(await fetchPhillipsLot(sourceUrl)).toEqual(parsedLot)
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(sourceUrl, expect.objectContaining({ redirect: 'manual', cache: 'no-store' }))
  })

  it.each([['USD', 'New York'], ['GBP', 'London'], ['EUR', 'Paris']])('prefills the Phillips contact and %s address', async (currency, city) => {
    mocks.address.mockResolvedValue({ data: [{ id: city, city }], error: null })
    vi.mocked(fetch).mockResolvedValue(new Response(lotHtml({ auctionCurrency: { currencyCode: currency } }), {
      headers: { 'Content-Type': 'text/html' },
    }))
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect((await response.json()).contact_defaults).toEqual({ contact_id: 'phillips', location_address_id: city, city, warning: null })
    expect(mocks.contact).toHaveBeenCalledWith('company_name', '%phillips%')
    expect(mocks.contactId).toHaveBeenCalledWith('contact_id', 'phillips')
    expect(mocks.address).toHaveBeenCalledWith('city', city)
  })

  it('warns for unmapped currencies without guessing an address', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(lotHtml({ auctionCurrency: { currencyCode: 'HKD' } }), {
      headers: { 'Content-Type': 'text/html' },
    }))
    const response = await POST(request())
    expect((await response.json()).contact_defaults).toMatchObject({
      contact_id: 'phillips', location_address_id: null, city: null, warning: expect.stringContaining('Phillips'),
    })
    expect(mocks.address).not.toHaveBeenCalled()
  })

  it.each(['missing contact', 'ambiguous contact', 'missing address', 'ambiguous address', 'contact error', 'address error'])('reports %s explicitly', async scenario => {
    if (scenario === 'missing contact') mocks.contact.mockResolvedValue({ data: [], error: null })
    if (scenario === 'ambiguous contact') mocks.contact.mockResolvedValue({
      data: [{ id: 'one', company_name: 'Phillips' }, { id: 'two', company_name: ' PHILLIPS ' }], error: null,
    })
    if (scenario === 'missing address') mocks.address.mockResolvedValue({ data: [], error: null })
    if (scenario === 'ambiguous address') mocks.address.mockResolvedValue({ data: [{ id: 'one' }, { id: 'two' }], error: null })
    if (scenario === 'contact error') mocks.contact.mockResolvedValue({ data: null, error: { message: 'Database unavailable' } })
    if (scenario === 'address error') mocks.address.mockResolvedValue({ data: null, error: { message: 'Database unavailable' } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await POST(request())
    expect(response.status).toBe(502)
    expect((await response.json()).error).toContain('Phillips')
  })

  it('requires an editor role and validates the input before fetching', async () => {
    mocks.authorize.mockResolvedValueOnce({ response: new Response('Forbidden', { status: 403 }) })
    expect((await POST(request())).status).toBe(403)
    expect((await POST(request('https://localhost'))).status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['page', 'image'] as const)('rejects %s redirects outside its host/path allowlist', async kind => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'https://localhost/secret' } }))
    await expect(fetchPhillipsBytes(kind === 'page' ? sourceUrl : parsedLot.images[0].url, kind)).rejects.toThrow('Phillips')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it.each([
    new Response('denied', { status: 403 }),
    new Response('not html', { headers: { 'Content-Type': 'text/plain' } }),
    new Response('large', { headers: { 'Content-Type': 'text/html', 'Content-Length': '6000000' } }),
    new Response(new Uint8Array(5 * 1024 * 1024 + 1), { headers: { 'Content-Type': 'text/html' } }),
  ])('rejects blocked, invalid or oversized pages', async response => {
    vi.mocked(fetch).mockResolvedValue(response)
    await expect(fetchPhillipsLot(sourceUrl)).rejects.toThrow()
  })

  it('rejects video responses and oversized image downloads', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('video', { headers: { 'Content-Type': 'video/mp4' } }))
      .mockResolvedValueOnce(new Response('large', { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '16000000' } }))
    await expect(fetchPhillipsBytes(parsedLot.images[0].url, 'image')).rejects.toThrow('valid image')
    await expect(fetchPhillipsBytes(parsedLot.images[0].url, 'image')).rejects.toThrow('size limit')
  })
})
