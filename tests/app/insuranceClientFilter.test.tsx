import { beforeEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import InsurancePage from '@/app/(protected)/insurance/page'

const mocks = vi.hoisted(() => ({ allClients: true }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/contexts/SessionContext', () => ({
  useSessionProfile: () => ({ role: 'Viewer', hasAllClientsAccess: mocks.allClients }),
}))
vi.mock('@/contexts/ClientFilterContext', () => ({
  useClientFilter: () => ({
    canSelectClient: mocks.allClients,
    clients: [{ id: 'second-client', label: 'Second client' }],
    selectedClient: { id: 'second-client', label: 'Second client' },
    selectedClientId: 'second-client',
    setSelectedClientId: vi.fn(),
  }),
}))
vi.mock('@/lib/supabaseBrowser', () => ({ supabase: {} }))

beforeEach(() => { mocks.allClients = true })

it('uses the header selection for a global Viewer without enabling insurance policy editing', () => {
  const html = renderToStaticMarkup(<InsurancePage />)
  expect(html).toContain('<option value="second-client" selected="">Second client</option>')
  expect(html).toContain('Insurance policy — Second client')
  expect(html).not.toContain('Save policy')
  expect(html).toMatch(/type="number"[^>]*disabled=""/)
  expect(html).toMatch(/type="date"[^>]*disabled=""/)
})

it('does not use a global selection for a single-client Viewer', () => {
  mocks.allClients = false
  const html = renderToStaticMarkup(<InsurancePage />)
  expect(html).not.toContain('Second client')
  expect(html).toContain('Select a client to view their insurance list.')
})
