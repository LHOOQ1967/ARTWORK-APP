import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { testRestoreStorage } from '../../scripts/test-restore-storage.mjs'

const directories = []
const digest = value => createHash('sha256').update(value).digest('hex')
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'artmuse-storage-restore-'))
  directories.push(root)
  const backup = join(root, 'backup')
  await mkdir(join(backup, 'objects'), { recursive: true })
  const files = []
  for (const bucket of ['artwork-images', 'artwork-imports', 'artwork-thumbnails']) {
    for (let index = 0; index < 4; index++) {
      const name = `folder with spaces/file-${index}.png`
      const data = Buffer.from(`sample${'x'.repeat(index)}`)
      const localFile = `${digest(JSON.stringify([bucket, name]))}.bin`
      files.push({ bucket, name, localFile, bytes: data.length, sha256: digest(data), metadata: { mimetype: 'image/png' } })
      await writeFile(join(backup, 'objects', localFile), data)
    }
  }
  const manifest = { version: 1, source: 'https://cdbtgjhbgswpdehqwjnn.supabase.co', complete: true, files }
  await writeFile(join(backup, 'manifest.json'), JSON.stringify(manifest))
  const objects = new Map()
  const fetchImpl = vi.fn(async (url, options) => {
    if (url.pathname === '/storage/v1/bucket') return Response.json({ name: JSON.parse(options.body).name })
    if (url.pathname.startsWith('/storage/v1/bucket/')) {
      return Response.json({ id: decodeURIComponent(url.pathname.split('/').at(-1)), public: false })
    }
    if (options.method === 'POST') {
      objects.set(url.pathname, options.body)
      return Response.json({ Key: url.pathname })
    }
    const path = url.pathname.replace('/object/authenticated/', '/object/')
    return new Response(objects.get(path))
  })
  return { backup, output: root, key: 'sb_secret_test-only', fetchImpl, log: vi.fn(), manifest }
}

describe('isolated Storage sample restoration', () => {
  it('prepares and verifies nine local files without credentials or network access', async () => {
    const options = await fixture()
    const { report, directory } = await testRestoreStorage({ ...options, key: undefined })
    expect(options.fetchImpl).not.toHaveBeenCalled()
    expect(report.files).toHaveLength(9)
    expect(report.files.every(file => !file.name.endsWith('file-3.png'))).toBe(true)
    expect(report.sampleRestorePassed).toBe(false)
    expect(JSON.parse(await readFile(join(directory, 'result.json'), 'utf8'))).toEqual(report)
  })

  it('creates only private isolated buckets, uploads without overwrite and verifies exact bytes', async () => {
    const options = await fixture()
    const { report, directory } = await testRestoreStorage({ ...options, execute: true })
    expect(report.sampleRestorePassed).toBe(true)
    expect(report.fullRestoreTested).toBe(false)
    expect(report.files.every(file => file.verified)).toBe(true)
    expect(options.fetchImpl).toHaveBeenCalledTimes(27)
    for (const [url, request] of options.fetchImpl.mock.calls) {
      expect(url.origin).toBe('https://sontvcvvtftvivysiccg.supabase.co')
      expect(request.redirect).toBe('error')
      expect(request.headers.apikey).toBe(options.key)
      expect(request.headers.Authorization).toBeUndefined()
      expect(request.method).not.toBe('DELETE')
      if (url.pathname === '/storage/v1/bucket') expect(JSON.parse(request.body).public).toBe(false)
      if (request.method === 'POST' && url.pathname.includes('/object/')) {
        expect(request.headers['x-upsert']).toBe('false')
        expect(url.pathname).toContain('folder%20with%20spaces')
      }
    }
    expect(await readFile(join(directory, 'result.json'), 'utf8')).not.toContain(options.key)
  })

  it('refuses incomplete or wrong-source backups before any request', async () => {
    for (const change of [{ complete: false }, { source: 'https://other.supabase.co' }]) {
      const options = await fixture()
      await writeFile(join(options.backup, 'manifest.json'), JSON.stringify({ ...options.manifest, ...change }))
      await expect(testRestoreStorage({ ...options, execute: true })).rejects.toThrow('complete Storage backup')
      expect(options.fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('refuses corrupted local bytes before any remote write', async () => {
    const options = await fixture()
    await writeFile(join(options.backup, 'objects', options.manifest.files[0].localFile), 'corrupt')
    await expect(testRestoreStorage({ ...options, execute: true })).rejects.toThrow('Local sample hash/size mismatch')
    expect(options.fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects invalid filenames, duplicate entries and missing samples before remote writes', async () => {
    for (const kind of ['path', 'duplicate', 'missing']) {
      const options = await fixture()
      if (kind === 'path') options.manifest.files[0].localFile = '..\\outside.bin'
      if (kind === 'duplicate') options.manifest.files[1] = options.manifest.files[0]
      if (kind === 'missing') options.manifest.files = options.manifest.files.slice(4)
      await writeFile(join(options.backup, 'manifest.json'), JSON.stringify(options.manifest))
      await expect(testRestoreStorage({ ...options, execute: true })).rejects.toThrow()
      expect(options.fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('rejects missing, publishable and legacy keys before any request', async () => {
    const options = await fixture()
    for (const key of [undefined, '', 'sb_publishable_wrong', 'eyJ.legacy.key']) {
      await expect(testRestoreStorage({ ...options, key, execute: true })).rejects.toThrow('test project secret key')
    }
    expect(options.fetchImpl).not.toHaveBeenCalled()
  })

  it('stops before uploading if a created bucket is public', async () => {
    const options = await fixture()
    const original = options.fetchImpl.getMockImplementation()
    options.fetchImpl.mockImplementation((url, request) => url.pathname.startsWith('/storage/v1/bucket/')
      ? Response.json({ id: decodeURIComponent(url.pathname.split('/').at(-1)), public: true })
      : original(url, request))
    await expect(testRestoreStorage({ ...options, execute: true })).rejects.toThrow('privacy verification failed')
    expect(options.fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('fails and persists a failed report on a downloaded hash mismatch', async () => {
    const options = await fixture()
    const original = options.fetchImpl.getMockImplementation()
    options.fetchImpl.mockImplementation((url, request) => url.pathname.includes('/object/authenticated/')
      ? new Response('wrong')
      : original(url, request))
    await expect(testRestoreStorage({ ...options, execute: true })).rejects.toThrow('Restored sample hash/size mismatch')
    const reportPath = options.log.mock.calls[0][0].slice('Private sample report: '.length)
    const report = JSON.parse(await readFile(join(reportPath, 'result.json'), 'utf8'))
    expect(report.sampleRestorePassed).toBe(false)
    expect(report.files.some(file => file.verified)).toBe(false)
    expect(report.error).toContain('mismatch')
  })

  it('does not retry HTTP 544 or leak response bodies containing a secret', async () => {
    const options = await fixture()
    options.fetchImpl.mockResolvedValue(new Response(options.key, { status: 544 }))
    await expect(testRestoreStorage({ ...options, execute: true })).rejects.toThrow('HTTP 544')
    expect(options.fetchImpl).toHaveBeenCalledTimes(1)
    const reportPath = options.log.mock.calls[0][0].slice('Private sample report: '.length)
    expect(await readFile(join(reportPath, 'result.json'), 'utf8')).not.toContain(options.key)
  })

  it('surfaces network failures without leaking the underlying error or retrying writes', async () => {
    const options = await fixture()
    options.fetchImpl.mockRejectedValue(new Error(options.key))
    await expect(testRestoreStorage({ ...options, execute: true })).rejects.toThrow('remote writes may have completed')
    expect(options.fetchImpl).toHaveBeenCalledTimes(1)
    const reportPath = options.log.mock.calls[0][0].slice('Private sample report: '.length)
    expect(await readFile(join(reportPath, 'result.json'), 'utf8')).not.toContain(options.key)
  })
})
