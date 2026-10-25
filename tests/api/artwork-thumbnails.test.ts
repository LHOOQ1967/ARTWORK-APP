import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(), download: vi.fn(), signedUrl: vi.fn(), from: vi.fn(),
  info: vi.fn(), document: vi.fn(), cached: vi.fn(), upload: vi.fn(), remove: vi.fn(),
}))
vi.mock('@/lib/apiAuth', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/scheduleThumbnailCleanup', () => ({ scheduleThumbnailCleanup: vi.fn() }))
vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: { storage: { from: () => ({ download: mocks.cached, upload: mocks.upload, remove: mocks.remove }) } },
}))
import { GET } from '@/app/api/artwork-images/route'

const source = 'https://db.test/storage/v1/object/public/artwork-images/work/photo.jpg'
function request(url = source, thumbnail = true) {
  return new NextRequest(`https://artmuse.test/api/artwork-images?url=${encodeURIComponent(url)}${thumbnail ? '&thumbnail=1' : ''}`)
}

describe('authenticated artwork thumbnails', () => {
  afterEach(() => vi.unstubAllEnvs())
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.test')
    mocks.from.mockReturnValue({ download: mocks.download, createSignedUrl: mocks.signedUrl, info: mocks.info })
    const chain = { select: vi.fn(), eq: vi.fn(), limit: vi.fn(), maybeSingle: mocks.document }
    chain.select.mockReturnValue(chain)
    chain.eq.mockReturnValue(chain)
    chain.limit.mockReturnValue(chain)
    mocks.document.mockResolvedValue({ data: { id: 'document-id', url: source }, error: null })
    mocks.info.mockResolvedValue({ data: { id: 'source-object', version: 'v1' }, error: null })
    mocks.cached.mockResolvedValue({ data: null, error: { statusCode: '404' } })
    mocks.upload.mockResolvedValue({ data: {}, error: null })
    mocks.remove.mockResolvedValue({ data: [], error: null })
    mocks.requireUser.mockResolvedValue({ response: null, supabase: { storage: { from: mocks.from }, from: () => chain } })
    mocks.signedUrl.mockResolvedValue({ data: { signedUrl: 'https://db.test/signed-original' }, error: null })
  })

  it('returns a real 160x140 WebP at less than 10% of a large image fixture', async () => {
    const width = 1200
    const height = 1000
    const pixels = Buffer.alloc(width * height * 3)
    for (let index = 0; index < pixels.length; index++) pixels[index] = (index * 73 + Math.floor(index / 157)) % 256
    const original = await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer()
    mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array(original)]), error: null })
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(mocks.download).toHaveBeenCalledWith('work/photo.jpg')
    expect(mocks.signedUrl).not.toHaveBeenCalled()
    expect(response.headers.get('Content-Type')).toBe('image/webp')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    const bytes = Buffer.from(await response.arrayBuffer())
    const metadata = await sharp(bytes).metadata()
    expect(metadata).toMatchObject({ width: 160, height: 140, format: 'webp' })
    expect(bytes.length).toBeLessThan(original.length / 10)
    expect(mocks.upload).toHaveBeenCalledWith(expect.stringMatching(/^document-id\/[a-f0-9]+-[a-f0-9]+\.webp$/),
      expect.any(Buffer), expect.objectContaining({ contentType: 'image/webp' }))
  })

  it('does not enlarge small originals', async () => {
    const original = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#777' } }).png().toBuffer()
    mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array(original)]), error: null })
    const response = await GET(request())
    const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata()
    expect(metadata.width).toBeLessThanOrEqual(40)
    expect(metadata.height).toBeLessThanOrEqual(30)
  })

  it('applies EXIF orientation and strips source metadata', async () => {
    const original = await sharp({ create: { width: 280, height: 320, channels: 3, background: '#777' } })
      .jpeg().withMetadata({ orientation: 6 }).toBuffer()
    mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array(original)]), error: null })
    const response = await GET(request())
    const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata()
    expect(metadata).toMatchObject({ width: 160, height: 140, format: 'webp' })
    expect(metadata.orientation).toBeUndefined()
    expect(metadata.exif).toBeUndefined()
  })

  it('preserves the signed original route for galleries and downloads', async () => {
    const response = await GET(request(source, false))
    expect(response.status).toBe(302)
    expect(mocks.signedUrl).toHaveBeenCalledWith('work/photo.jpg', 60)
    expect(mocks.download).not.toHaveBeenCalled()
  })

  it('does not read storage for unauthenticated callers', async () => {
    mocks.requireUser.mockResolvedValue({ response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) })
    expect((await GET(request())).status).toBe(401)
    expect(mocks.download).not.toHaveBeenCalled()
  })

  it.each([
    'https://external.test/storage/v1/object/public/artwork-images/photo.jpg',
    'https://db.test/storage/v1/object/public/other-bucket/photo.jpg',
    'https://db.test/storage/v1/object/public/artwork-images/%ZZ',
    'not-a-url',
  ])('rejects an invalid source: %s', async url => {
    expect((await GET(request(url))).status).toBe(400)
    expect(mocks.download).not.toHaveBeenCalled()
  })

  it('does not fall back to an original when storage access is denied', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mocks.download.mockResolvedValue({ data: null, error: { message: 'Denied' } })
      expect((await GET(request())).status).toBe(404)
      expect(mocks.signedUrl).not.toHaveBeenCalled()
      expect(log).toHaveBeenCalled()
    } finally { log.mockRestore() }
  })

  it('reports undecodable images explicitly instead of serving original bytes', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mocks.download.mockResolvedValue({ data: new Blob(['not an image']), error: null })
      const response = await GET(request())
      expect(response.status).toBe(422)
      expect(await response.json()).toEqual({ error: 'Unable to generate image thumbnail' })
      expect(log).toHaveBeenCalled()
    } finally { log.mockRestore() }
  })

  it('rejects oversized source files before decoding', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const arrayBuffer = vi.fn()
      mocks.download.mockResolvedValue({ data: { size: 100 * 1024 * 1024 + 1, arrayBuffer }, error: null })
      expect((await GET(request())).status).toBe(413)
      expect(arrayBuffer).not.toHaveBeenCalled()
    } finally { log.mockRestore() }
  })

  it('serves stored bytes without downloading or reprocessing the original', async () => {
    const stored = await sharp({ create: { width: 160, height: 140, channels: 3, background: '#777' } }).webp().toBuffer()
    mocks.cached.mockResolvedValue({ data: new Blob([new Uint8Array(stored)]), error: null })
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(Buffer.from(await response.arrayBuffer())).toEqual(stored)
    expect(mocks.document).toHaveBeenCalled()
    expect(mocks.info).toHaveBeenCalled()
    expect(mocks.download).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('denies cached derivatives when source document RLS no longer grants access', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mocks.document.mockResolvedValue({ data: null, error: null })
      expect((await GET(request())).status).toBe(404)
      expect(mocks.cached).not.toHaveBeenCalled()
      expect(mocks.download).not.toHaveBeenCalled()
    } finally { log.mockRestore() }
  })

  it('changes the stored key when the source version changes', async () => {
    const original = await sharp({ create: { width: 160, height: 140, channels: 3, background: '#777' } }).png().toBuffer()
    mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array(original)]), error: null })
    await GET(request())
    const firstKey = mocks.upload.mock.calls[0][0]
    mocks.info.mockResolvedValue({ data: { id: 'source-object', version: 'v2' }, error: null })
    await GET(request())
    expect(mocks.upload.mock.calls[1][0]).not.toBe(firstKey)
  })

  it('does not return success if thumbnail persistence fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const original = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#777' } }).png().toBuffer()
      mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array(original)]), error: null })
      mocks.upload.mockResolvedValue({ data: null, error: { message: 'Write failed' } })
      expect((await GET(request())).status).toBe(502)
    } finally { log.mockRestore() }
  })

  it('removes a derivative if the source document disappears during storage upload', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const original = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#777' } }).png().toBuffer()
      mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array(original)]), error: null })
      mocks.document.mockResolvedValueOnce({ data: { id: 'document-id', url: source }, error: null })
        .mockResolvedValueOnce({ data: { id: 'document-id', url: source }, error: null })
        .mockResolvedValueOnce({ data: null, error: null })
      expect((await GET(request())).status).toBe(404)
      expect(mocks.remove).toHaveBeenCalledWith([mocks.upload.mock.calls[0][0]])
    } finally { log.mockRestore() }
  })

  it('refuses to save pixels if the original changed during processing', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const original = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#777' } }).png().toBuffer()
      mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array(original)]), error: null })
      mocks.info.mockResolvedValueOnce({ data: { id: 'source-object', version: 'v1' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'source-object', version: 'v2' }, error: null })
      expect((await GET(request())).status).toBe(409)
      expect(mocks.upload).not.toHaveBeenCalled()
    } finally { log.mockRestore() }
  })

  it('reports cache outages instead of recomputing and disguising a storage failure', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mocks.cached.mockResolvedValue({ data: null, error: { statusCode: '503' } })
      expect((await GET(request())).status).toBe(502)
      expect(mocks.download).not.toHaveBeenCalled()
      expect(mocks.upload).not.toHaveBeenCalled()
    } finally { log.mockRestore() }
  })
})
