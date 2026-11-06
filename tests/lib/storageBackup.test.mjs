import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { backupStorage, verifyStorageBackup, replaceBackupFile } from '../../scripts/backup-supabase-storage.mjs'

const directories = []
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})

describe('backup file replacement on Windows shares', () => {
  it('retries temporary sharing failures without deleting the checkpoint', async () => {
    const renameFile = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('locked'), { code: 'EPERM' }))
      .mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EBUSY' }))
      .mockResolvedValue(undefined)
    const wait = vi.fn()
    const report = vi.fn()
    await replaceBackupFile('checkpoint.tmp', 'checkpoint', { renameFile, wait, report })
    expect(renameFile).toHaveBeenCalledTimes(3)
    expect(wait.mock.calls).toEqual([[1000], [2000]])
    expect(report).toHaveBeenCalledTimes(2)
  })

  it('fails explicitly after bounded retries for a persistent permission failure', async () => {
    const error = Object.assign(new Error('denied'), { code: 'EACCES' })
    const renameFile = vi.fn().mockRejectedValue(error)
    const wait = vi.fn()
    await expect(replaceBackupFile('a', 'b', { renameFile, wait })).rejects.toBe(error)
    expect(renameFile).toHaveBeenCalledTimes(6)
    expect(wait).toHaveBeenCalledTimes(5)
  })

  it('does not retry unrelated filesystem errors', async () => {
    const error = Object.assign(new Error('disk full'), { code: 'ENOSPC' })
    const renameFile = vi.fn().mockRejectedValue(error)
    const wait = vi.fn()
    await expect(replaceBackupFile('a', 'b', { renameFile, wait })).rejects.toBe(error)
    expect(renameFile).toHaveBeenCalledTimes(1)
    expect(wait).not.toHaveBeenCalled()
  })
})

async function fixture({ downloadStatus = 200, changed = false, size = 5 } = {}) {
  const output = await mkdtemp(join(tmpdir(), 'artmuse-storage-test-'))
  directories.push(output)
  const visits = new Map()
  const fetchImpl = vi.fn(async (url, options) => {
    const path = url.pathname
    if (path.endsWith('/bucket')) {
      return Response.json(['artwork-images', 'artwork-imports', 'artwork-thumbnails'].map(id => ({ id })))
    }
    if (path.includes('/object/list/')) {
      const bucket = path.split('/').at(-1)
      const { prefix, offset } = JSON.parse(options.body)
      if (bucket !== 'artwork-images') return Response.json([])
      const key = `${bucket}:${prefix}:${offset}`
      const count = (visits.get(key) ?? 0) + 1
      visits.set(key, count)
      if (!prefix) return Response.json([{ name: 'folder', id: null, metadata: null }])
      return Response.json([{
        name: 'original:name.webp', id: 'object-1',
        updated_at: changed && count > 1 ? '2026-10-29T10:00:00Z' : '2026-10-27T10:00:00Z',
        metadata: { size },
      }])
    }
    return new Response('hello', { status: downloadStatus })
  })
  return {
    output, url: 'https://example.supabase.co', key: 'secret-test-key',
    fetchImpl, log: vi.fn(), wait: vi.fn().mockResolvedValue(undefined),
  }
}

describe('storage backup', () => {
  it('finalizes against SQL inventory without rescanning or downloading unchanged objects', async () => {
    const options = await fixture()
    const first = await backupStorage(options)
    const manifest = JSON.parse(await readFile(join(first.directory, 'manifest.json'), 'utf8'))
    const inventoryFile = join(options.output, 'sql-inventory.json')
    await writeFile(inventoryFile, JSON.stringify({
      version: 1, source: options.url, capturedAt: new Date().toISOString(),
      buckets: manifest.buckets,
      files: [
        ...manifest.files,
        { ...manifest.files[0], name: 'new-file', id: 'new-object' },
      ],
    }))
    options.fetchImpl.mockClear()
    const result = await backupStorage({ ...options, resume: first.directory, inventoryFile })
    expect(result.files).toBe(2)
    expect(options.fetchImpl.mock.calls.filter(([url]) => url.pathname.includes('/object/list/'))).toHaveLength(0)
    expect(options.fetchImpl.mock.calls.filter(([url]) => url.pathname.includes('/object/authenticated/'))).toHaveLength(1)
    const final = JSON.parse(await readFile(join(result.directory, 'manifest.json'), 'utf8'))
    expect(final.validationBasis).toContain('not an atomic')
    expect(final.complete).toBe(true)
    await expect(verifyStorageBackup(result.directory)).resolves.toEqual({ files: 2, bytes: 10 })
  })

  it.each(['changed', 'deleted', 'wrong-project'])('refuses unsafe inventory reconciliation: %s', async mode => {
    const options = await fixture()
    const first = await backupStorage(options)
    const manifest = JSON.parse(await readFile(join(first.directory, 'manifest.json'), 'utf8'))
    const inventoryFile = join(options.output, 'inventory.json')
    const files = mode === 'deleted' ? [] : manifest.files.map(file =>
      mode === 'changed' ? { ...file, updatedAt: '2026-10-29T12:00:00Z' } : file)
    await writeFile(inventoryFile, JSON.stringify({
      version: 1, source: mode === 'wrong-project' ? 'https://other.supabase.co' : options.url,
      capturedAt: new Date().toISOString(), buckets: manifest.buckets, files,
    }))
    options.fetchImpl.mockClear()
    await expect(backupStorage({ ...options, resume: first.directory, inventoryFile })).rejects.toThrow()
    expect(options.fetchImpl.mock.calls.filter(([url]) => url.pathname.includes('/object/authenticated/'))).toHaveLength(0)
    expect(await readFile(join(first.directory, 'objects', manifest.files[0].localFile), 'utf8')).toBe('hello')
  })

  it('backs up nested objects and preserves original names without exposing credentials', async () => {
    const options = await fixture()
    const result = await backupStorage(options)
    expect(await verifyStorageBackup(result.directory)).toEqual({ files: 1, bytes: 5 })
    const text = await readFile(join(result.directory, 'manifest.json'), 'utf8')
    expect(text).not.toContain(options.key)
    expect(JSON.parse(text).files[0].name).toBe('folder/original:name.webp')
    for (const [, request] of options.fetchImpl.mock.calls) {
      expect(['GET', 'POST']).toContain(request.method)
      if (request.method === 'POST') expect(JSON.parse(request.body)).toHaveProperty('prefix')
    }
    const manifest = JSON.parse(text)
    await writeFile(join(result.directory, 'objects', manifest.files[0].localFile), 'wrong')
    await expect(verifyStorageBackup(result.directory)).rejects.toThrow('verification failed')
  })

  it.each([
    [{ downloadStatus: 403 }, 'HTTP 403'],
    [{ size: 6 }, 'size differs'],
    [{ changed: true }, 'Storage inventory changed'],
  ])('does not mark a failed backup complete: %j', async (settings, message) => {
    const options = await fixture(settings)
    await expect(backupStorage(options)).rejects.toThrow(message)
    const [name] = await readdir(options.output)
    const directory = join(options.output, name)
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
    expect(manifest.complete).toBe(false)
    await expect(verifyStorageBackup(directory)).rejects.toThrow('incomplete')
  })

  it('paginates full listings and backs up empty files', async () => {
    const options = await fixture()
    const offsets = []
    options.fetchImpl = vi.fn(async (url, request) => {
      if (url.pathname.endsWith('/bucket')) {
        return Response.json(['artwork-images', 'artwork-imports', 'artwork-thumbnails'].map(id => ({ id })))
      }
      if (url.pathname.includes('/object/list/')) {
        if (!url.pathname.endsWith('/artwork-images')) return Response.json([])
        const { offset } = JSON.parse(request.body)
        offsets.push(offset)
        return Response.json(offset === 0 ? Array.from({ length: 100 }, (_, index) => ({
          name: `file-${index}`, id: `id-${index}`, metadata: { size: 0 },
        })) : [])
      }
      return new Response('')
    })
    const result = await backupStorage(options)
    expect(result.files).toBe(100)
    expect(offsets).toEqual([0, 100, 0, 100])
  })

  it('retries rate-limited reads and stops after a bounded number of attempts', async () => {
    const options = await fixture()
    const normalFetch = options.fetchImpl
    options.fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '0' } }))
      .mockImplementation(normalFetch)
    expect((await backupStorage(options)).files).toBe(1)
    const limitedFetch = vi.fn(async () => new Response('', {
      status: 429, headers: { 'Retry-After': '0' },
    }))
    await expect(backupStorage({ ...options, fetchImpl: limitedFetch })).rejects.toThrow('HTTP 429')
    expect(limitedFetch).toHaveBeenCalledTimes(5)
  })

  it('retries HTTP 544 and records diagnostic headers and sanitized response body', async () => {
    const options = await fixture()
    const normalFetch = options.fetchImpl
    const transient = new Response(JSON.stringify({
      message: 'gateway timeout', credential: 'secret-test-key',
      token: 'eyJabc.def.ghi', url: 'https://private.example/path',
    }), {
      status: 544,
      headers: { 'Retry-After': '0', 'sb-request-id': 'req-123', 'cf-ray': 'ray-456' },
    })
    options.fetchImpl = vi.fn()
      .mockResolvedValueOnce(transient)
      .mockImplementation(normalFetch)
    expect((await backupStorage(options)).files).toBe(1)
    const diagnostics = options.log.mock.calls.map(([line]) => line).join('\n')
    expect(diagnostics).toContain('HTTP 544')
    expect(diagnostics).toContain('req-123')
    expect(diagnostics).toContain('ray-456')
    expect(diagnostics).not.toContain('secret-test-key')
    expect(diagnostics).not.toContain('eyJabc')
    expect(diagnostics).not.toContain('private.example')
  })

  it('retries transient network failures with bounded backoff', async () => {
    const options = await fixture()
    const normalFetch = options.fetchImpl
    options.fetchImpl = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))
      .mockImplementation(normalFetch)
    expect((await backupStorage(options)).files).toBe(1)
    expect(options.wait).toHaveBeenCalledWith(5000)
    expect(options.log.mock.calls.map(([line]) => line).join('\n')).toContain('TimeoutError')
  })

  it('resumes saved inventory and does not download verified files again', async () => {
    const options = await fixture()
    const normalFetch = options.fetchImpl
    let fail = true
    options.fetchImpl = vi.fn(async (url, request) => {
      if (fail && url.pathname.endsWith('/object/list/artwork-imports')) {
        return new Response('', { status: 503 })
      }
      return normalFetch(url, request)
    })
    await expect(backupStorage(options)).rejects.toThrow('HTTP 503')
    const [name] = await readdir(options.output)
    const directory = join(options.output, name)
    const before = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
    expect(before.files).toHaveLength(1)
    expect(before.failure).toContain('HTTP 503')
    fail = false
    options.fetchImpl.mockClear()
    const result = await backupStorage({ ...options, resume: directory })
    expect(result.files).toBe(1)
    expect(options.fetchImpl.mock.calls.filter(([url]) => url.pathname.includes('/object/authenticated/'))).toHaveLength(0)
    expect(await readFile(join(directory, 'backup.log'), 'utf8')).toContain('Resuming')
    expect(await verifyStorageBackup(directory)).toEqual({ files: 1, bytes: 5 })
  })

  it('resumes the next inventory page after interruption', async () => {
    const options = await fixture()
    const offsets = []
    let fail = true
    options.fetchImpl = vi.fn(async (url, request) => {
      if (url.pathname.endsWith('/bucket')) {
        return Response.json(['artwork-images', 'artwork-imports', 'artwork-thumbnails'].map(id => ({ id })))
      }
      if (url.pathname.includes('/object/list/')) {
        if (!url.pathname.endsWith('/artwork-images')) return Response.json([])
        const { offset } = JSON.parse(request.body)
        offsets.push(offset)
        if (offset === 100 && fail) return new Response('', { status: 503 })
        return Response.json(offset === 0 ? Array.from({ length: 100 }, (_, index) => ({
          name: `file-${index}`, id: `id-${index}`, metadata: { size: 0 },
        })) : [])
      }
      return new Response('')
    })
    await expect(backupStorage(options)).rejects.toThrow('HTTP 503')
    const [name] = await readdir(options.output)
    fail = false
    offsets.length = 0
    const result = await backupStorage({ ...options, resume: join(options.output, name) })
    expect(result.files).toBe(100)
    expect(offsets).toEqual([100, 0, 100])
  })

  it('replaces corrupt local files and abandoned partial downloads on resume', async () => {
    const options = await fixture()
    const normalFetch = options.fetchImpl
    let fail = true
    options.fetchImpl = vi.fn(async (url, request) => {
      if (fail && url.pathname.endsWith('/object/list/artwork-imports')) {
        return new Response('', { status: 503 })
      }
      return normalFetch(url, request)
    })
    await expect(backupStorage(options)).rejects.toThrow('HTTP 503')
    const [name] = await readdir(options.output)
    const directory = join(options.output, name)
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
    const target = join(directory, 'objects', manifest.files[0].localFile)
    await writeFile(target, 'corrupt')
    await writeFile(`${target}.partial`, 'abandoned')
    fail = false
    const result = await backupStorage({ ...options, resume: directory })
    expect(await verifyStorageBackup(result.directory)).toEqual({ files: 1, bytes: 5 })
    expect(await readFile(target, 'utf8')).toBe('hello')
    expect(await readFile(join(directory, 'backup.log'), 'utf8')).toContain('downloading again')
  })

  it('persists final verification pages and resumes verification without restarting it', async () => {
    const options = await fixture()
    const normalFetch = options.fetchImpl
    let importListingCalls = 0
    options.fetchImpl = vi.fn(async (url, request) => {
      if (url.pathname.endsWith('/object/list/artwork-imports') &&
        ++importListingCalls >= 2 && importListingCalls <= 6) {
        return new Response('', { status: 503 })
      }
      return normalFetch(url, request)
    })
    await expect(backupStorage(options)).rejects.toThrow('HTTP 503')
    const [name] = await readdir(options.output)
    const directory = join(options.output, name)
    const checkpoint = JSON.parse(await readFile(join(directory, 'inventory.json'), 'utf8'))
    expect(checkpoint.verification['artwork-images'].complete).toBe(true)
    options.fetchImpl.mockClear()
    const result = await backupStorage({ ...options, resume: directory })
    expect(result.files).toBe(1)
    const imageListings = options.fetchImpl.mock.calls.filter(([url]) =>
      url.pathname.endsWith('/object/list/artwork-images'))
    expect(imageListings).toHaveLength(0)
    await expect(verifyStorageBackup(directory)).resolves.toEqual({ files: 1, bytes: 5 })
  })
})
