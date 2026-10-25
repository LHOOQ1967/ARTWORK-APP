import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  jobs: vi.fn(), current: vi.fn(), acknowledge: vi.fn(),
  list: vi.fn(), remove: vi.fn(), from: vi.fn(),
}))
vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: mocks.from,
    storage: { from: () => ({ list: mocks.list, remove: mocks.remove }) },
  },
}))
import { cleanArtworkThumbnails } from '@/lib/artworkThumbnails'

describe('durable artwork thumbnail cleanup', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    const queue = {
      select: vi.fn(), order: vi.fn(), limit: mocks.jobs,
      delete: vi.fn(), eq: vi.fn(),
    }
    queue.select.mockReturnValue(queue)
    queue.order.mockReturnValue(queue)
    queue.delete.mockReturnValue(queue)
    queue.eq.mockReturnValue(queue)
    Object.assign(queue, { then: (resolve: (value: unknown) => void) => mocks.acknowledge().then(resolve) })
    const document = { select: vi.fn(), eq: vi.fn(), maybeSingle: mocks.current }
    document.select.mockReturnValue(document)
    document.eq.mockReturnValue(document)
    mocks.from.mockImplementation(table => table === 'documents' ? document : queue)
    mocks.jobs.mockResolvedValue({ data: [{ document_id: 'doc', source_url: 'https://test/image.jpg', queued_at: 'time' }], error: null })
    mocks.current.mockResolvedValue({ data: null, error: null })
    mocks.acknowledge.mockResolvedValue({ error: null })
    mocks.remove.mockResolvedValue({ error: null })
    mocks.list.mockResolvedValue({ data: [], error: null })
  })

  it('removes all pages before acknowledging the exact queued source', async () => {
    mocks.list.mockResolvedValueOnce({ data: [{ name: 'old.webp' }], error: null })
    await cleanArtworkThumbnails()
    expect(mocks.list).toHaveBeenCalledTimes(2)
    expect(mocks.list).toHaveBeenCalledWith('doc', { limit: 100, search: expect.stringMatching(/^[a-f0-9]{64}-$/) })
    expect(mocks.remove).toHaveBeenCalledWith(['doc/old.webp'])
    expect(mocks.acknowledge).toHaveBeenCalledOnce()
  })

  it('retains the queue item if Storage deletion fails', async () => {
    mocks.list.mockResolvedValue({ data: [{ name: 'old.webp' }], error: null })
    mocks.remove.mockResolvedValue({ error: { message: 'Storage offline' } })
    await expect(cleanArtworkThumbnails()).rejects.toThrow('Storage offline')
    expect(mocks.acknowledge).not.toHaveBeenCalled()
  })

  it('retains the queue item if listing fails', async () => {
    mocks.list.mockResolvedValue({ data: null, error: { message: 'Listing offline' } })
    await expect(cleanArtworkThumbnails()).rejects.toThrow('Listing offline')
    expect(mocks.acknowledge).not.toHaveBeenCalled()
  })

  it('does not remove a restored/current source', async () => {
    mocks.current.mockResolvedValue({ data: { id: 'doc' }, error: null })
    await cleanArtworkThumbnails()
    expect(mocks.list).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.acknowledge).toHaveBeenCalledOnce()
  })
})
