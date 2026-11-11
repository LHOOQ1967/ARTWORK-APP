import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/artwork-imports/sothebys/route'
import { lotHtml, sourceUrl } from '../fixtures/sothebysLot'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), contact: vi.fn(), address: vi.fn() }))
vi.mock('@/lib/apiAuth', () => ({ requireRole: mocks.authorize }))
const supabase = {
  from: (table: string) => ({
    select: () => table === 'contacts' ? { ilike: mocks.contact } : {
      eq: () => ({ ilike: mocks.address }),
    },
  }),
}

describe("Sotheby's contact and currency address prefill", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue({ response: null, supabase })
    mocks.contact.mockResolvedValue({ data: [
      { id: 'other', company_name: 'Not Sothebys' },
      { id: 'sothebys', company_name: "Sotheby's" },
    ], error: null })
  })

  it.each([['USD', 'New York'], ['GBP', 'London'], ['EUR', 'Paris']])('uses %s to select %s', async (currency, city) => {
    mocks.address.mockResolvedValue({ data: [{ id: `address-${city}`, city }], error: null })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      lotHtml().replace('"currency":"USD"', `"currency":"${currency}"`),
      { headers: { 'Content-Type': 'text/html' } },
    )))
    try {
      const response = await POST(new Request('https://artmuse.test/import', {
        method: 'POST', body: JSON.stringify({ url: sourceUrl }),
      }))
      expect(response.status).toBe(200)
      expect((await response.json()).contact_defaults).toEqual({
        contact_id: 'sothebys', location_address_id: `address-${city}`, city, warning: null,
      })
      expect(mocks.address).toHaveBeenCalledWith('city', city)
    } finally { vi.unstubAllGlobals() }
  })

  it('warns instead of guessing an office for other currencies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(lotHtml().replace('"currency":"USD"', '"currency":"HKD"'),
      { headers: { 'Content-Type': 'text/html' } })))
    try {
      const response = await POST(new Request('https://artmuse.test/import', {
        method: 'POST', body: JSON.stringify({ url: sourceUrl }),
      }))
      expect((await response.json()).contact_defaults).toMatchObject({
        contact_id: 'sothebys', location_address_id: null, city: null, warning: expect.stringContaining('Select the location address'),
      })
      expect(mocks.address).not.toHaveBeenCalled()
    } finally { vi.unstubAllGlobals() }
  })

  it('reports a missing mapped address rather than choosing another office', async () => {
    mocks.address.mockResolvedValue({ data: [], error: null })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(lotHtml(), { headers: { 'Content-Type': 'text/html' } })))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = await POST(new Request('https://artmuse.test/import', {
        method: 'POST', body: JSON.stringify({ url: sourceUrl }),
      }))
      expect(response.status).toBe(502)
      expect((await response.json()).error).toContain("Sotheby's New York address")
    } finally { vi.unstubAllGlobals(); log.mockRestore() }
  })

  it.each([
    ['missing contact', [], [], 'company contact'],
    ['ambiguous contact', [
      { id: 'one', company_name: "Sotheby's" }, { id: 'two', company_name: 'Sotheby\u2019s' },
    ], [], 'company contact'],
    ['ambiguous address', [{ id: 'sothebys', company_name: "Sotheby's" }], [
      { id: 'one', city: 'New York' }, { id: 'two', city: 'New York' },
    ], 'New York address'],
  ])('reports %s explicitly', async (_label, contacts, addresses, message) => {
    mocks.contact.mockResolvedValue({ data: contacts, error: null })
    mocks.address.mockResolvedValue({ data: addresses, error: null })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(lotHtml(), { headers: { 'Content-Type': 'text/html' } })))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = await POST(new Request('https://artmuse.test/import', {
        method: 'POST', body: JSON.stringify({ url: sourceUrl }),
      }))
      expect(response.status).toBe(502)
      expect((await response.json()).error).toContain(message)
    } finally { vi.unstubAllGlobals(); log.mockRestore() }
  })
})
