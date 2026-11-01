import { describe, expect, it } from 'vitest'
import { annualStandardCommissionRates } from '@/lib/commissionRates'

function purchase(id: string, acquisitionDate: string, purchaseUsd: number) {
  return { id, acquisitionDate, purchaseUsd, exceptionalRate: null as number | null, invoicedAt: null as string | null }
}

describe('annual commission rates after the threshold', () => {
  const earlier = purchase('earlier', '2026-09-29', 40_000)
  const threshold = purchase('threshold', '2026-10-14', 4_960_000)

  it('applies 7% retroactively to uninvoiced purchases at exactly USD 5,000,000', () => {
    const rates = annualStandardCommissionRates([threshold, earlier])
    expect(rates.get('earlier')).toBe(0.07)
    expect(rates.get('threshold')).toBe(0.07)
  })

  it('keeps 8% below the threshold', () => {
    const rates = annualStandardCommissionRates([earlier, { ...threshold, purchaseUsd: 4_959_999 }])
    expect([...rates.values()]).toEqual([0.08, 0.08])
  })

  it.each([
    ['2026-10-13', 0.08],
    ['2026-10-14', 0.07],
    ['2026-10-28', 0.07],
  ])('uses invoice date %s to preserve the correct rate %s', (invoicedAt, expected) => {
    expect(annualStandardCommissionRates([{ ...earlier, invoicedAt }, threshold]).get('earlier')).toBe(expected)
  })

  it('excludes all exceptional rates, including zero, from qualifying purchases', () => {
    const rates = annualStandardCommissionRates([
      earlier,
      { ...threshold, exceptionalRate: 0 },
      { ...purchase('exception', '2026-10-08', 6_400_000), exceptionalRate: 0.03 },
    ])
    expect(rates.get('earlier')).toBe(0.08)
  })

  it('does not count purchases lacking USD conversion toward the threshold', () => {
    expect(annualStandardCommissionRates([earlier, { ...threshold, purchaseUsd: null }]).get('earlier')).toBe(0.08)
  })
})
