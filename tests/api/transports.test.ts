import { describe, expect, it } from 'vitest'
import { parseQuoteInput, parseTransportInput } from '@/lib/transports'

describe('transport input parsing', () => {
  it('requires an artwork when creating a transport', () => {
    expect(parseTransportInput({}, true)).toBeNull()
    expect(parseTransportInput({ artwork_id: 'a1' }, true)).toEqual({ artwork_id: 'a1' })
  })

  it('rejects invalid dates', () => {
    expect(parseTransportInput({ transport_date: '03/10/2026' }, false)).toBeNull()
    expect(parseTransportInput({ transport_date: '2026-10-03' }, false)).toEqual({
      transport_date: '2026-10-03',
    })
  })

  it('validates quote amount and currency', () => {
    expect(parseQuoteInput({ amount: -1 }, false)).toBeNull()
    expect(parseQuoteInput({ currency: 'XXX' }, false)).toBeNull()
    expect(parseQuoteInput({ amount: '120.5', currency: 'chf' }, true)).toEqual({
      currency: 'CHF',
      amount: 120.5,
    })
  })
})
