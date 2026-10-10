import { describe, expect, it } from 'vitest'
import { auctionHouseContactFields } from '@/lib/artworkAuctionHouse'

describe('shared auction house selection for creation, imports and edits', () => {
  it('updates both contact IDs when selecting a house', () => {
    expect(auctionHouseContactFields('house')).toEqual({
      auction_contact_id: 'house', proposed_by_id: 'house',
    })
  })
  it('replaces an existing proposed-by contact when changing houses', () => {
    expect({ proposed_by_id: 'old', ...auctionHouseContactFields('new') }).toEqual({
      auction_contact_id: 'new', proposed_by_id: 'new',
    })
  })
  it('preserves proposed by when clearing the house', () => {
    expect({ proposed_by_id: 'contact', ...auctionHouseContactFields(null) }).toEqual({
      auction_contact_id: null, proposed_by_id: 'contact',
    })
  })
})
