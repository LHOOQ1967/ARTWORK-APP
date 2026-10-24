// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CertificateLocationsPage from '@/app/(protected)/inventory/certificates/page'
import type { CertificateLocationRow } from '@/lib/certificateLocations'

const mocks = vi.hoisted(() => ({ role: 'Editor', matchesClient: vi.fn(), fetchWithAuth: vi.fn(), from: vi.fn() }))
vi.mock('@/contexts/SessionContext', () => ({ useSessionProfile: () => ({ role: mocks.role }) }))
vi.mock('@/contexts/ClientFilterContext', () => ({ useClientFilter: () => ({ matchesClient: mocks.matchesClient }) }))
vi.mock('@/lib/fetchWithAuth', () => ({ fetchWithAuth: mocks.fetchWithAuth }))
vi.mock('@/lib/supabaseBrowser', () => ({ supabase: { from: mocks.from } }))
const rows: CertificateLocationRow[] = [
  {
    id: 'a', title: 'Blue painting', year_execution: 2026, year_execution_start: 2024,
    image_url: 'https://example.com/storage/v1/object/public/artwork-images/blue.jpg',
    artist: { first_name: 'Jane', last_name: 'Smith' },
    certificate_contact: { company_name: 'Office', first_name: null, last_name: null },
    certificate_address: { id: 'addr', contact_id: 'contact', label: 'Safe', address: '1 Main Street', postal_code: '1200', city: 'Geneva', country: 'Switzerland' },
  },
  {
    id: 'b', title: 'Red sculpture', year_execution: null, year_execution_start: null,
    artist: null, certificate_contact: null, certificate_address: null,
  },
]
let container: HTMLDivElement
let root: Root
async function render() { await act(async () => root.render(<CertificateLocationsPage />)) }
async function search(value: string) {
  const input = container.querySelector('input')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function visibleRows() { return container.querySelectorAll('tbody tr') }

describe('certificate locations page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    mocks.role = 'Editor'
    const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() }
    for (const key of ['select', 'eq', 'order'] as const) chain[key].mockReturnValue(chain)
    mocks.from.mockImplementation(table => {
      chain.range.mockResolvedValue({ data: table === 'contacts'
        ? [{ id: 'contact', ...rows[0].certificate_contact }] : [rows[0].certificate_address], error: null })
      return chain
    })
    mocks.matchesClient.mockImplementation(() => true)
    mocks.fetchWithAuth.mockImplementation(async () => Response.json({ artworks: rows }))
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
  it('shows artist, artwork, year, contact, address, history and artwork links', async () => {
    await render()
    expect(visibleRows()).toHaveLength(2)
    for (const value of ['Jane Smith', 'Blue painting', '2024/2026', 'Office', 'Safe, 1 Main Street, 1200 Geneva, Switzerland', 'Not specified', '2 artworks']) {
      expect(container.textContent).toContain(value)
    }
    expect(container.querySelector('a[href="/artworks/print/a"]')?.textContent).toBe('Blue painting')
    expect(container.querySelector('a[href="/artworks/a/edit"]')).toBeNull()
    expect(container.textContent).not.toContain('Edit certificate location')
    expect(container.querySelectorAll('[aria-label="Certificate contact"]')).toHaveLength(2)
    expect(container.querySelector('img')?.getAttribute('src')).toContain('/api/artwork-images?url=')
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('Blue painting')
    expect(container.textContent).toContain('No image')
    expect(Array.from(container.querySelectorAll('th')).map(th => th.textContent)).not.toContain('Actions')
    expect(container.querySelectorAll('[aria-label="View certificate location history"]')).toHaveLength(2)
  })
  it.each(['jane', 'blue', 'office', 'geneva', 'safe', '2024/2026'])('searches displayed artwork/location fields: %s', async value => {
    await render()
    await search(value)
    expect(visibleRows()).toHaveLength(1)
    expect(visibleRows()[0].textContent).toContain('Blue painting')
  })
  it('combines search with the global client selection and reacts when it changes', async () => {
    mocks.matchesClient.mockImplementation(id => id === 'a')
    await render()
    expect(visibleRows()).toHaveLength(1)
    await search('red')
    expect(visibleRows()).toHaveLength(0)
    expect(container.textContent).toContain('No certificate locations match')
    await search('')
    mocks.matchesClient = vi.fn(id => id === 'b')
    await render()
    expect(visibleRows()).toHaveLength(1)
    expect(visibleRows()[0].textContent).toContain('Red sculpture')
    mocks.matchesClient = vi.fn(() => true)
    await render()
    expect(visibleRows()).toHaveLength(2)
  })
  it('allows Viewer reads and factsheets without edit links', async () => {
    mocks.role = 'Viewer'
    await render()
    expect(visibleRows()).toHaveLength(2)
    expect(container.textContent).not.toContain('Edit artwork')
    expect(container.textContent).not.toContain('Edit certificate location')
    expect(container.querySelector('a[href="/artworks/print/a"]')).not.toBeNull()
  })
  it.each(['Editor', 'Administrator'])('updates the visible location after an inline save by %s', async role => {
    mocks.role = role
    const newContact = { id: 'new-contact', company_name: 'New certificate office', first_name: null, last_name: null }
    const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() }
    for (const key of ['select', 'eq', 'order'] as const) chain[key].mockReturnValue(chain)
    mocks.from.mockImplementation(table => {
      chain.range.mockResolvedValue({ data: table === 'contacts' ? [newContact] : [], error: null })
      return chain
    })
    await render()
    const artworkRow = Array.from(visibleRows()).find(item => item.textContent?.includes('Blue painting'))!
    const contactSelect = artworkRow.querySelector<HTMLSelectElement>('[aria-label="Certificate contact"]')!
    await act(async () => {
      contactSelect.value = 'new-contact'
      contactSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })
    mocks.fetchWithAuth.mockResolvedValueOnce(Response.json({
      id: 'a', certificate: true,
      certificate_location_contact_id: 'new-contact', certificate_location_address_id: null,
    }))
    const saveButton = Array.from(artworkRow.querySelectorAll('button')).find(button => button.textContent === 'Save')!
    await act(async () => saveButton.click())
    expect(container.textContent).toContain('New certificate office')
    expect(container.textContent).not.toContain('Safe, 1 Main Street')
    await search('new certificate office')
    expect(visibleRows()).toHaveLength(1)
    expect(visibleRows()[0].textContent).toContain('Blue painting')
  })
  it('shows load errors and supports retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.fetchWithAuth.mockResolvedValueOnce(Response.json({ error: 'Unable to load certificate locations.' }, { status: 500 }))
    await render()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Unable to load')
    expect(visibleRows()).toHaveLength(0)
    await act(async () => container.querySelector('button')!.click())
    expect(visibleRows()).toHaveLength(2)
  })
  it('does not request data without a recognized role', async () => {
    mocks.role = ''
    await render()
    expect(mocks.fetchWithAuth).not.toHaveBeenCalled()
    expect(container.textContent).toBe('')
  })
  it.each(['Artist', 'Certificate contact'])('toggles sorting in both directions by %s', async label => {
    mocks.role = 'Viewer'
    await render()
    const button = container.querySelector<HTMLButtonElement>(`[aria-label="Sort by ${label}"]`)!
    if (label === 'Artist') await act(async () => button.click())
    expect(button.closest('th')?.getAttribute('aria-sort')).toBe('ascending')
    expect(visibleRows()[0].textContent).toContain('Red sculpture')
    await act(async () => button.click())
    expect(button.closest('th')?.getAttribute('aria-sort')).toBe('descending')
    expect(visibleRows()[0].textContent).toContain('Blue painting')
    await act(async () => button.click())
    expect(button.closest('th')?.getAttribute('aria-sort')).toBe('ascending')
    expect(visibleRows()[0].textContent).toContain('Red sculpture')
  })
  it('sorts artist and contact independently while preserving drafts and search', async () => {
    mocks.fetchWithAuth.mockResolvedValueOnce(Response.json({ artworks: [
      { ...rows[0], artist: { first_name: 'Zoe', last_name: 'Smith' },
        certificate_contact: { id: 'contact', company_name: 'Alpha', first_name: null, last_name: null } },
      { ...rows[1], artist: { first_name: 'Adam', last_name: 'Jones' },
        certificate_contact: { id: 'other', company_name: 'Zulu', first_name: null, last_name: null } },
    ] }))
    await render()
    expect(visibleRows()[0].textContent).toContain('Blue painting')
    const blue = Array.from(visibleRows()).find(row => row.textContent?.includes('Blue painting'))!
    const address = blue.querySelector<HTMLSelectElement>('[aria-label="Certificate address"]')!
    await act(async () => {
      address.value = ''
      address.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const artistSort = container.querySelector<HTMLButtonElement>('[aria-label="Sort by Artist"]')!
    await act(async () => artistSort.click())
    expect(visibleRows()[0].textContent).toContain('Red sculpture')
    expect(blue.querySelector<HTMLSelectElement>('[aria-label="Certificate address"]')?.value).toBe('')
    expect(blue.textContent).toContain('Save')
    const contactSort = container.querySelector<HTMLButtonElement>('[aria-label="Sort by Certificate contact"]')!
    await act(async () => contactSort.click())
    expect(visibleRows()[0].textContent).toContain('Blue painting')
    await search('blue')
    expect(visibleRows()).toHaveLength(1)
    expect(contactSort.closest('th')?.getAttribute('aria-sort')).toBe('ascending')
  })
})
