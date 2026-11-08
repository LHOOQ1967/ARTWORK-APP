// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CategoryFactsheetsPage from '@/app/(protected)/artworks/print/category/page'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), fetchRows: vi.fn(),
  query: 'category=market&status=Active&search=bronze',
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mocks.query) }))
vi.mock('@/contexts/SessionContext', () => ({
  useSessionProfile: () => ({ user: { id: 'editor' }, role: 'Editor' }),
}))
vi.mock('@/contexts/ClientFilterContext', () => ({
  useClientFilter: () => ({ selectedClientId: 'client' }),
}))
vi.mock('@/lib/supabaseBrowser', () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
}))
vi.mock('@/components/artwork/ArtworkSheet', () => ({
  default: ({ artwork }: { artwork: { id: string } }) => <article>{artwork.id}</article>,
}))

let root: Root
let container: HTMLDivElement
const rows = Array.from({ length: 21 }, (_, index) => ({ id: `work-${index}` }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mocks.rpc.mockResolvedValue({ data: rows.map(row => row.id), error: null })
  mocks.fetchRows.mockImplementation(async (_key, ids: string[]) => ({
    data: ids.map(id => ({ id })).reverse(), error: null,
  }))
  mocks.from.mockReturnValue({ select: () => ({ in: mocks.fetchRows }) })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('category factsheets page', () => {
  it('renders all sheets in list order, including unloaded pages, and preserves scope', async () => {
    await act(async () => root.render(<CategoryFactsheetsPage />))
    expect(container.querySelectorAll('article')).toHaveLength(21)
    expect([...container.querySelectorAll('article')].map(node => node.textContent)).toEqual(rows.map(row => row.id))
    expect(mocks.rpc).toHaveBeenCalledWith('artwork_category_ids', expect.objectContaining({
      p_category: 'market',
      p_filters: { status: 'Active', search: 'bronze', client: 'client' },
    }))
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.from).toHaveBeenCalledWith('artworks_full_admin')
    expect(mocks.fetchRows).toHaveBeenCalledTimes(2)
  })

  it('surfaces full-sheet read failures instead of displaying partial results', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.fetchRows.mockResolvedValue({ data: null, error: { message: 'Access denied' } })
    try {
      await act(async () => root.render(<CategoryFactsheetsPage />))
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('Access denied')
      expect(container.querySelectorAll('article')).toHaveLength(0)
    } finally {
      log.mockRestore()
    }
  })
})
