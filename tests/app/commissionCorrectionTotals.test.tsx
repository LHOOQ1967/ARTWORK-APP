import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CommissionsPage from '@/app/(protected)/commissions/page'

const mocks = vi.hoisted(() => ({ states: [] as unknown[], index: 0 }))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => [mocks.states[mocks.index++] ?? initial, vi.fn()],
}))
vi.mock('@/contexts/ClientFilterContext', () => ({
  useClientFilter: () => ({ matchesClient: () => true, isFilterActive: false }),
}))
vi.mock('@/lib/fetchWithAuth', () => ({ fetchWithAuth: vi.fn() }))
vi.mock('xlsx-js-style', () => ({}))

function artwork(id: string, amount: number, currency = 'USD') {
  return {
    id, title: id, date_acquisition: '2026-01-01', cost_amount: amount,
    cost_currency: currency, auctions: false, medium: null,
    year_execution: 2026, buyer: { company_name: 'Florac' },
    artist: null, proposedBy: { company_name: 'Proposing gallery' },
  }
}

describe('commission correction USD totals', () => {
  beforeEach(() => {
    mocks.index = 0
    mocks.states = [
      [
        artwork('usd-artwork', 10000),
        artwork('eur-artwork', 20000, 'EUR'),
        { ...artwork('threshold-artwork', 5000000), date_acquisition: '2026-02-01' },
      ],
      [{ rate_date: '2026-01-01', from_currency: 'EUR', to_currency: 'USD', rate: 1.5 }],
      {},
      {
        'usd-artwork': { invoiced_at: '2026-01-02' },
        'eur-artwork': { invoiced_at: '2026-01-02' },
      },
      {},
      '2026',
      'Toutes',
      {},
      false,
      null,
      null,
      {},
      {},
      {},
      {},
      ['Florac'],
    ]
  })

  it('totals only the displayed correction rows in the two USD columns', () => {
    const html = renderToStaticMarkup(<CommissionsPage />)
    const detailTable = html.match(/<table class="w-full text-sm">([\s\S]*?)<\/table>/)?.[1]
    expect(detailTable).toBeDefined()
    const footer = detailTable!.match(/<tfoot[\s\S]*?<\/tfoot>/)?.[0]
    expect(footer).toContain('scope="row" colSpan="5"')
    expect(footer).toContain('Total')
    expect(footer).toContain('USD -400')
    expect(footer).toContain("USD 2&#x27;800")
    expect(footer).toContain("USD 3&#x27;200")
    expect(footer?.match(/USD /g)).toHaveLength(3)
    expect(footer).not.toContain('EUR')
    const header = detailTable!.match(/<thead[\s\S]*?<\/thead>/)![0]
    expect(header).not.toContain('Correction −1 % (currency)')
    expect(header).toContain('>Commissions (currency)</th>')
    expect(header).toContain('>Commissions USD</th>')
    expect(header).toMatch(/<tr><th[^>]*>Purchase date<\/th><th[^>]*>Artist<\/th>/)
    expect(header).toMatch(/Correction −1 % USD<\/th><\/tr><\/thead>$/)
    const body = detailTable!.match(/<tbody>([\s\S]*?)<\/tbody>/)![1]
    const euroRow = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
      .find(([, row]) => row.includes('eur-artwork'))![1]
    const cells = [...euroRow.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
    expect(cells).toHaveLength(7)
    expect(header).toContain('>Rate</th><th')
    expect(cells[0][1]).toBe('01/01/2026')
    expect(cells[3][1]).toContain('<del>8 %</del>')
    expect(cells[3][1]).toContain('<p class="font-bold text-green-700">7 %</p>')
    expect(cells[4][1]).toContain("<del>EUR 1&#x27;600</del>")
    expect(cells[4][1]).toContain("EUR 1&#x27;400")
    expect(cells[5][1]).toContain("<del>USD 2&#x27;400</del>")
    expect(cells[5][1]).toContain("USD 2&#x27;100")
    expect(cells[6][1]).toBe('USD -300')
  })

  it('offers separate print buttons for Florac and Leopold Meyer', () => {
    const html = renderToStaticMarkup(<CommissionsPage />)
    expect(html).toContain('Print Florac</button>')
    expect(html).toContain('Print Léopold Meyer</button>')
  })

  it('hides invoice upload and save for a zero exceptional rate but retains existing invoice access', () => {
    mocks.states[2] = { 'usd-artwork': 0 }
    mocks.states[3] = {
      'usd-artwork': { invoiced_at: '2026-01-02', invoice_url: 'https://example.com/invoice.pdf' },
      'eur-artwork': { invoiced_at: '2026-01-02' },
    }
    const html = renderToStaticMarkup(<CommissionsPage />)
    const table = html.match(/<table class="w-full border-collapse text-sm">([\s\S]*?)<\/table>/)![1]
    const body = table.match(/<tbody>([\s\S]*?)<\/tbody>/)![1]
    const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    const zeroRow = rows.find(([, row]) => row.includes('usd-artwork'))![1]
    expect(zeroRow).not.toContain('Add file invoice')
    expect(zeroRow).not.toContain('>Save</button>')
    expect(zeroRow).toContain('Open invoice')
    expect(zeroRow).toContain('Exceptional rate for')
    const normalRow = rows.find(([, row]) => row.includes('eur-artwork'))![1]
    expect(normalRow).toContain('Add file invoice')
    expect(normalRow).toContain('>Save</button>')
  })

  it.each(['Florac', 'Léopold Meyer'])('prepares only %s for printing without opening screen details', company => {
    mocks.states[15] = []
    mocks.states[18] = company
    const html = renderToStaticMarkup(<CommissionsPage />)
    expect(html.match(/<table class="w-full text-sm">/g)).toHaveLength(1)
    expect(html).toContain('hidden mt-3 overflow-x-auto border-t pt-3 correction-details')
    expect(html).toMatch(/<tr><th[^>]*>Purchase date<\/th><th[^>]*>Artist<\/th>/)
    expect(html).toContain('scope="row" colSpan="5"')
    expect(html).not.toContain('Hide details</button>')
  })

  it('stacks Proposed by above Buyer without a separate column and keeps totals aligned', () => {
    const html = renderToStaticMarkup(<CommissionsPage />)
    const table = html.match(/<table class="w-full border-collapse text-sm">([\s\S]*?)<\/table>/)![1]
    const header = table.match(/<thead[\s\S]*?<\/thead>/)![0]
    expect(header).toContain('<p>Proposed by</p><p class="italic font-bold">Buyer</p>')
    expect(header).not.toContain('Company')
    expect(header.match(/<th /g)).toHaveLength(12)
    const body = table.match(/<tbody>([\s\S]*?)<\/tbody>/)![1]
    const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    expect(rows).toHaveLength(3)
    for (const [, row] of rows) {
      expect(row).toContain('<p>Proposing gallery</p><p class="italic font-bold">Florac</p>')
      expect(row.match(/<td /g)).toHaveLength(12)
      expect(row).toContain('<div class="mt-2 flex items-center justify-end gap-2">')
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      expect(cells[10][1]).toContain('Invoice date for')
      expect(cells[10][1]).toContain('Add file invoice')
      expect(cells[10][1]).not.toContain('>Save</button>')
      expect(cells[11][1]).toContain('Exceptional rate for')
      expect(cells[11][1]).toContain('>Save</button>')
      expect(cells[11][1]).toContain('class="mt-2 flex items-center justify-start gap-2"')
      expect(cells[11][1]).not.toContain('Add file invoice')
      expect(cells[10][1].indexOf('Invoice date for')).toBeLessThan(
        cells[10][1].indexOf('Add file invoice')
      )
    }
    const footer = table.match(/<tfoot[\s\S]*?<\/tfoot>/)![0]
    for (const [, row] of footer.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const cells = [...row.matchAll(/<td([^>]*)>/g)]
      const columns = cells.reduce((sum, [, attributes]) => {
        return sum + Number(attributes.match(/colSpan="(\d+)"/)?.[1] ?? 1)
      }, 0)
      expect(columns).toBe(12)
    }
  })

  it('shows old commissions struck through above bold green corrected amounts in both currencies', () => {
    const html = renderToStaticMarkup(<CommissionsPage />)
    const table = html.match(/<table class="w-full border-collapse text-sm">([\s\S]*?)<\/table>/)![1]
    const body = table.match(/<tbody>([\s\S]*?)<\/tbody>/)![1]
    const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    const euroRow = rows.find(([, row]) => row.includes('eur-artwork'))![1]
    expect(euroRow).toContain("<del>EUR 1&#x27;600</del>")
    expect(euroRow).toContain("<del>USD 2&#x27;400</del>")
    expect(euroRow).toContain(
      '<div class="font-bold text-green-700"><p>EUR 1&#x27;400</p><p class="text-xs">USD 2&#x27;100</p></div>'
    )
    expect(euroRow).toContain('<del>8.00 %</del>')
    expect(euroRow).toContain('<del>8.00 %</del><p class="text-xs" aria-hidden="true"> </p><p class="font-bold text-green-700">7 %</p>')
    expect(euroRow).not.toContain('(7 %)')
    const commissionCell = [...euroRow.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)][9][1]
    expect(commissionCell).not.toContain('<a')
    expect(euroRow).not.toContain('corrected to')
    expect(euroRow.indexOf('<del>')).toBeLessThan(euroRow.indexOf('font-bold text-green-700'))
    expect(euroRow).toContain('<p class="text-xs font-bold text-red-700">USD 300</p>')
    expect(euroRow.indexOf('USD 2&#x27;100')).toBeLessThan(euroRow.indexOf('USD 300'))
    const usdRow = rows.find(([, row]) => row.includes('usd-artwork'))![1]
    expect(usdRow).toContain('<p class="text-xs font-bold text-red-700">USD 100</p>')
    const thresholdRow = rows.find(([, row]) => row.includes('threshold-artwork'))![1]
    expect(thresholdRow).not.toContain('<del>')
    expect(thresholdRow).not.toContain('font-bold text-green-700')
    expect(thresholdRow).not.toContain('font-bold text-red-700')
    expect(thresholdRow).toContain('7.00 %')
  })
})
