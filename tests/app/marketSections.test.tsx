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
  sessions: [] as Record<string, unknown>[],
  role: 'Editor',
  writes: [] as { table: string; operation: string; values: unknown }[],
  sessionWriteError: null as { message: string } | null,
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
  lot_info: null,
  catalogue_status: 'Received',
  paddle_places: 'Yes 1',
  document_id: null,
  document_url: null,
  document_type: null,
})

async function renderPage() {
  await act(async () => root.render(<MarketPage />))
}

async function setInputValue(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
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
    mocks.sessions = []
    mocks.writes = []
    mocks.sessionWriteError = null
    mocks.role = 'Editor'
    mocks.from.mockImplementation((table: string) => {
      const result = table === 'profiles'
        ? { data: { role: mocks.role }, error: null }
        : { data: table === 'market_sections' ? mocks.sections
          : table === 'market_auction_files' ? mocks.files
          : table === 'market_auction_file_links' ? mocks.links
          : table === 'market_auction_sessions' ? mocks.sessions : mocks.items, error: null }
      let operation = ''
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        maybeSingle: vi.fn().mockResolvedValue(result),
        single: vi.fn().mockResolvedValue({ data: { id: 'new-item' }, error: null }),
        insert: vi.fn((values: unknown) => { mocks.writes.push({ table, operation: 'insert', values }); return chain }),
        update: vi.fn((values: unknown) => { mocks.writes.push({ table, operation: 'update', values }); return chain }),
        upsert: vi.fn((values: unknown) => { operation = 'upsert'; mocks.writes.push({ table, operation, values }); return chain }),
        delete: vi.fn(() => { mocks.writes.push({ table, operation: 'delete', values: null }); return chain }),
        in: vi.fn(() => chain),
        then: (resolve: (value: typeof result | { data: null; error: { message: string } }) => unknown) => Promise.resolve(
          table === 'market_auction_sessions' && operation === 'upsert' && mocks.sessionWriteError
            ? { data: null, error: mocks.sessionWriteError }
            : result
        ).then(resolve),
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

  it('lists only upcoming fairs in the Fairs calendar', async () => {
    mocks.sections.push(section('past-fair', 'Past fair', 'Foire', '2000-01-01'))
    await renderPage()

    const fairsButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Fairs calendar')!
    await act(async () => fairsButton.click())

    const table = container.querySelector('table[aria-label="Fairs calendar"]')!
    expect(table).not.toBeNull()
    expect(table.textContent).toContain('Fair section')
    expect(table.textContent).not.toContain('Fair resource')
    expect(table.textContent).not.toContain('Auction section')
    expect(table.textContent).not.toContain('Past fair')
  })

  it('hides past sections until the Past heading is expanded', async () => {
    mocks.sections.push(section('past-sec', 'Past section', 'Foire', '2000-01-01'))
    await renderPage()

    const sectionTitles = () =>
      [...container.querySelectorAll('h2')].map((heading) => heading.textContent)

    expect(sectionTitles()).not.toContain('Past section')

    const showPastButton = container.querySelector<HTMLButtonElement>('button[aria-label="Show past sections"]')!
    await act(async () => showPastButton.click())
    expect(sectionTitles()).toContain('Past section')

    const hidePastButton = container.querySelector<HTMLButtonElement>('button[aria-label="Hide past sections"]')!
    await act(async () => hidePastButton.click())
    expect(sectionTitles()).not.toContain('Past section')
  })

  it('shows one calendar row per sale time with its lot/page note', async () => {
    mocks.items = [
      { ...item('auction-item', 'auction', 'Auction lot'), lot_info: 'Lot 25, p. 48' },
    ]
    mocks.sessions = [
      { id: 'sess-1', item_id: 'auction-item', session_datetime: '2099-12-02T10:00:00', lot_info: 'Lot 7, p. 12' },
    ]
    await renderPage()

    const calendarButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Auction calendar')!
    await act(async () => calendarButton.click())

    const table = container.querySelector('table[aria-label="Auction calendar"]')!
    const rows = [...table.querySelectorAll('tbody tr')].filter((row) => row.querySelector('td'))
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('Lot 25, p. 48')
    expect(rows[1].textContent).toContain('Lot 7, p. 12')
    expect(rows[0].textContent).not.toContain('Lot / page:')
    expect(rows[1].textContent).not.toContain('Lot / page:')
    expect(rows[1].textContent).toContain('Auction lot')
    // Catalogue/Paddle controls stay on the sale's first row only.
    expect(table.querySelectorAll('[aria-label^="Catalogue status for"]')).toHaveLength(1)
  })

  it('creates additional sale times on the main sale date and requires complete times', async () => {
    await renderPage()
    const addTime = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Add sale time'))!
    await act(async () => addTime.click())
    expect(container.querySelector('[aria-label="Additional sale date 1"]')).toBeNull()
    const extraTime = container.querySelector<HTMLInputElement>('[aria-label="Additional sale time 1"]')!
    const extraLot = container.querySelector<HTMLInputElement>('[aria-label="Lot / page for additional sale time 1"]')!
    expect(extraLot.placeholder).toContain('first and last lot numbers and the total number of lots')
    await setInputValue(container.querySelector<HTMLInputElement>('#item-auction-date')!, '2099-12-01')
    await setInputValue(container.querySelector<HTMLInputElement>('#item-auction-time')!, '10:00')
    await setInputValue(container.querySelector<HTMLInputElement>('#item-lot-info')!, 'Lots 1–40, total 40')
    await setInputValue(container.querySelector<HTMLInputElement>('#item-label')!, 'Test sale')
    await setInputValue(container.querySelector<HTMLInputElement>('#item-url')!, 'https://example.com')
    const form = extraTime.closest('form')!
    await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(container.textContent).toContain('Enter a time for each additional sale time.')
    expect(mocks.writes).toHaveLength(0)
    await setInputValue(extraTime, '15:30')
    await setInputValue(extraLot, 'Lots 41–70, total 30')
    await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(mocks.writes.find((write) => write.table === 'market_auction_sessions')?.values).toEqual([
      { item_id: 'new-item', session_datetime: '2099-12-01T15:30:00', lot_info: 'Lots 41–70, total 30' },
    ])
  })

  it('shows house and city before the sale and an Outlook link for each time', async () => {
    mocks.items = [{ ...item('auction-item', 'auction', 'Auction lot'), auction_house: "Christie's", auction_city: 'Paris', lot_info: 'Lots 1–40' }]
    mocks.sessions = [{ id: 'sess-1', item_id: 'auction-item', session_datetime: '2099-12-01T15:30:00', lot_info: 'Lots 41–70' }]
    await renderPage()
    await act(async () => container.querySelectorAll<HTMLButtonElement>('button[aria-label="Déplier la section"]').forEach(button => button.click()))
    const title = [...container.querySelectorAll('a')].find((link) => link.textContent === 'Auction lot')!
    expect([...title.parentElement!.children].map((element) => element.textContent)).toEqual(["Christie's", 'Paris:', 'Auction lot'])
    const links = [...container.querySelectorAll<HTMLAnchorElement>('a[aria-label^="Create an Outlook meeting for Auction lot at"]')]
    expect(links).toHaveLength(2)
    expect(links.map((link) => new URL(link.href).searchParams.get('startdt'))).toEqual([
      '2099-12-01T11:00:00.000Z', '2099-12-01T14:30:00.000Z',
    ])
    expect(links[0].parentElement?.textContent).toContain('12:00')
    expect(links[1].parentElement?.textContent).toContain('15:30')
    expect(links[0].parentElement?.style.flexBasis).toBe('100%')
    expect(links[1].parentElement?.style.flexBasis).toBe('100%')
    expect(links[0].parentElement?.textContent).toContain('Lots 1–40')
    expect(links[1].parentElement?.textContent).toContain('Lots 41–70')
    expect(links[0].parentElement?.textContent).not.toContain('Lot / page:')
    expect(links[1].parentElement?.textContent).not.toContain('Lot / page:')
    expect(title.parentElement!.parentElement!.textContent!.match(/Paris/g)).toHaveLength(1)
  })

  it('does not add a city separator when the city is missing', async () => {
    mocks.items = [{ ...item('auction-item', 'auction', 'Auction lot'), auction_house: "Christie's", auction_city: null }]
    await renderPage()
    await act(async () => container.querySelectorAll<HTMLButtonElement>('button[aria-label="Déplier la section"]').forEach(button => button.click()))
    const title = [...container.querySelectorAll('a')].find((link) => link.textContent === 'Auction lot')!
    expect([...title.parentElement!.children].map((element) => element.textContent)).toEqual(["Christie's", 'Auction lot'])
  })

  it('moves same-day times with the sale date while preserving older different-day times', async () => {
    mocks.sessions = [
      { id: 'same-day', item_id: 'auction-item', session_datetime: '2099-12-01T15:00:00', lot_info: null },
      { id: 'legacy', item_id: 'auction-item', session_datetime: '2099-12-02T10:00:00', lot_info: 'Old lots' },
    ]
    await renderPage()
    await act(async () => container.querySelectorAll<HTMLButtonElement>('button[aria-label="Déplier la section"]').forEach(button => button.click()))
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Edit Auction lot"]')!.click())
    expect(container.textContent).toContain('Previously saved sale times on a different date keep their original date.')
    const dateLabel = [...container.querySelectorAll('label')].find((label) => label.textContent === 'Date de vente')!
    await setInputValue(dateLabel.parentElement!.querySelector('input')!, '2099-12-03')
    const saveButton = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Enregistrer')!
    await act(async () => saveButton.click())
    expect(mocks.writes.find((write) => write.table === 'market_auction_sessions' && write.operation === 'upsert')?.values).toEqual([
      { id: 'same-day', item_id: 'auction-item', session_datetime: '2099-12-03T15:00:00', lot_info: null },
      { id: 'legacy', item_id: 'auction-item', session_datetime: '2099-12-02T10:00:00', lot_info: 'Old lots' },
    ])
    expect(mocks.writes.some((write) => write.table === 'market_auction_sessions' && write.operation === 'delete')).toBe(false)
  })

  it('does not delete existing times when saving additional times fails', async () => {
    mocks.sessions = [
      { id: 'keep', item_id: 'auction-item', session_datetime: '2099-12-01T15:00:00', lot_info: null },
      { id: 'remove', item_id: 'auction-item', session_datetime: '2099-12-01T16:00:00', lot_info: null },
    ]
    mocks.sessionWriteError = { message: 'Save failed' }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await renderPage()
    await act(async () => container.querySelectorAll<HTMLButtonElement>('button[aria-label="Déplier la section"]').forEach(button => button.click()))
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Edit Auction lot"]')!.click())
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Remove additional sale time 2"]')!.click())
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Enregistrer')!.click())
    expect(container.textContent).toContain('additional sale times could not be saved: Save failed')
    expect(mocks.writes.some((write) => write.table === 'market_auction_sessions' && write.operation === 'delete')).toBe(false)
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
    expect(container.querySelector('a[href="/api/market/auction-files/cat"]')?.textContent).toBe('Catalogue PDF')
    expect(container.querySelector('a[href="/api/market/auction-files/result"]')?.textContent).toBe('Result PDF')
    // Items that already have a file no longer offer an Upload control.
    expect(container.querySelector('[aria-label="Upload Catalogue PDF for Auction lot"]')).toBeNull()
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

  it('hides the Upload control when a catalogue exists and lets viewers open files without editing', async () => {
    mocks.items.push(item('auction-item-2', 'auction', 'Second lot'))
    mocks.files = [{ id: 'cat', section_id: 'auction', kind: 'catalogue', file_name: 'sale.pdf' }]
    mocks.links = ['auction-item', 'auction-item-2'].map(itemId => ({
      item_id: itemId, section_id: 'auction', kind: 'catalogue', file_id: 'cat',
    }))
    await renderPage()
    await act(async () => container.querySelectorAll<HTMLButtonElement>('button[aria-label="Déplier la section"]').forEach(button => button.click()))
    expect(container.querySelector('[aria-label="Upload Catalogue PDF for Auction lot"]')).toBeNull()
    expect(container.querySelector('[aria-label="Upload Catalogue PDF for Second lot"]')).toBeNull()
    expect(container.querySelector('[aria-label="Upload Result PDF for Auction lot"]')).not.toBeNull()

    await act(async () => root.unmount())
    root = createRoot(container)
    mocks.role = 'Viewer'
    await renderPage()
    await act(async () => container.querySelectorAll<HTMLButtonElement>('button[aria-label="Déplier la section"]').forEach(button => button.click()))
    expect(container.querySelector('a[href="/api/market/auction-files/cat"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Upload Result PDF for Auction lot"]')).toBeNull()
  })
})
