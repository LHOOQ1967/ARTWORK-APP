import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ArtworkSheet from '@/components/artwork/ArtworkSheet'
import type { ArtworkPrint } from '@/app/(protected)/types/artwork'

vi.mock('@/contexts/SessionContext', () => ({
  useSessionProfile: () => ({ role: 'Editor' }),
}))
vi.mock('@/components/artwork/ArtworkViewerComment', () => ({
  default: () => null,
}))
vi.mock('@/lib/supabaseBrowser', () => ({ supabase: {} }))

beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}))
afterEach(() => vi.restoreAllMocks())

function render(prices: Partial<ArtworkPrint>) {
  return renderToStaticMarkup(
    <ArtworkSheet artwork={{ id: 'work', auctions: true, auction_currency: 'USD', ...prices }} canEdit />
  )
}

describe('factsheet auction prices', () => {
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
    expect(html).toContain('Edition: 3/10')
    expect(html.indexOf('Signed lower right')).toBeLessThan(html.indexOf('Edition: 3/10'))
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
