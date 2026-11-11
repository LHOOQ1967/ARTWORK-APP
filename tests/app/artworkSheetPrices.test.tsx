import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ArtworkSheet from '@/components/artwork/ArtworkSheet'
import type { ArtworkPrint } from '@/app/(protected)/types/artwork'

const session = vi.hoisted(() => ({ role: 'Editor' as string | undefined }))
const navigation = vi.hoisted(() => ({ returnTo: null as string | null }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(navigation.returnTo ? { returnTo: navigation.returnTo } : {}),
}))
vi.mock('@/contexts/SessionContext', () => ({
  useSessionProfile: () => ({ role: session.role }),
}))
vi.mock('@/components/artwork/ArtworkViewerComment', () => ({
  default: () => null,
}))
vi.mock('@/lib/supabaseBrowser', () => ({ supabase: {} }))

beforeEach(() => {
  session.role = 'Editor'
  navigation.returnTo = null
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

function render(prices: Partial<ArtworkPrint>) {
  return renderToStaticMarkup(
    <ArtworkSheet artwork={{ id: 'work', auctions: true, auction_currency: 'USD', ...prices }} canEdit />
  )
}

describe('factsheet auction prices', () => {
  it('hides certificate location when none is specified', () => {
    expect(render({})).not.toContain('Certificate location')
  })

  it('shows certificate location when a contact or address is specified', () => {
    expect(render({
      certificate_location_contact_id: 'contact',
      certificateLocation: { id: 'contact', company_name: 'Certificate Archive' },
    })).toContain('Certificate location')
    expect(render({
      certificate_location_address_id: 'address',
    })).toContain('Certificate location')
  })

  it('displays stored local sale time unchanged rather than converting it to Geneva', () => {
    const html = render({ sale_date: '2026-11-17', sale_time: '18:30:00' })
    expect(html).toContain('17.11.2026 at 18:30 (local time)')
  })
  it('separates left-side badges from right-side actions', () => {
    const html = render({ priority: 'High', quality: 8, status: 'Viewed' })
    const badges = html.match(/aria-label="Artwork priority, rating and status"[^>]*>([\s\S]*?)<\/div>/)?.[1]
    const actions = html.match(/aria-label="Factsheet actions"[^>]*>([\s\S]*?)<\/div>/)?.[1]
    expect(badges).toContain('[High]')
    expect(badges).toContain('8/10')
    expect(badges).not.toContain('>Back<')
    expect(actions).toContain('>Back<')
    expect(actions).toContain('>Print<')
    expect(actions).toContain('>Edit<')
    expect(html).toMatch(/aria-label="Factsheet actions"[^>]*margin-left:auto/)
  })

  it('places Back immediately before Print without separating the buttons', () => {
    const html = render({})
    expect(html).toMatch(/<a[^>]*class="no-print edit-button"[^>]*>Back<\/a><button[^>]*>Print<\/button>/)
    expect(html).not.toContain('margin-right:auto')
  })

  it('includes the original filtered list in the Edit link', () => {
    navigation.returnTo = '/artworks/active?marketType=auction&search=bronze'
    const html = render({})
    const editHref = html.match(/href="([^"]*\/artworks\/work\/edit[^"]*)"/)?.[1]
    expect(editHref).toBeDefined()
    expect(new URL(editHref!, 'http://localhost').searchParams.get('returnTo')).toBe(navigation.returnTo)
  })
  it.each(['Editor', 'Administrator'])('shows proposal recipients alongside the proposer for %s', role => {
    session.role = role
    const html = render({
      proposedBy: { id: 'gallery', company_name: 'Proposing Gallery' },
      proposals: [
        { id: 'p1', contact_label: 'Florac' },
        { id: 'p2', contact_label: 'Florac' },
        { id: 'p3', contact: { id: 'client', first_name: 'Léopold', last_name: 'Meyer' } },
      ],
    })
    const header = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)![1]
    expect(header).toContain('Proposing Gallery')
    expect(header).not.toContain('Proposed to:')
    expect(html).toContain('text-align:right')
    expect(html).toContain('margin-left:auto')
    expect(html).toContain('Proposed to: Florac, Léopold Meyer')
    expect(header).not.toContain('no-print')
  })

  it.each(['Viewer', undefined, 'Unknown'])('hides recipients for role %s even if data and canEdit are supplied', role => {
    session.role = role
    const html = render({ proposals: [{ id: 'p1', contact_label: 'Private Buyer' }] })
    expect(html).not.toContain('Proposed to:')
    expect(html).not.toContain('Private Buyer')
  })

  it('supports artwork_proposals and proposedTo contacts without a proposer', () => {
    const html = render({
      artwork_proposals: [{ id: 'p1', proposedTo: { id: 'contact', company_name: 'Buyer Company' } }],
    })
    expect(html).toContain('Proposed to: ')
    expect(html).toContain('Buyer Company')
  })

  it('omits the recipient label when proposals are empty or lack a contact name', () => {
    expect(render({ proposals: [{ id: 'p1' }] })).not.toContain('Proposed to:')
    expect(render({ proposals: [] })).not.toContain('Proposed to:')
  })

  it('shows collapsible link categories and keeps gallery images separate', () => {
    const html = render({ documents: [
      { id: 'general', artwork_id: 'work', document_type: 'link', label: 'Certificate', url: '/certificate' },
      { id: 'photos', artwork_id: 'work', document_type: 'link', label: 'Photo archive', url: '/photos', link_category: 'images' },
      { id: 'book', artwork_id: 'work', document_type: 'link', label: 'Catalogue scan', url: '/book', link_category: 'exhibitions_literature', storage_provider: 'sharepoint' },
    ] })
    expect(html).toContain('General (1)')
    expect(html).toContain('Images (1)')
    expect(html).toContain('Exhibitions &amp; Literature (1)')
    expect(html.match(/<details /g)).toHaveLength(3)
    expect(html).toContain('href="/book"')
    expect(html).toContain('aria-label="Download all SharePoint files as ZIP"')
    expect(html).toContain('href="/api/artworks/work/documents/download"')
    expect(html).not.toContain('Download by category')
    expect(html).not.toContain(' / </')
  })

  it('does not show the ZIP action when links are not stored in SharePoint', () => {
    const html = render({ documents: [
      { id: 'general', artwork_id: 'work', document_type: 'link', label: 'Certificate', url: '/certificate' },
    ] })
    expect(html).not.toContain('Download all SharePoint files as ZIP')
  })

  it('omits empty link groups', () => {
    const html = render({ documents: [
      { id: 'general', artwork_id: 'work', document_type: 'link', label: 'Certificate', url: '/certificate' },
    ] })
    expect(html).toContain('General (1)')
    expect(html).not.toContain('Images (0)')
    expect(html).not.toContain('Exhibitions &amp; Literature')
  })

  it('shows a clickable score between Priority and Status without Quality or History labels', () => {
    const html = render({ priority: 'High', quality: 8, status: 'Viewed' })
    const priorityIndex = html.indexOf('[High]')
    const qualityIndex = html.indexOf('>8/10</button>')
    const historyIndex = html.indexOf('View quality history')
    const statusIndex = html.indexOf('>Viewed</span>')
    expect(priorityIndex).toBeGreaterThanOrEqual(0)
    expect(qualityIndex).toBeGreaterThan(priorityIndex)
    expect(historyIndex).toBeGreaterThan(priorityIndex)
    expect(qualityIndex).toBeGreaterThan(historyIndex)
    expect(statusIndex).toBeGreaterThan(qualityIndex)
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).not.toContain('Quality:')
    expect(html).not.toMatch(/aria-label="View quality history"[^>]*>History<\/button>/)
  })

  it('shows unrated Quality on the factsheet', () => {
    expect(render({ quality: null })).toContain('>Not rated</button>')
  })

  it('displays execution year ranges using a slash', () => {
    const html = render({ title: 'Test work', year_execution_start: 2024, year_execution: 2026 })
    expect(html).toContain('2024/2026')
    expect(html).not.toContain('2024–2026')
  })

  it('preserves single-year factsheets', () => {
    const html = render({ title: 'Test work', year_execution: 2026 })
    expect(html).toContain('2026')
    expect(html).not.toContain('/2026')
  })

  it('shows edition after signature', () => {
    const html = render({ signature: 'Signed lower right', edition: '3/10' })
    expect(html).toContain('>3/10</div>')
    expect(html).not.toContain('Edition:')
    expect(html.indexOf('Signed lower right')).toBeLessThan(html.indexOf('>3/10</div>'))
  })

  it('hides edition when it is not provided', () => {
    expect(render({ edition: null })).not.toContain('Edition:')
  })

  it('shows a premium-only Blondeau suggestion', () => {
    const html = render({ auction_max_hammer: null, auction_max_premium: 125000 })
    expect(html).toContain('Suggestion B.')
    expect(html).toContain('(premium)')
    expect(html).not.toContain('(hammer)')
  })

  it('shows premium-only auction results with their own currency', () => {
    const html = render({ sold_hammer: null, sold_premium: 150000, sold_premium_currency: 'CHF' })
    expect(html).toContain('Sold')
    expect(html).toContain('CHF')
    expect(html).toContain('(premium)')
    expect(html).not.toContain('(hammer)')
  })

  it('shows both components of suggestions and results', () => {
    const html = render({
      auction_max_hammer: 100000, auction_max_premium: 125000,
      sold_hammer: 110000, sold_premium: 135000,
    })
    expect(html.match(/\(hammer\)/g)).toHaveLength(2)
    expect(html.match(/\(premium\)/g)).toHaveLength(2)
  })

  it('retains zero values instead of hiding the rows', () => {
    const html = render({ auction_max_hammer: 0, sold_premium: 0 })
    expect(html).toContain('USD 0 (hammer)')
    expect(html).toContain('USD 0 (premium)')
  })

  it('hides rows when no amount is recorded', () => {
    const html = render({})
    expect(html).not.toContain('Suggestion B.')
    expect(html).not.toContain('(hammer)')
    expect(html).not.toContain('(premium)')
  })
});
