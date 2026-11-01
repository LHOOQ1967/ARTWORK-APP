export const THRESHOLD_USD = 5_000_000
export const STANDARD_RATE = 0.08
export const REDUCED_RATE = 0.07

type CommissionPurchase = {
  id: string
  acquisitionDate: string
  purchaseUsd: number | null
  exceptionalRate: number | null
  invoicedAt: string | null
}

export function annualStandardCommissionRates(purchases: CommissionPurchase[]) {
  const ordered = [...purchases].sort((a, b) => a.acquisitionDate.localeCompare(b.acquisitionDate))
  let qualifyingTotal = 0
  let thresholdDate: string | null = null
  const cumulativeRates = new Map<string, number>()

  for (const purchase of ordered) {
    if (purchase.exceptionalRate === null) qualifyingTotal += purchase.purchaseUsd ?? 0
    if (thresholdDate === null && qualifyingTotal >= THRESHOLD_USD) {
      thresholdDate = purchase.acquisitionDate.slice(0, 10)
    }
    cumulativeRates.set(purchase.id, qualifyingTotal >= THRESHOLD_USD ? REDUCED_RATE : STANDARD_RATE)
  }

  return new Map(ordered.map(purchase => [
    purchase.id,
    thresholdDate !== null &&
    (!purchase.invoicedAt || purchase.invoicedAt >= thresholdDate)
      ? REDUCED_RATE
      : cumulativeRates.get(purchase.id)!,
  ]))
}
