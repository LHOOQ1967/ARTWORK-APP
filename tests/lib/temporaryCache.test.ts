import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTemporaryCache, invalidateTemporaryCaches, observeMutationFetch,
  subscribeTemporaryCache, temporaryCacheRevision,
} from '@/lib/temporaryCache'

describe('temporary session data cache', () => {
  beforeEach(() => invalidateTemporaryCaches())
  afterEach(() => vi.useRealTimers())

  it('expires at exactly sixty seconds and keeps keys independent', () => {
    vi.useFakeTimers()
    const cache = createTemporaryCache<string>(60_000)
    cache.write('user-a:active', 'A', temporaryCacheRevision())
    expect(cache.read('user-b:active')).toBeUndefined()
    vi.advanceTimersByTime(59_999)
    expect(cache.read('user-a:active')).toBe('A')
    vi.advanceTimersByTime(1)
    expect(cache.read('user-a:active')).toBeUndefined()
  })

  it('clears all namespaces and rejects writes from pre-invalidation requests', () => {
    const first = createTemporaryCache<string>(60_000)
    const second = createTemporaryCache<number>(60_000)
    const revision = temporaryCacheRevision()
    first.write('key', 'value', revision)
    second.write('key', 42, revision)
    const listener = vi.fn()
    const unsubscribe = subscribeTemporaryCache(listener)
    invalidateTemporaryCaches()
    first.write('key', 'stale', revision)
    expect(first.read('key')).toBeUndefined()
    expect(second.read('key')).toBeUndefined()
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    invalidateTemporaryCaches()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('bounds memory usage and supports explicit removal', () => {
    const cache = createTemporaryCache<string>(60_000, 2)
    for (const key of ['one', 'two', 'three']) cache.write(key, key, temporaryCacheRevision())
    expect(cache.read('one')).toBeUndefined()
    expect(cache.read('two')).toBe('two')
    cache.remove('two')
    expect(cache.read('two')).toBeUndefined()
  })
})

describe('mutation-driven cache invalidation', () => {
  it.each([
    ['https://artmuse.test/api/artworks/work', 'PATCH', 200, true],
    ['https://artmuse.test/api/artworks/work', 'DELETE', 204, true],
    ['https://db.test/rest/v1/documents', 'POST', 201, true],
    ['https://db.test/storage/v1/object/artwork-images/image', 'DELETE', 200, true],
    ['https://artmuse.test/api/artworks/work', 'GET', 200, false],
    ['https://artmuse.test/api/artworks/work', 'PATCH', 403, false],
    ['https://external.test/api/artworks/work', 'POST', 200, false],
    ['https://db.test/auth/v1/token', 'POST', 200, false],
    ['https://db.test/rest/v1/rpc/artwork_comment_clients', 'POST', 200, false],
    ['https://db.test/rest/v1/rpc/artwork_list_page', 'POST', 200, false],
    ['https://db.test/rest/v1/rpc/save_geneva_freeport_inventory', 'POST', 200, true],
  ])('observes %s %s (%s)', async (url, method, status, invalidates) => {
    const response = new Response(null, { status })
    const original = vi.fn<typeof fetch>().mockResolvedValue(response)
    const observed = observeMutationFetch(original, 'https://artmuse.test', 'https://db.test')
    const before = temporaryCacheRevision()
    expect(await observed(url, { method })).toBe(response)
    expect(temporaryCacheRevision() !== before).toBe(invalidates)
    expect(original).toHaveBeenCalledWith(url, { method })
  })

  it('supports relative URLs and Request method overrides', async () => {
    const original = vi.fn<typeof fetch>().mockResolvedValue(new Response())
    const observed = observeMutationFetch(original, 'https://artmuse.test', 'https://db.test')
    const before = temporaryCacheRevision()
    await observed('/api/artworks/work', { method: 'PATCH' })
    await observed(new Request('https://artmuse.test/api/artworks/work', { method: 'DELETE' }))
    await observed(new Request('https://artmuse.test/api/artworks/work', { method: 'DELETE' }), { method: 'GET' })
    expect(temporaryCacheRevision()).toBe(before + 2)
  })

  it('propagates network failures without changing cache state', async () => {
    const original = vi.fn<typeof fetch>().mockRejectedValue(new Error('Offline'))
    const observed = observeMutationFetch(original, 'https://artmuse.test', 'https://db.test')
    const before = temporaryCacheRevision()
    await expect(observed('/api/artworks', { method: 'POST' })).rejects.toThrow('Offline')
    expect(temporaryCacheRevision()).toBe(before)
  })
})
