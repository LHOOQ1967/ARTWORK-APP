const invalidators = new Set<() => void>()
const listeners = new Set<() => void>()
let revision = 0

export function invalidateTemporaryCaches() {
  revision++
  for (const clear of invalidators) clear()
  for (const listener of listeners) listener()
}

export function temporaryCacheRevision() {
  return revision
}

export function subscribeTemporaryCache(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function createTemporaryCache<T>(ttlMs: number, maxEntries = 20) {
  const entries = new Map<string, { value: T; expires: number }>()
  invalidators.add(() => entries.clear())
  return {
    read(key: string): T | undefined {
      const entry = entries.get(key)
      if (!entry) return undefined
      if (entry.expires <= Date.now()) {
        entries.delete(key)
        return undefined
      }
      return entry.value
    },
    write(key: string, value: T, startedAtRevision: number) {
      // A request started before a mutation or session change must not refill the cache.
      if (revision !== startedAtRevision) return
      entries.delete(key)
      entries.set(key, { value, expires: Date.now() + ttlMs })
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next()
        if (!oldest.done) entries.delete(oldest.value)
      }
    },
    remove(key: string) { entries.delete(key) },
  }
}

export function observeMutationFetch(
  fetcher: typeof fetch,
  appOrigin: string,
  supabaseOrigin: string,
): typeof fetch {
  return async (input, init) => {
    const request = typeof Request !== 'undefined' && input instanceof Request ? input : null
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
    const response = await fetcher(input, init)
    if (response.ok && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const url = new URL(request?.url ?? String(input), appOrigin)
      const readOnlyRpc = url.origin === supabaseOrigin &&
        ['/rest/v1/rpc/artwork_comment_clients', '/rest/v1/rpc/artwork_list_page'].includes(url.pathname)
      if ((url.origin === appOrigin && url.pathname.startsWith('/api/')) ||
        (url.origin === supabaseOrigin && !readOnlyRpc && (
          url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/storage/v1/')
        ))) {
        invalidateTemporaryCaches()
      }
    }
    return response
  }
}
