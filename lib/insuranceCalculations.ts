function parseIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return { year, month, day, timestamp: date.getTime() }
}

export function getPolicyExpirationDate(startDate: string) {
  const parsed = parseIsoDate(startDate)
  if (!parsed) return null

  const expirationYear = parsed.year + 1
  const lastDayOfMonth = new Date(
    Date.UTC(expirationYear, parsed.month, 0)
  ).getUTCDate()
  const expirationDay = Math.min(parsed.day, lastDayOfMonth)
  const month = String(parsed.month).padStart(2, '0')
  const day = String(expirationDay).padStart(2, '0')

  return `${expirationYear}-${month}-${day}`
}

export function getRemainingPolicyFraction(startDate: string, purchaseDate: string) {
  const start = parseIsoDate(startDate)
  const purchase = parseIsoDate(purchaseDate)
  const expirationDate = getPolicyExpirationDate(startDate)
  const expiration = expirationDate ? parseIsoDate(expirationDate) : null

  if (!start || !purchase || !expiration) return null

  const policyDays = expiration.timestamp - start.timestamp
  const remainingDays = Math.max(
    0,
    expiration.timestamp - Math.max(start.timestamp, purchase.timestamp)
  )

  return remainingDays / policyDays
}

export function calculateInsurancePremium(
  insuredValueUsd: number | null,
  annualRatePercent: number | null,
  remainingPolicyFraction: number | null
) {
  if (
    insuredValueUsd === null ||
    annualRatePercent === null ||
    remainingPolicyFraction === null
  ) {
    return null
  }

  return insuredValueUsd * (annualRatePercent / 100) * remainingPolicyFraction
}
