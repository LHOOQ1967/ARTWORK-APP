import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const buckets = ['artwork-images', 'artwork-imports', 'artwork-thumbnails']
const digest = value => createHash('sha256').update(value).digest('hex')

export async function replaceBackupFile(source, target, {
  renameFile = rename, wait = delay, report = async () => {},
} = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      await renameFile(source, target)
      return
    } catch (error) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 5) throw error
      const milliseconds = 1000 * 2 ** attempt
      await report(`File replacement temporarily blocked (${error.code}); retry ${attempt + 1}/5 in ${milliseconds / 1000} seconds`)
      await wait(milliseconds)
    }
  }
}

async function responseErrorDetails(response, key, path) {
  const headers = ['sb-request-id', 'cf-ray', 'retry-after', 'content-type']
    .map(name => `${name}=${response.headers.get(name) ?? 'none'}`).join(', ')
  const reader = response.body?.getReader()
  let bytes = new Uint8Array()
  if (reader) {
    while (bytes.length < 2048) {
      const { done, value } = await reader.read()
      if (done) break
      const take = value.slice(0, 2048 - bytes.length)
      const next = new Uint8Array(bytes.length + take.length)
      next.set(bytes)
      next.set(take, bytes.length)
      bytes = next
      if (take.length < value.length) break
    }
    await reader.cancel()
  }
  const body = new TextDecoder().decode(bytes)
    .replaceAll(key, '[REDACTED]')
    .replace(/Bearer\s+[^\s"<>]+/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[REDACTED TOKEN]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[URL REDACTED]')
    .replaceAll(path, '[REQUEST PATH REDACTED]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
  return `${headers}${body ? `; body=${body.slice(0, 1000)}` : ''}`
}

async function pacedFetch(...args) {
  await delay(1000)
  return fetch(...args)
}

async function fileDigest(path) {
  const hash = createHash('sha256')
  let bytes = 0
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk)
    bytes += chunk.length
  }
  return { sha256: hash.digest('hex'), bytes }
}

export async function verifyStorageBackup(directory) {
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) {
    throw new Error('Invalid storage backup manifest')
  }
  for (const file of manifest.files) {
    if (!/^[a-f0-9]{64}\.bin$/.test(file.localFile)) throw new Error('Invalid backup filename')
    const actual = await fileDigest(join(directory, 'objects', file.localFile))
    if (actual.bytes !== file.bytes || actual.sha256 !== file.sha256) {
      throw new Error(`Backup verification failed for object ${file.localFile}`)
    }
  }
  if (!manifest.complete) throw new Error('Backup is incomplete; do not use it as a restore point')
  return { files: manifest.files.length, bytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0) }
}

export async function backupStorage({
  output, resume, inventoryFile, url, key, fetchImpl = pacedFetch, log = console.log, wait = delay,
}) {
  if (resume) output = resume
  if (!output || !isAbsolute(output)) throw new Error('An absolute output directory is required')
  if (!url || !key) throw new Error('Supabase URL and server-only service role key are required')
  const origin = new URL(url)
  if (origin.protocol !== 'https:' || origin.username || origin.password ||
    origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('Supabase URL must be an HTTPS origin without credentials')
  }
  const suppliedInventory = inventoryFile
    ? JSON.parse((await readFile(inventoryFile, 'utf8')).replace(/^\uFEFF/, ''))
    : undefined
  if (suppliedInventory) {
    if (suppliedInventory.version !== 1 || suppliedInventory.source !== origin.origin ||
      !Number.isFinite(Date.parse(suppliedInventory.capturedAt)) ||
      !Array.isArray(suppliedInventory.files) || !Array.isArray(suppliedInventory.buckets) ||
      buckets.some(bucket => !suppliedInventory.buckets.some(item => item.id === bucket))) {
      throw new Error('Invalid supplied inventory or different source project')
    }
    const identities = new Set()
    for (const file of suppliedInventory.files) {
      const identity = JSON.stringify([file.bucket, file.name])
      if (!buckets.includes(file.bucket) || typeof file.name !== 'string' || !file.name ||
        file.name.split('/').some(part => !part || part === '.' || part === '..') ||
        typeof file.id !== 'string' || !Number.isFinite(Date.parse(file.updatedAt)) ||
        !Number.isSafeInteger(file.metadata?.size) || file.metadata.size < 0 || identities.has(identity)) {
        throw new Error('Invalid or duplicate object in supplied inventory')
      }
      identities.add(identity)
    }
  }
  await mkdir(output, { recursive: true })
  const directory = resume ?? join(output, `supabase-storage-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`)
  await mkdir(join(directory, 'objects'), { recursive: true })
  async function report(message) {
    await appendFile(join(directory, 'backup.log'), `${new Date().toISOString()} ${message}\n`)
    log(message)
  }
  async function saveJson(name, value) {
    const path = join(directory, name)
    await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2))
    await replaceBackupFile(`${path}.tmp`, path, { report })
  }
  const manifest = resume
    ? JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
    : { version: 1, complete: false, startedAt: new Date().toISOString(), source: origin.origin, buckets: [], files: [] }
  if (manifest.version !== 1 || manifest.source !== origin.origin || !Array.isArray(manifest.files)) {
    throw new Error('Backup manifest is invalid or belongs to a different project')
  }
  if (manifest.complete && !suppliedInventory) {
    const stats = await verifyStorageBackup(directory)
    await report(`Already complete and verified: ${stats.files} files`)
    return { directory, ...stats }
  }
  const checkpoint = resume
    ? JSON.parse(await readFile(join(directory, 'inventory.json'), 'utf8'))
    : {}
  async function saveManifest() {
    manifest.updatedAt = new Date().toISOString()
    await saveJson('manifest.json', manifest)
  }
  await saveManifest()
  await saveJson('inventory.json', checkpoint)
  await report(`${resume ? 'Resuming' : 'Starting'} backup: ${directory}`)
  async function request(path, body) {
    let response
    let requestError
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        manifest.complete = false
        response = await fetchImpl(new URL(`/storage/v1/${path}`, origin), {
          method: body === undefined ? 'GET' : 'POST',
          headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
          redirect: 'error',
          signal: AbortSignal.timeout(300_000),
        })
        requestError = undefined
      } catch (error) {
        requestError = error
        if (attempt === 4) {
          throw new Error(`Storage request failed or timed out after 5 attempts (${error.name}); backup is not complete`)
        }
        const waitMs = Math.min(60_000, 5000 * 2 ** attempt)
        await report(`Storage request timed out or failed (${error.name}); retry ${attempt + 1}/4 in ${waitMs / 1000} seconds`)
        await wait(waitMs)
        continue
      }
      const retryable = response.status === 429 ||
        [500, 502, 503, 504, 520, 521, 522, 523, 524, 544].includes(response.status)
      if (!retryable || attempt === 4) break
      const retryAfter = response.headers.get('retry-after')
      const seconds = retryAfter === null ? NaN : Number(retryAfter)
      const requestedDelay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now()
      const waitMs = Number.isFinite(requestedDelay)
        ? Math.max(0, requestedDelay)
        : response.status === 429 ? 2000 * 2 ** attempt : 5000 * 2 ** attempt
      if (waitMs > 60_000) {
        const details = await responseErrorDetails(response, key, path)
        throw new Error(`Storage request failed (HTTP ${response.status}; ${details}); retry requires waiting more than one minute`)
      }
      const details = await responseErrorDetails(response, key, path)
      await report(`Storage request returned HTTP ${response.status}; retry ${attempt + 1}/4 in ${Math.ceil(waitMs / 1000)} seconds; ${details}`)
      await wait(waitMs)
    }
    if (requestError) throw new Error('Storage request failed; backup is not complete')
    if (!response.ok) {
      const details = await responseErrorDetails(response, key, path)
      throw new Error(`Storage request failed (HTTP ${response.status}; ${details})`)
    }
    return response
  }
  async function inventory(bucket, persist = false, savedState) {
    const state = savedState ?? (persist
      ? (checkpoint[bucket] ??= { files: [], prefixes: [''], seen: [], offset: 0, complete: false })
      : { files: [], prefixes: [''], seen: [], offset: 0, complete: false }
    )
    if (state.complete) return state.files
    const { files, prefixes } = state
    const seen = new Set(state.seen)
    while (prefixes.length) {
      const prefix = prefixes[0]
      if (state.offset === 0) {
        if (seen.has(prefix)) throw new Error('Duplicate folder in storage listing')
      }
      for (let offset = state.offset; ; offset += 100) {
        const page = await (await request(`object/list/${bucket}`, {
          prefix, limit: 100, offset, sortBy: { column: 'name', order: 'asc' },
        })).json()
        if (!Array.isArray(page) || page.length > 100) throw new Error('Invalid storage listing')
        for (const item of page) {
          if (!item || typeof item.name !== 'string' || !item.name ||
            item.name.includes('/') || item.name === '.' || item.name === '..') {
            throw new Error('Invalid object name in storage listing')
          }
          const name = prefix ? `${prefix}/${item.name}` : item.name
          if (item.id === null && item.metadata === null) {
            prefixes.push(name)
          } else {
            if (typeof item.id !== 'string' || !Number.isSafeInteger(item.metadata?.size) ||
              item.metadata.size < 0) throw new Error('Missing object identity or size')
            files.push({ bucket, name, id: item.id, updatedAt: item.updated_at, metadata: item.metadata })
          }
        }
        state.offset = offset + 100
        if (page.length < 100) {
          prefixes.shift()
          seen.add(prefix)
          state.seen = [...seen]
          state.offset = 0
        }
        if (persist) await saveJson('inventory.json', checkpoint)
        if (page.length < 100) break
      }
      if (seen.size % 25 === 0) await report(`${bucket}: ${seen.size} folders scanned, ${files.length} objects found`)
    }
    files.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    if (new Set(files.map(file => file.name)).size !== files.length) {
      throw new Error('Duplicate objects in storage listing')
    }
    state.complete = true
    if (persist) await saveJson('inventory.json', checkpoint)
    return files
  }

  try {
    const bucketInfo = await (await request('bucket')).json()
    if (!Array.isArray(bucketInfo) || buckets.some(id => !bucketInfo.some(bucket => bucket.id === id))) {
      throw new Error('The three expected ArtMuse buckets are not all accessible')
    }
    manifest.buckets = bucketInfo.filter(bucket => buckets.includes(bucket.id))
    delete manifest.failedAt
    delete manifest.failure
    await saveManifest()
    const inventories = new Map()
    for (const bucket of buckets) {
      const files = suppliedInventory
        ? suppliedInventory.files.filter(file => file.bucket === bucket)
        : await inventory(bucket, true)
      inventories.set(bucket, files)
      await report(`${bucket}: ${files.length} objects to download or verify`)
      for (const file of files) {
        // Hash-based filenames preserve arbitrary Storage paths on Windows via the manifest.
        const localFile = `${digest(JSON.stringify([bucket, file.name]))}.bin`
        const target = join(directory, 'objects', localFile)
        const saved = manifest.files.find(entry => entry.localFile === localFile)
        if (saved) {
          let actual
          try {
            actual = await fileDigest(target)
          } catch (error) {
            if (error.code !== 'ENOENT') throw error
          }
          if (actual && actual.bytes === saved.bytes && actual.sha256 === saved.sha256 &&
            saved.id === file.id && Date.parse(saved.updatedAt) === Date.parse(file.updatedAt) &&
            isDeepStrictEqual(saved.metadata, file.metadata)) continue
          if (inventoryFile && actual && actual.sha256 === saved.sha256 && actual.bytes === saved.bytes) {
            throw new Error('An existing object changed; preserve its version before updating this backup')
          }
          await report(`Local object missing or corrupt; downloading again: ${localFile}`)
          manifest.files = manifest.files.filter(entry => entry.localFile !== localFile)
        }
        await rm(`${target}.partial`, { force: true })
        const objectPath = file.name.split('/').map(encodeURIComponent).join('/')
        const response = await request(`object/authenticated/${bucket}/${objectPath}`)
        if (!response.body) throw new Error('Storage returned an empty response body')
        const hash = createHash('sha256')
        let bytes = 0
        const meter = new Transform({
          transform(chunk, encoding, callback) {
            bytes += chunk.length
            hash.update(chunk)
            callback(null, chunk)
          },
        })
        await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(`${target}.partial`, { flags: 'wx' }))
        if (bytes !== file.metadata.size) throw new Error('Downloaded size differs from storage inventory')
        const sha256 = hash.digest('hex')
        const actual = await fileDigest(`${target}.partial`)
        if (actual.bytes !== bytes || actual.sha256 !== sha256) throw new Error('Local file verification failed')
        await replaceBackupFile(`${target}.partial`, target, { report })
        manifest.files.push({ ...file, localFile, bytes, sha256 })
        await saveManifest()
        if (manifest.files.length % 25 === 0) await report(`${manifest.files.length} files downloaded and verified`)
      }
      await saveManifest()
      await report(`${bucket}: downloaded and locally verified`)
    }
    for (const [bucket, original] of inventories) {
      if (suppliedInventory) continue
      checkpoint.verification ??= {}
      const current = await inventory(
        bucket,
        true,
        checkpoint.verification[bucket] ??= { files: [], prefixes: [''], seen: [], offset: 0, complete: false }
      )
      if (JSON.stringify(current) !== JSON.stringify(original)) {
        delete checkpoint[bucket]
        delete checkpoint.verification[bucket]
        await saveJson('inventory.json', checkpoint)
        throw new Error(`Storage inventory changed during backup for ${bucket}; run again during a quiet period`)
      }
    }
    if (suppliedInventory) {
      const expectedNames = new Set(suppliedInventory.files.map(file => JSON.stringify([file.bucket, file.name])))
      if (manifest.files.some(file => !expectedNames.has(JSON.stringify([file.bucket, file.name])))) {
        throw new Error('Supplied inventory omits saved objects; preserve deleted versions before reconciliation')
      }
      await saveJson('source-inventory.json', suppliedInventory)
      manifest.inventoryCapturedAt = suppliedInventory.capturedAt
      manifest.validationBasis = 'Files matched to a read-only SQL inventory; not an atomic Storage snapshot or tested restore'
    }
    const expected = new Set([...inventories.values()].flat().map(file => digest(JSON.stringify([file.bucket, file.name])) + '.bin'))
    manifest.files = manifest.files.filter(file => expected.has(file.localFile))
    if (manifest.files.length !== expected.size) throw new Error('Backup object count does not match the inventory')
    manifest.complete = true
    manifest.finishedAt = new Date().toISOString()
    await saveManifest()
    const stats = await verifyStorageBackup(directory)
    await report(`COMPLETE: ${stats.files} files, ${stats.bytes} bytes. Storage only; database and SharePoint are not included.`)
    return { directory, ...stats }
  } catch (error) {
    manifest.complete = false
    manifest.failedAt = new Date().toISOString()
    manifest.failure = String(error.message).replaceAll(key, '[REDACTED]')
    await saveManifest()
    await report(`FAILED: ${manifest.failure}`)
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [option, value, ...extra] = process.argv.slice(2)
    if (!value || (option === '--finalize-inventory' ? extra.length !== 1 : extra.length !== 0) ||
      !['--output', '--verify', '--resume', '--finalize-inventory'].includes(option)) {
      throw new Error('Usage: node --env-file=.env.local scripts/backup-supabase-storage.mjs --output <absolute-directory> OR --resume <backup-directory> OR --verify <backup-directory>')
    }
    if (option === '--verify') {
      const stats = await verifyStorageBackup(resolve(value))
      console.log(`VERIFIED: ${stats.files} files, ${stats.bytes} bytes`)
    } else {
      await backupStorage({
        output: value, resume: ['--resume', '--finalize-inventory'].includes(option) ? value : undefined,
        inventoryFile: option === '--finalize-inventory' ? extra[0] : undefined,
        url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY,
      })
    }
  } catch (error) {
    console.error(`BACKUP FAILED: ${error.message}`)
    process.exitCode = 1
  }
}
