// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  sections: [] as Record<string, unknown>[],
  items: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/supabaseBrowser', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'editor' } }, error: null }) },
    from: mocks.from,
  },
}))

import MarketPage from '@/app/(protected)/market/page'

let container: HTMLDivElement
let root: Root

const section = (id: string, title: string, category: string, startDate: string) => ({
  id,
  title,
  category,
  start_date: startDate,
  end_date: startDate,
  notes: null,
  position: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

const item = (id: string, sectionId: string, label: string) => ({
  id,
  section_id: sectionId,
  item_type: 'web_link',
  label,
  web_url: 'https://example.com',
  added_at: '2026-01-01',
  notes: null,
  position: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  auction_house: null,
  auction_datetime: '2099-12-01T12:00:00',
  catalogue_status: 'Received',
  paddle_places: 'Yes 1',
  document_id: null,
  document_url: null,
  document_type: null,
})

async function renderPage() {
  await act(async () => root.render(<MarketPage />))
}

describe('Art Market section auction fields', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    mocks.sections = [
      section('auction', 'Auction section', 'Ventes aux enchères', '2099-12-01'),
      section('fair', 'Fair section', 'Foire', '2099-11-30'),
    ]
    mocks.items = [
      item('auction-item', 'auction', 'Auction lot'),
      item('fair-item', 'fair', 'Fair resource'),
    ]
    mocks.from.mockImplementation((table: string) => {
      const result = table === 'profiles'
        ? { data: { role: 'Editor' }, error: null }
        : { data: table === 'market_sections' ? mocks.sections : mocks.items, error: null }
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        maybeSingle: vi.fn().mockResolvedValue(result),
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      }
      return chain
    })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('only shows Catalogue and Paddle/Places for auction sections in calendar and section views', async () => {
    await renderPage()

    const sectionsButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Sections')!
    const calendarButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Auction calendar')!
    expect(sectionsButton.getAttribute('aria-pressed')).toBe('true')

    await act(async () => calendarButton.click())
    expect(container.querySelectorAll('[aria-label^="Catalogue status for"]')).toHaveLength(1)
    expect(container.querySelector('[aria-label="Paddle/Places for Auction lot"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Paddle/Places for Fair resource"]')).toBeNull()

    await act(async () => sectionsButton.click())
    const expandButtons = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Déplier la section"]')
    await act(async () => expandButtons.forEach((button) => button.click()))

    expect(container.querySelectorAll('[aria-label^="Catalogue status for"]')).toHaveLength(1)
    expect(container.querySelector('[aria-label="Paddle/Places for Auction lot"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Paddle/Places for Fair resource"]')).toBeNull()
  })

  it('only offers the Catalogue field when the selected section is an auction', async () => {
    await renderPage()
    const sectionsButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Sections')!
    await act(async () => sectionsButton.click())
    expect(container.querySelector('#item-catalogue')).not.toBeNull()

    const sectionSelect = [...container.querySelectorAll('select')]
      .find((select) => select.querySelector('option[value="fair"]'))!
    await act(async () => {
      sectionSelect.value = 'fair'
      sectionSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(container.querySelector('#item-catalogue')).toBeNull()
  })
})
