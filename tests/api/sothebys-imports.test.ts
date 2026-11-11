import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/artworks/[id]/sothebys-imports/route'
import { POST as christiesPOST } from '@/app/api/artworks/[id]/christies-imports/route'
import { POST as phillipsPOST } from '@/app/api/artworks/[id]/phillips-imports/route'
import { parsedLot } from '../fixtures/sothebysLot'
import { parsedLot as christiesLot } from '../fixtures/christiesLot'
import { parsedLot as phillipsLot } from '../fixtures/phillipsLot'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(), fetchLot: vi.fn(), fetchBytes: vi.fn(), upload: vi.fn(), thumbnail: vi.fn(),
}))
vi.mock('@/lib/apiAuth', () => ({ requireRole: mocks.authorize }))
vi.mock('@/lib/imports/fetchSothebys', () => ({ fetchSothebysLot: mocks.fetchLot, fetchSothebysBytes: mocks.fetchBytes }))
vi.mock('@/lib/imports/fetchChristies', () => ({ fetchChristiesLot: mocks.fetchLot, fetchChristiesBytes: mocks.fetchBytes }))
vi.mock('@/lib/imports/fetchPhillips', () => ({ fetchPhillipsLot: mocks.fetchLot, fetchPhillipsBytes: mocks.fetchBytes }))
vi.mock('@/lib/scheduleThumbnailCleanup', () => ({ scheduleThumbnailGeneration: mocks.thumbnail }))

const artworkId = 'c6388e07-9a7c-4c93-b38f-a2f58f56d840'
const documents = new Map<string, Record<string, unknown>>()
const upsert = vi.fn(async (row: Record<string, unknown>) => {
  const id = String(row.id)
  if (!documents.has(id)) documents.set(id, row)
  return { error: null }
})
const supabase = {
  from: vi.fn((table: string) => ({
    select: () => ({
      eq: () => table === 'artworks' ? { maybeSingle: async () => ({ data: { id: artworkId }, error: null }) } : {
        in: async () => ({ data: [...documents.values()].map(item => ({ id: item.id })), error: null }),
        order: () => ({ limit: () => ({ maybeSingle: async () => ({
          data: documents.size ? { position: Math.max(...[...documents.values()].map(item => Number(item.position))) } : null,
          error: null,
        }) }) }),
      },
    }),
    upsert,
  })),
  storage: {
    from: () => ({
      upload: mocks.upload,
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
    }),
  },
}
const context = { params: Promise.resolve({ id: artworkId }) }

describe.each([
  { house: "Sotheby's", POST, parsedLot, unrelatedUrl: 'https://sothebys-md.brightspotcdn.com/unrelated.jpg' },
  { house: "Christie's", POST: christiesPOST, parsedLot: christiesLot, unrelatedUrl: 'https://www.christies.com/img/LotImages/unrelated.jpg' },
  { house: 'Phillips', POST: phillipsPOST, parsedLot: phillipsLot, unrelatedUrl: 'https://dist.phillips.com/auction-assets/NY010726/unrelated.jpg' },
])('$house artwork attachments', ({ POST, parsedLot, unrelatedUrl }) => {
  function request(images = parsedLot.images.map(image => image.url)) {
    return new Request('https://artmuse.test/api/artworks/test/imports', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: parsedLot.source_url, images }),
    })
  }
  beforeEach(async () => {
    vi.clearAllMocks()
    documents.clear()
    mocks.authorize.mockResolvedValue({ response: null, supabase })
    mocks.fetchLot.mockResolvedValue(parsedLot)
    mocks.fetchBytes.mockResolvedValue(await sharp({ create: { width: 20, height: 20, channels: 3, background: 'white' } }).png().toBuffer())
    mocks.upload.mockResolvedValue({ error: null })
  })

  it('copies multiple images and saves one source link with stable document identifiers', async () => {
    const response = await POST(request(), context)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.artwork_id).toBe(artworkId)
    expect(body.document_ids).toHaveLength(parsedLot.images.length + 1)
    expect(documents.size).toBe(parsedLot.images.length + 1)
    expect([...documents.values()].filter(item => item.document_type === 'image')).toHaveLength(parsedLot.images.length)
    expect([...documents.values()].find(item => item.document_type === 'link')?.url).toBe(parsedLot.source_url)
    expect([...documents.values()].every(item => item.visibility === 'all_clients')).toBe(true)
    const positions = Array.from({ length: parsedLot.images.length + 1 }, (_, index) => index)
    expect([...documents.values()].map(item => item.position)).toEqual(positions)
    expect(mocks.upload).toHaveBeenCalledTimes(parsedLot.images.length)
    expect(mocks.thumbnail).toHaveBeenCalledTimes(parsedLot.images.length)
    const retried = await POST(request(), context)
    expect(await retried.json()).toEqual(body)
    expect(documents.size).toBe(parsedLot.images.length + 1)
    expect([...documents.values()].map(item => item.position)).toEqual(positions)
    expect(mocks.upload).toHaveBeenCalledTimes(parsedLot.images.length)
  })

  it('resumes only missing images after a partial network failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.fetchBytes.mockResolvedValueOnce(await sharp({ create: { width: 10, height: 10, channels: 3, background: 'white' } }).png().toBuffer())
      .mockRejectedValueOnce(new Error('Image download failed'))
    expect((await POST(request(), context)).status).toBe(502)
    expect(documents.size).toBe(2)
    expect((await POST(request(), context)).status).toBe(200)
    expect(documents.size).toBe(parsedLot.images.length + 1)
    expect(mocks.upload).toHaveBeenCalledTimes(parsedLot.images.length)
    vi.restoreAllMocks()
  })

  it('refuses images that do not belong to the selected lot before downloading', async () => {
    expect((await POST(request([unrelatedUrl]), context)).status).toBe(400)
    expect(mocks.fetchBytes).not.toHaveBeenCalled()
    expect(documents.size).toBe(0)
  })

  it('can import the source without any images', async () => {
    expect((await POST(request([]), context)).status).toBe(200)
    expect(documents.size).toBe(1)
    expect(mocks.fetchBytes).not.toHaveBeenCalled()
  })

  it('does not fetch data for unauthorized users or invalid image hosts', async () => {
    mocks.authorize.mockResolvedValueOnce({ response: new Response('Forbidden', { status: 403 }) })
    expect((await POST(request(), context)).status).toBe(403)
    expect((await POST(request(['https://localhost/image.jpg']), context)).status).toBe(400)
    expect(mocks.fetchLot).not.toHaveBeenCalled()
  })
})
