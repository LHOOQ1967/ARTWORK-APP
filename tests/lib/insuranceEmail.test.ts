import { describe, expect, it } from 'vitest'
import { buildInsuranceEmail, type InsuranceEmailArtwork } from '@/lib/insuranceEmail'

const artwork: InsuranceEmailArtwork = {
  title: 'Work & Study #1',
  year_execution: 2026,
  year_execution_start: 2024,
  date_acquisition: '2026-10-11',
  first_name: 'First',
  last_name: 'Last',
  medium: 'Oil on canvas',
  height_cm: 100,
  width_cm: 80,
  depth_cm: null,
  insurance_value: 120000,
  insurance_currency: 'CHF',
  location_contact_name: 'Warehouse A',
  destination_contact_name: 'Client B',
}

function decodeEmail(input: InsuranceEmailArtwork) {
  const email = buildInsuranceEmail(input)
  return { ...email, params: new URL(email.href).searchParams }
}

describe('insurance email drafts', () => {
  it('addresses Alison and fills the exact template using the original insured value', () => {
    const email = decodeEmail(artwork)
    expect(email.href).toMatch(/^mailto:alison\.hillier@howdengroup\.com\?/)
    expect(email.params.get('subject')).toBe('Insurance request: Work & Study #1')
    expect(email.params.get('body')).toBe([
      'Dear Alison,',
      '',
      'Hoping all is well with you.',
      '',
      'Thank you to insure this following work as of 11 October 2026:',
      '',
      'First Last',
      'Work & Study #1, 2024/2026',
      'Oil on canvas',
      '100 x 80 cm',
      "Insurance: CHF 120'000,-",
      '',
      'This work is deposited at Warehouse A and will be soon shipped to Client B',
      '',
      'With my thanks and my best regards,',
      'Sandrine',
    ].join('\r\n'))
    expect(email.missingFields).toEqual([])
  })

  it('preserves accents, line breaks and special characters in encoded email content', () => {
    const email = decodeEmail({ ...artwork, first_name: 'René', title: 'Étude + #2 & 50%', medium: 'Oil\nCanvas' })
    expect(email.params.get('body')).toContain('René Last\r\nÉtude + #2 & 50%, 2024/2026')
    expect(email.params.get('body')).toContain('Oil\nCanvas')
  })

  it('uses only the existing year for single-year works and accepts zero insured value', () => {
    const email = decodeEmail({ ...artwork, year_execution_start: null, insurance_value: 0 })
    expect(email.params.get('body')).toContain('Work & Study #1, 2026\r\n')
    expect(email.params.get('body')).toContain('Insurance: CHF 0,-')
    expect(email.missingFields).toEqual([])
  })

  it('uses apostrophes for every thousands separator and preserves decimal points', () => {
    const email = decodeEmail({ ...artwork, insurance_value: 1234567.5 })
    expect(email.params.get('body')).toContain("Insurance: CHF 1'234'567.5,-")
  })

  it('builds dimensions from height, width and depth in that order', () => {
    expect(decodeEmail({ ...artwork, depth_cm: 20 }).params.get('body')).toContain('100 x 80 x 20 cm')
  })

  it('omits zero depth and preserves decimal dimensions', () => {
    expect(decodeEmail({ ...artwork, height_cm: 100.5, depth_cm: 0 }).params.get('body')).toContain('100.5 x 80 cm')
  })

  it.each([null, '2026-02-30', 'invalid'])('flags missing or invalid purchase dates: %s', (date) => {
    const email = decodeEmail({ ...artwork, date_acquisition: date })
    expect(email.missingFields).toContain('Purchase date')
    expect(email.params.get('body')).toContain('[Purchase date not specified]')
  })

  it('explicitly identifies missing insurance and location details without invented values', () => {
    const email = decodeEmail({
      ...artwork, insurance_value: null, insurance_currency: null,
      medium: null, height_cm: null, width_cm: null, depth_cm: null,
      location_contact_name: null, destination_contact_name: null,
    })
    expect(email.missingFields).toEqual([
      'Medium', 'Dimensions', 'Insurance currency', 'Insured value', 'Location', 'Destination',
    ])
    expect(email.params.get('body')).toContain('Insurance: [Insurance currency not specified] [Insured value not specified],-')
  })
})
