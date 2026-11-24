// @vitest-environment jsdom
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ClientFilterProvider, useClientFilter } from '@/contexts/ClientFilterContext'

const mocks = vi.hoisted(() => ({
  session: { role: 'Viewer', user: { id: 'viewer' }, loading: false, hasAllClientsAccess: true },
  from: vi.fn(),
}))
vi.mock('@/contexts/SessionContext', () => ({ useSessionProfile: () => mocks.session }))
vi.mock('@/lib/supabaseBrowser', () => ({ supabase: { from: mocks.from } }))
vi.mock('next/navigation', () => ({ usePathname: () => '/artworks' }))

let root: Root
let container: HTMLDivElement
let filter: ReturnType<typeof useClientFilter>
function Probe() {
  const value = useClientFilter()
  useEffect(() => { filter = value }, [value])
  return <div>{value.canSelectClient ? value.clients.map(client => client.label).join(',') : 'No selector'}</div>
}
async function render() {
  await act(async () => root.render(<ClientFilterProvider><Probe /></ClientFilterProvider>))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  mocks.session = { role: 'Viewer', user: { id: 'viewer' }, loading: false, hasAllClientsAccess: true }
  mocks.from.mockImplementation((table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      range: async (start: number) => ({
        data: table === 'contacts'
          ? [{ id: 'client-a', company_name: 'Client A' }, { id: 'client-b', company_name: 'Client B' }]
          : table === 'artworks' ? start === 0 ? [{ id: 'buyer-only' }] : []
          : start === 0 ? Array.from({ length: 200 }, (_, i) => ({ artwork_id: `work-${i}` }))
          : [{ artwork_id: 'last-work' }],
        error: null,
      }),
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
  vi.unstubAllGlobals()
})

it('lets a global Viewer filter all pages by proposals and purchases, including later pages', async () => {
  await render()
  expect(container.textContent).toBe('Client A,Client B')
  expect(filter.canSelectClient).toBe(true)
  await act(async () => filter.setSelectedClientId('client-b'))
  expect(filter.selectedClient?.label).toBe('Client B')
  expect(filter.matchesClient('last-work')).toBe(true)
  expect(filter.matchesClient('buyer-only')).toBe(true)
  expect(filter.matchesClient('other')).toBe(false)
  await act(async () => filter.setSelectedClientId(null))
  expect(filter.matchesClient('other')).toBe(true)
})

it('hides the selector and ignores a stored filter for a single-client Viewer', async () => {
  mocks.session.hasAllClientsAccess = false
  localStorage.setItem('artmuse_selected_client', 'client-b')
  await render()
  expect(container.textContent).toBe('No selector')
  expect(filter.selectedClientId).toBeNull()
  expect(filter.matchesClient('other')).toBe(true)
  expect(mocks.from).not.toHaveBeenCalled()
})

it('loads clients beyond the first response page', async () => {
  const range = vi.fn(async (start: number) => ({
    data: start === 0
      ? Array.from({ length: 200 }, (_, i) => ({ id: `client-${i}`, company_name: `Client ${i}` }))
      : [{ id: 'last-client', company_name: 'Last client' }],
    error: null,
  }))
  const chain = { select: () => chain, eq: () => chain, order: () => chain, range }
  mocks.from.mockReturnValue(chain)
  await render()
  expect(filter.clients).toHaveLength(201)
  expect(filter.clients.some(client => client.id === 'last-client')).toBe(true)
  expect(range).toHaveBeenNthCalledWith(2, 200, 399)
})

it.each(['viewer', 'other'])('clears clients and filtering when access is removed or the account changes (%s)', async userId => {
  await render()
  await act(async () => filter.setSelectedClientId('client-a'))
  mocks.session = { role: 'Viewer', user: { id: userId }, loading: false, hasAllClientsAccess: false }
  await render()
  expect(filter.clients).toEqual([])
  expect(filter.canSelectClient).toBe(false)
  expect(filter.selectedClientId).toBeNull()
})
