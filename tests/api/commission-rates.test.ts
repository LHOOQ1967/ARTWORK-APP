import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireUser: vi.fn() }))
vi.mock('@/lib/apiAuth', () => ({ requireUser: mocks.requireUser, requireRole: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }))
vi.mock('@/lib/sharepoint', () => ({
  buildArtworkFolderPath: vi.fn(), deleteDocument: vi.fn(), uploadDocument: vi.fn(),
}))
import { GET } from '@/app/api/commissions/route'

function artwork(id: string, date: string, amount: number, buyer: {
  company_name: string | null; first_name: string | null; last_name: string | null
} = { company_name: 'Florac', first_name: null, last_name: null }) {
  return {
    id, date_acquisition: date, cost_amount: amount, cost_currency: 'USD',
    commission_blondeau: null, auctions: false, sold_hammer: null, buyer,
  }
}

describe('commission API annual rates', () => {
  beforeEach(() => vi.resetAllMocks())

  it('matches the UI rule for invoice dates, exceptions, both buyers and separate years', async () => {
    const data = {
      artworks: [
        artwork('unpaid', '2026-09-29', 10_000),
        artwork('paid-before', '2026-09-29', 10_000),
        artwork('paid-after', '2026-09-29', 10_000),
        { ...artwork('exception', '2026-10-08', 6_400_000), commission_blondeau: 0 },
        artwork('threshold', '2026-10-14', 4_970_000, {
          company_name: null, first_name: 'Léopold', last_name: 'Meyer',
        }),
        artwork('next-year', '2027-01-01', 10_000),
      ],
      artwork_commission_rates: [{ artwork_id: 'exception', rate: 0 }],
      artwork_commission_invoices: [
        { artwork_id: 'paid-before', invoiced_at: '2026-10-13' },
        { artwork_id: 'paid-after', invoiced_at: '2026-10-14' },
      ],
      artwork_commission_correction_invoices: [],
      fx_rates_history: [],
    }
    mocks.requireUser.mockResolvedValue({
      response: null,
      supabase: {
        from: (table: keyof typeof data) => {
          const query = Object.assign(Promise.resolve({ data: data[table], error: null }), {
            select: vi.fn(), eq: vi.fn(), not: vi.fn(), order: vi.fn(),
          })
          for (const method of ['select', 'eq', 'not', 'order'] as const) query[method].mockReturnValue(query)
          return query
        },
      },
    })
    const response = await GET(new NextRequest('http://localhost/api/commissions'))
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.calculatedCommissions).toEqual({
      unpaid: 10_000 * 0.07,
      'paid-before': 10_000 * 0.08,
      'paid-after': 10_000 * 0.07,
      exception: 0,
      threshold: 4_970_000 * 0.07,
      'next-year': 10_000 * 0.08,
    })
    expect(payload.correctionInvoiceDates).toEqual({})
  })
})
