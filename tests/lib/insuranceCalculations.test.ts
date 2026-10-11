import { describe, expect, it } from 'vitest'
import {
  calculateInsurancePremium,
  getPolicyExpirationDate,
  getRemainingPolicyFraction,
} from '@/lib/insuranceCalculations'

describe('insurance policy calculations', () => {
  it('sets the expiration date one year after the policy starts', () => {
    expect(getPolicyExpirationDate('2026-04-15')).toBe('2027-04-15')
    expect(getPolicyExpirationDate('2024-02-29')).toBe('2025-02-28')
  })

  it('charges a full year for purchases before or on the policy start', () => {
    expect(getRemainingPolicyFraction('2026-01-01', '2020-04-15')).toBe(1)
    expect(getRemainingPolicyFraction('2026-01-01', '2026-01-01')).toBe(1)
  })

  it('prorates purchases during the policy from purchase to expiration', () => {
    const fraction = getRemainingPolicyFraction('2026-01-01', '2026-07-01')
    expect(fraction).toBeCloseTo(184 / 365)
    expect(calculateInsurancePremium(100_000, 2, fraction)).toBeCloseTo(2_000 * 184 / 365)
  })

  it('charges nothing for purchases on or after expiration', () => {
    expect(getRemainingPolicyFraction('2026-01-01', '2027-01-01')).toBe(0)
    expect(getRemainingPolicyFraction('2026-01-01', '2027-06-01')).toBe(0)
  })

  it('uses the actual policy length during a leap year', () => {
    expect(getRemainingPolicyFraction('2024-01-01', '2024-07-01')).toBeCloseTo(184 / 366)
  })

  it('rejects invalid policy or purchase dates', () => {
    expect(getRemainingPolicyFraction('invalid', '2026-06-01')).toBeNull()
    expect(getRemainingPolicyFraction('2026-01-01', '')).toBeNull()
    expect(getRemainingPolicyFraction('2026-01-01', '2026-02-30')).toBeNull()
  })

  it('prorates the annual premium by the remaining policy fraction', () => {
    expect(calculateInsurancePremium(100_000, 2, 0.5)).toBe(1_000)
    expect(calculateInsurancePremium(100_000, null, 0.5)).toBeNull()
  })
})
