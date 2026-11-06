import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { replaceBackupFile } from './backup-supabase-storage.mjs'

const source = 'https://cdbtgjhbgswpdehqwjnn.supabase.co'
const target = 'https://sontvcvvtftvivysiccg.supabase.co'
const buckets = ['artwork-images', 'artwork-imports', 'artwork-thumbnails']
const backupRoot = '\\\\SERVEUR\\Company\\9010 BASES\\artmuse\\sauvegarde'
const defaultBackup = join(backupRoot, 'supabase-storage-2026-10-27T13-45-20-448Z-06400167')
const digest = value => createHash('sha256').update(value).digest('hex')

export async function testRestoreStorage({
  backup = defaultBackup, output = backupRoot, execute = false, key,
  fetchImpl = fetch, log = console.log,
} = {}) {
  if (!isAbsolute(backup) || !isAbsolute(output)) {
    throw new Error('Absolute backup and report directory paths are required')
  }
  if (execute && (typeof key !== 'string' || !/^sb_secret_[A-Za-z0-9_-]+$/.test(key))) {
    throw new Error('Set ARTMUSE_RESTORE_TEST_SECRET_KEY to the test project secret key (sb_secret_...), locally only')
  }
  const manifest = JSON.parse(await readFile(join(backup, 'manifest.json'), 'utf8'))
  if (manifest.version !== 1 || manifest.complete !== true || manifest.source !== source ||
    !Array.isArray(manifest.files)) {
    throw new Error('A complete Storage backup from the expected production project is required')
  }
  const selected = []
  for (const bucket of buckets) {
    const candidates = manifest.files.filter(file => file.bucket === bucket)
    if (candidates.some(file => !Number.isSafeInteger(file.bytes) || file.bytes < 0)) {
      throw new Error(`Invalid file sizes in ${bucket}`)
    }
    candidates.sort((a, b) => a.bytes - b.bytes || String(a.localFile).localeCompare(String(b.localFile)))
    const sample = candidates.filter(file => file.bytes > 0).slice(0, 3)
    if (sample.length !== 3) throw new Error(`Three non-empty files are required in ${bucket}`)
    selected.push(...sample)
  }
  const identities = new Set()
  const payloads = []
  for (const file of selected) {
    if (typeof file.name !== 'string' || !file.name ||
      file.name.split('/').some(part => !part || part === '.' || part === '..') ||
      !/^[a-f0-9]{64}\.bin$/.test(file.localFile) ||
      file.localFile !== `${digest(JSON.stringify([file.bucket, file.name]))}.bin` ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      identities.has(file.localFile)) {
      throw new Error('Invalid or duplicate sample object in backup manifest')
    }
    identities.add(file.localFile)
    const data = await readFile(join(backup, 'objects', file.localFile))
    if (data.length !== file.bytes || digest(data) !== file.sha256) {
      throw new Error(`Local sample hash/size mismatch: ${file.localFile}`)
    }
    payloads.push(data)
  }

  const run = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
  const directory = join(output, `storage-restore-test-${run}`)
  await mkdir(directory, { recursive: true })
  const report = {
    version: 1, source, target, startedAt: new Date().toISOString(),
    selection: 'Three smallest non-empty files per bucket',
    executed: execute, sampleRestorePassed: false, fullRestoreTested: false,
    buckets: buckets.map((bucket, index) => ({
      source: bucket, target: `restore-sample-${run}-${index + 1}`, created: false, privateVerified: false,
    })),
    files: selected.map(file => ({
      bucket: file.bucket, name: file.name, localFile: file.localFile,
      bytes: file.bytes, sha256: file.sha256, verified: false,
    })),
  }
  async function save() {
    const path = join(directory, 'result.json')
    await writeFile(`${path}.tmp`, JSON.stringify(report, null, 2))
    await replaceBackupFile(`${path}.tmp`, path)
  }
  await save()
  log(`Private sample report: ${directory}`)
  log(`Target: ${target}; 9 files, ${payloads.reduce((sum, data) => sum + data.length, 0)} bytes`)
  if (!execute) {
    log('PREPARED: local sample hashes verified. No network request or restore performed.')
    return { directory, report }
  }

  async function request(path, { method = 'GET', body, contentType } = {}) {
    let response
    try {
      response = await fetchImpl(new URL(`/storage/v1/${path}`, target), {
        method, body, redirect: 'error', signal: AbortSignal.timeout(120_000),
        headers: {
          apikey: key,
          ...(contentType ? { 'Content-Type': contentType } : {}),
          ...(method === 'POST' && path.startsWith('object/') ? { 'x-upsert': 'false' } : {}),
        },
      })
    } catch {
      throw new Error('Test Storage request failed or timed out; remote writes may have completed. See the private report; no automatic retry.')
    }
    if (!response.ok) {
      const status = response.status
      await response.body?.cancel()
      throw new Error(`Test Storage returned HTTP ${status}. Stop and inspect the private report; no automatic retry.`)
    }
    return response
  }
  async function verifyPrivateBucket(id) {
    const response = await request(`bucket/${encodeURIComponent(id)}`)
    let info
    try {
      info = await response.json()
    } catch {
      throw new Error('Invalid test Storage bucket response')
    }
    if (info.id !== id || info.public !== false) {
      throw new Error('Target bucket identity/privacy verification failed; restore stopped')
    }
  }
  try {
    for (const bucket of report.buckets) {
      const response = await request('bucket', {
        method: 'POST', contentType: 'application/json',
        body: JSON.stringify({ id: bucket.target, name: bucket.target, public: false }),
      })
      bucket.created = true
      await response.body?.cancel()
      await save()
      await verifyPrivateBucket(bucket.target)
      bucket.privateVerified = true
      await save()
    }
    for (const [index, file] of report.files.entries()) {
      const bucket = report.buckets.find(item => item.source === file.bucket)
      const objectPath = `${encodeURIComponent(bucket.target)}/${file.name.split('/').map(encodeURIComponent).join('/')}`
      const mime = selected[index].metadata?.mimetype
      const response = await request(`object/${objectPath}`, {
        method: 'POST', body: payloads[index],
        contentType: typeof mime === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(mime) ? mime : 'application/octet-stream',
      })
      await response.body?.cancel()
      const downloaded = await request(`object/authenticated/${objectPath}`)
      const actual = Buffer.from(await downloaded.arrayBuffer())
      if (actual.length !== file.bytes || digest(actual) !== file.sha256) {
        throw new Error(`Restored sample hash/size mismatch: ${file.localFile}`)
      }
      file.verified = true
      await save()
      log(`Verified sample ${index + 1}/9`)
    }
    for (const bucket of report.buckets) await verifyPrivateBucket(bucket.target)
    report.sampleRestorePassed = true
    report.finishedAt = new Date().toISOString()
    await save()
    log('PASSED: 9 restored files re-downloaded with matching SHA-256 and sizes; all 3 buckets private. Full restoration is NOT yet tested.')
    return { directory, report }
  } catch (error) {
    report.error = error.message.replaceAll(key, '[REDACTED]')
    report.finishedAt = new Date().toISOString()
    await save()
    throw new Error(report.error)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2)
    if (args.length > 1 || (args.length === 1 && args[0] !== '--execute')) {
      throw new Error('Usage: node [--env-file=.env.restore-test.local] scripts\\test-restore-storage.mjs [--execute]')
    }
    await testRestoreStorage({
      execute: args[0] === '--execute', key: process.env.ARTMUSE_RESTORE_TEST_SECRET_KEY,
    })
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
