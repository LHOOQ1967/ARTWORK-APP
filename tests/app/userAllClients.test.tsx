// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import UsersPage from '@/app/(protected)/admin/users/page'

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabaseBrowser', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@/contexts/SessionContext', () => ({ useSessionProfile: () => ({ role: 'Administrator' }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => children }))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  let allClients = false
  mocks.from.mockImplementation((table: string) => {
    const data = table === 'profiles'
      ? [{ id: 'viewer', email: 'viewer@example.com', role: 'Viewer', is_active: true }]
      : table === 'contacts'
        ? [{ id: 'client', company_name: 'Client' }]
        : table === 'viewer_all_clients'
          ? allClients ? [{ user_id: 'viewer' }] : []
          : [{ user_id: 'viewer', contact_id: 'client', invited: true }]
    const chain = {
      select: () => chain,
      order: () => chain,
      range: () => Promise.resolve({ data, error: null }),
      then: (resolve: (value: { data: typeof data; error: null }) => void) => resolve({ data, error: null }),
    }
    return chain
  })
  mocks.rpc.mockImplementation(async (_name, args) => {
    allClients = args.p_all_clients
    return { error: null }
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

it('grants and revokes dynamic all-client access from the users list', async () => {
  await act(async () => root.render(<UsersPage />))
  const select = container.querySelectorAll('select')[1]
  expect(select.value).toBe('client')
  await act(async () => {
    select.value = '__all_clients__'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(mocks.rpc).toHaveBeenLastCalledWith('set_viewer_client_access', {
    p_user_id: 'viewer', p_all_clients: true, p_contact_id: null,
  })
  expect(container.querySelectorAll('select')[1].value).toBe('__all_clients__')
  await act(async () => {
    const access = container.querySelectorAll('select')[1]
    access.value = 'client'
    access.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(mocks.rpc).toHaveBeenLastCalledWith('set_viewer_client_access', {
    p_user_id: 'viewer', p_all_clients: false, p_contact_id: 'client',
  })
})
