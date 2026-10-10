import { isValidElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ArtworkFieldsLayout } from '@/components/artwork/ArtworkFieldsLayout'
import type { ArtworkForm } from '@/app/(protected)/types/artwork'

vi.mock('@/lib/supabaseBrowser', () => ({ supabase: {} }))

function findAuctionRow(node: ReactNode): ReactNode {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findAuctionRow(child)
      if (found) return found
    }
  }
  if (isValidElement<{ label?: string; children?: ReactNode }>(node)) {
    if (node.props.label === 'Auction House') return node.props.children
    return findAuctionRow(node.props.children)
  }
  return null
}

describe('new artwork auction house', () => {
  it.each(['house-a', 'house-b'])('copies selected house %s to proposed by', houseId => {
    const setArtwork = vi.fn()
    const artwork = { auctions: true, proposed_by_id: 'old-contact' } as ArtworkForm
    const select = findAuctionRow(ArtworkFieldsLayout({ artwork, setArtwork, isEditing: true }))
    if (!isValidElement<{ onChange: (value: string) => void }>(select)) {
      throw new Error('Auction House selector not found')
    }
    select.props.onChange(houseId)
    expect(setArtwork).toHaveBeenCalledWith(expect.objectContaining({
      auction_contact_id: houseId,
      proposed_by_id: houseId,
    }))
  })

  it('does not erase proposed by when clearing the auction house', () => {
    const setArtwork = vi.fn()
    const artwork = { auctions: true, proposed_by_id: 'contact' } as ArtworkForm
    const select = findAuctionRow(ArtworkFieldsLayout({ artwork, setArtwork, isEditing: true }))
    if (!isValidElement<{ onChange: (value: string) => void }>(select)) {
      throw new Error('Auction House selector not found')
    }
    select.props.onChange('')
    expect(setArtwork).toHaveBeenCalledWith(expect.objectContaining({
      auction_contact_id: null,
      proposed_by_id: 'contact',
    }))
  })
})
