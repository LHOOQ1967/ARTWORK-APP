// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GenevaFreeportPage from '@/app/(protected)/inventory/geneva-freeport/page'
import { freeportDraft, type FreeportRow } from '@/lib/genevaFreeport'

const mocks = vi.hoisted(() => ({
  fetchWithAuth: vi.fn(), matchesClient: vi.fn(), buildFreeportWorkbook: vi.fn(),
  writeFile: vi.fn(), replace: vi.fn(), role: 'Editor',
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('@/contexts/SessionContext', () => ({ useSessionProfile: () => ({ role: mocks.role }) }))
vi.mock('@/contexts/ClientFilterContext', () => ({
  useClientFilter: () => ({ matchesClient: mocks.matchesClient }),
}))
vi.mock('@/lib/fetchWithAuth', () => ({ fetchWithAuth: mocks.fetchWithAuth }))
vi.mock('@/lib/genevaFreeportExcel', () => ({ buildFreeportWorkbook: mocks.buildFreeportWorkbook }))
vi.mock('xlsx-js-style', () => ({ writeFile: mocks.writeFile }))

function artwork(id: string, title: string, insured: number): FreeportRow {
  const row: FreeportRow = {
    id, title, year_execution: 2026, year_execution_start: null, medium: null,
    height_cm: null, width_cm: null, depth_cm: null, signature: null, edition: null,
    artist: null, inventory: null, documents: [],
  }
  row.inventory = { ...freeportDraft(row).inventory, artwork_id: id, insured_value_usd: insured }
  return row
}
const rows = [artwork('bought', 'Bought artwork', 100), artwork('proposed', 'Proposed artwork', 200), artwork('other', 'Other artwork', 400)]
let container: HTMLDivElement
let root: Root

async function render() {
  await act(async () => root.render(<GenevaFreeportPage />))
}
async function clickButton(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(element => element.textContent === label)
  if (!button) throw new Error(`Missing button: ${label}`)
  await act(async () => button.click())
}
async function search(value: string) {
  const input = container.querySelector('input')
  if (!input) throw new Error('Missing search input')
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function visibleTitles() {
  return Array.from(container.querySelectorAll<HTMLTableRowElement>('tbody tr')).map(row => row.cells[3].textContent)
}

describe('Geneva Freeport client filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
    mocks.role = 'Editor'
    mocks.matchesClient.mockImplementation(() => true)
    mocks.fetchWithAuth.mockResolvedValue(Response.json({ artworks: rows }))
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('keeps all accessible Freeport artworks when no client is selected', async () => {
    await render()
    expect(visibleTitles()).toHaveLength(3)
    expect(container.textContent).toContain('3 artworks')
    expect(container.querySelector('tfoot')?.textContent).toContain('USD 700')
  })

  it('restricts the table, count, total and export to bought or proposed client artworks', async () => {
    mocks.matchesClient.mockImplementation(id => id === 'bought' || id === 'proposed')
    await render()
    expect(visibleTitles().join(' ')).toContain('Bought artwork')
    expect(visibleTitles().join(' ')).toContain('Proposed artwork')
    expect(visibleTitles().join(' ')).not.toContain('Other artwork')
    expect(container.textContent).toContain('2 artworks')
    expect(container.querySelector('tfoot')?.textContent).toContain('USD 300')
    await clickButton('Export Excel')
    expect(mocks.buildFreeportWorkbook.mock.calls[0][0].map((row: FreeportRow) => row.id).sort()).toEqual(['bought', 'proposed'])
    expect(mocks.writeFile).toHaveBeenCalled()
  })

  it('updates on client changes, hides an excluded editor and restores all rows when cleared', async () => {
    await render()
    await clickButton('Edit Inventory')
    expect(container.querySelector('form')).not.toBeNull()
    mocks.matchesClient = vi.fn(id => id === 'other')
    await render()
    expect(visibleTitles()).toHaveLength(1)
    expect(visibleTitles()[0]).toContain('Other artwork')
    expect(container.querySelector('form')).toBeNull()
    mocks.matchesClient = vi.fn(() => true)
    await render()
    expect(visibleTitles()).toHaveLength(3)
  })

  it('combines client filtering with inventory search and exports only matching rows', async () => {
    mocks.matchesClient.mockImplementation(id => id === 'bought' || id === 'proposed')
    await render()
    await search('proposed')
    expect(visibleTitles()).toHaveLength(1)
    expect(container.querySelector('tfoot')?.textContent).toContain('USD 200')
    await clickButton('Export Excel')
    expect(mocks.buildFreeportWorkbook.mock.calls[0][0].map((row: FreeportRow) => row.id)).toEqual(['proposed'])
    await search('other')
    expect(visibleTitles()).toHaveLength(0)
    expect(container.textContent).toContain('0 artworks')
  })

  it('shows no rows or exportable data for a client with no matching artworks', async () => {
    mocks.matchesClient.mockImplementation(() => false)
    await render()
    expect(visibleTitles()).toHaveLength(0)
    expect(container.querySelector('tfoot')?.textContent).toContain('USD 0')
    const button = Array.from(container.querySelectorAll('button')).find(element => element.textContent === 'Export Excel')
    expect(button?.disabled).toBe(true)
  })

  it('preserves read-only viewer access when the global client filter is inactive', async () => {
    mocks.role = 'Viewer'
    await render()
    expect(visibleTitles()).toHaveLength(3)
    expect(container.textContent).toContain('Read only')
    expect(container.textContent).not.toContain('Save inventory')
  })
})
