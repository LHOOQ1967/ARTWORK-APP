// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  sections: [] as Record<string, unknown>[],
  items: [] as Record<string, unknown>[],
  files: [] as Record<string, unknown>[],
  links: [] as Record<string, unknown>[],
  role: 'Editor',
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
    mocks.files = []
    mocks.links = []
    mocks.role = 'Editor'
    mocks.from.mockImplementation((table: string) => {
      const result = table === 'profiles'
        ? { data: { role: mocks.role }, error: null }
        : { data: table === 'market_sections' ? mocks.sections
          : table === 'market_auction_files' ? mocks.files
          : table === 'market_auction_file_links' ? mocks.links : mocks.items, error: null }
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

  it('shows PDFs and offers only catalogues from the same section', async () => {
    mocks.items.push(item('auction-item-2', 'auction', 'Second lot'))
    mocks.files = [
      { id: 'cat', section_id: 'auction', kind: 'catalogue', file_name: 'sale.pdf' },
      { id: 'result', section_id: 'auction', kind: 'result', file_name: 'result.pdf' },
      { id: 'other', section_id: 'fair', kind: 'catalogue', file_name: 'other.pdf' },
    ]
    mocks.links = [
      { item_id: 'auction-item', section_id: 'auction', kind: 'catalogue', file_id: 'cat' },
      { item_id: 'auction-item', section_id: 'auction', kind: 'result', file_id: 'result' },
    ]
    await renderPage()
    await act(async () => container.querySelectorAll<HTMLButtonElement>('button[aria-label="Déplier la section"]').forEach(button => button.click()))
    expect(container.querySelector('a[href="/api/market/auction-files/cat"]')?.textContent).toBe('sale.pdf')
    expect(container.querySelector('a[href="/api/market/auction-files/result"]')?.textContent).toBe('result.pdf')
    const select = container.querySelector<HTMLSelectElement>('[aria-label="Choose existing catalogue for Second lot"]')!
    expect([...select.options].map(option => option.value)).toEqual(['', 'cat'])
    expect(container.querySelector('[aria-label="Upload Result PDF for Fair resource"]')).toBeNull()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    await act(async () => {
      select.value = 'cat'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/market/items/auction-item-2/auction-files', expect.objectContaining({
      method: 'PUT', body: JSON.stringify({ fileId: 'cat' }),
    }))
  })

  it('confirms a shared catalogue replacement and allows viewers to open files without editing', async () => {
    mocks.items.push(item('auction-item-2', 'auction', 'Second lot'))
    mocks.files = [{ id: 'cat', section_id: 'auction', kind: 'catalogue', file_name: 'sale.pdf' }]
    mocks.links = ['auction-item', 'auction-item-2'].map(itemId => ({
      item_id: itemId, section_id: 'auction', kind: 'catalogue', file_id: 'cat',
    }))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await renderPage()
    await act(async () => container.querySelectorAll<HTMLButtonElement>('button[aria-label="Déplier la section"]').forEach(button => button.click()))
    const input = container.querySelector<HTMLInputElement>('[aria-label="Upload Catalogue PDF for Auction lot"]')!
    Object.defineProperty(input, 'files', { value: [new File(['%PDF-'], 'new.pdf')], configurable: true })
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
    expect(confirm).toHaveBeenCalledWith('Replace this shared catalogue for all linked sales?')
    expect(fetchMock).not.toHaveBeenCalled()

    await act(async () => root.unmount())
    root = createRoot(container)
    mocks.role = 'Viewer'
    await renderPage()
    await act(async () => container.querySelectorAll<HTMLButtonElement>('button[aria-label="Déplier la section"]').forEach(button => button.click()))
    expect(container.querySelector('a[href="/api/market/auction-files/cat"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Upload Catalogue PDF for Auction lot"]')).toBeNull()
  })
})
