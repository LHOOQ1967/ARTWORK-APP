export type PremiumInputField = 'hammer' | 'total'

export function auctionHouseKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
}

export const auctionCities: Record<string, string> = {
  USD: 'New York',
  GBP: 'London',
  HKD: 'Hong Kong',
  EUR: 'Paris',
}

export type PremiumCalculation = {
  currency: string
  hammer: number
  total: number
  house: string
  date: string
  field: PremiumInputField
  amount: number
  schedule: { valid_from: string; valid_to: string | null }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isValidSaleDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
}

export function isPremiumCalculation(value: unknown): value is PremiumCalculation {
  if (!isRecord(value) || !isRecord(value.schedule)) return false
  return typeof value.currency === 'string' && typeof value.house === 'string' &&
    isValidSaleDate(value.date) && (value.field === 'hammer' || value.field === 'total') &&
    typeof value.amount === 'number' && Number.isFinite(value.amount) && value.amount >= 0 &&
    typeof value.hammer === 'number' && Number.isFinite(value.hammer) && value.hammer >= 0 &&
    typeof value.total === 'number' && Number.isFinite(value.total) && value.total >= value.hammer &&
    isValidSaleDate(value.schedule.valid_from) &&
    (value.schedule.valid_to === null || isValidSaleDate(value.schedule.valid_to))
}
