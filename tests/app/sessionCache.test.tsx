// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '@/contexts/SessionContext'
import { createTemporaryCache, temporaryCacheRevision } from '@/lib/temporaryCache'

const mocks = vi.hoisted(() => ({
  authChange: (_event: string, _session: null) => {},
  unsubscribe: vi.fn(),
}))
vi.mock('@/lib/supabaseBrowser', () => ({
  supabase: { auth: {
    getSession: async () => ({ data: { session: null } }),
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
})
