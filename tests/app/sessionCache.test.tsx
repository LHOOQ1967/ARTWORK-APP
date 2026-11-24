// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider, useSessionProfile } from '@/contexts/SessionContext'
import type { Session } from '@supabase/supabase-js'
import { createTemporaryCache, temporaryCacheRevision } from '@/lib/temporaryCache'

const mocks = vi.hoisted(() => ({
  authChange: (_event: string, _session: Session | null) => {},
  unsubscribe: vi.fn(),
  getSession: vi.fn(),
  from: vi.fn(),
}))
vi.mock('@/lib/supabaseBrowser', () => ({
  supabase: { from: mocks.from, auth: {
    getSession: mocks.getSession,
    onAuthStateChange: (callback: typeof mocks.authChange) => {
      mocks.authChange = callback
      return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }
    },
  } },
}))

let root: Root
let container: HTMLDivElement
let originalFetch: typeof fetch

describe('session cache lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSession.mockResolvedValue({ data: { session: null } })
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.test')
    originalFetch = window.fetch
    window.fetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }))
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    window.fetch = originalFetch
    container.remove()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it.each(['SIGNED_OUT', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'])('clears cached data on %s', async event => {
    const cache = createTemporaryCache<string>(60_000)
    await act(async () => root.render(<SessionProvider><div>Content</div></SessionProvider>))
    cache.write('key', 'private data', temporaryCacheRevision())
    expect(cache.read('key')).toBe('private data')
    await act(async () => mocks.authChange(event, null))
    expect(cache.read('key')).toBeUndefined()
  })

  it('observes API mutations and restores fetch and clears memory on unmount', async () => {
    const cache = createTemporaryCache<string>(60_000)
    const fetchBeforeMount = window.fetch
    await act(async () => root.render(<SessionProvider><div>Content</div></SessionProvider>))
    cache.write('key', 'private data', temporaryCacheRevision())
    await window.fetch('/api/artworks/work', { method: 'PATCH' })
    expect(cache.read('key')).toBeUndefined()
    cache.write('key', 'new data', temporaryCacheRevision())
    await act(async () => root.render(null))
    expect(cache.read('key')).toBeUndefined()
    expect(window.fetch).toBe(fetchBeforeMount)
    expect(mocks.unsubscribe).toHaveBeenCalled()
  })

  it.each([true, false])('loads the signed-in Viewer all-client grant (%s)', async granted => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: viewerSession } })
    mocks.from.mockImplementation(() => ({
      update: () => ({ eq: async () => ({ error: null }) }),
      select: () => ({ eq: () => ({
        single: async () => ({ data: { role: 'Viewer' }, error: null }),
        maybeSingle: async () => ({ data: granted ? { user_id: 'viewer' } : null, error: null }),
      }) }),
    }))
    await act(async () => root.render(<SessionProvider><Access /></SessionProvider>))
    expect(container.textContent).toBe(`Viewer:${granted}`)
    expect(mocks.from).toHaveBeenCalledWith('viewer_all_clients')
  })

  it('does not restore a pending all-client grant after signing out', async () => {
    let resolveGrant!: (value: { data: { user_id: string }; error: null }) => void
    const grant = new Promise<{ data: { user_id: string }; error: null }>(resolve => { resolveGrant = resolve })
    mocks.getSession.mockResolvedValueOnce({ data: { session: viewerSession } })
    mocks.from.mockReturnValue({
      update: () => ({ eq: async () => ({ error: null }) }),
      select: () => ({ eq: () => ({
        single: async () => ({ data: { role: 'Viewer' }, error: null }),
        maybeSingle: () => grant,
      }) }),
    })
    await act(async () => root.render(<SessionProvider><Access /></SessionProvider>))
    await act(async () => mocks.authChange('SIGNED_OUT', null))
    await act(async () => resolveGrant({ data: { user_id: 'viewer' }, error: null }))
    expect(container.textContent).toBe('undefined:false')
  })

  it('reports a grant lookup failure without enabling client visibility', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.getSession.mockResolvedValueOnce({ data: { session: viewerSession } })
    mocks.from.mockReturnValue({
      update: () => ({ eq: async () => ({ error: null }) }),
      select: () => ({ eq: () => ({
        single: async () => ({ data: { role: 'Viewer' }, error: null }),
        maybeSingle: async () => ({ data: null, error: { message: 'Unavailable' } }),
      }) }),
    })
    try {
      await act(async () => root.render(<SessionProvider><Access /></SessionProvider>))
      expect(container.textContent).toBe('Viewer:false')
      expect(log).toHaveBeenCalledWith(expect.stringContaining('all-client access'), { message: 'Unavailable' })
    } finally { log.mockRestore() }
  })
})

const viewerSession: Session = {
  access_token: 'test-token', refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer',
  user: { id: 'viewer', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' },
}

function Access() {
  const { role, hasAllClientsAccess } = useSessionProfile()
  return <div>{String(role)}:{String(hasAllClientsAccess)}</div>
}
