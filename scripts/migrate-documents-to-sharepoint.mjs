// Copies legacy OneDrive/SharePoint document links into the ArtMuse SharePoint library.
// Usage: node --env-file=.env.local scripts/migrate-documents-to-sharepoint.mjs [--apply] [--limit N] [--artist text] [--market] [--recover]
// --market: migrate Market documents into Markets/<section>. --recover: search by file name when a link no longer resolves.
import { mkdirSync, appendFileSync } from 'node:fs'

const e = process.env
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const argValue = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const LIMIT = argValue('--limit') ? Number(argValue('--limit')) : Infinity
const ARTIST = argValue('--artist')?.toLowerCase()
const MARKET = args.includes('--market')
const RECOVER = args.includes('--recover')

for (const k of [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SHAREPOINT_TENANT_ID',
  'SHAREPOINT_CLIENT_ID',
  'SHAREPOINT_CLIENT_SECRET',
  'SHAREPOINT_SITE_ID',
]) {
  if (!e[k]) throw new Error(`Missing ${k}`)
}

const GRAPH = 'https://graph.microsoft.com/v1.0'
const CHUNK = 320 * 1024 * 10
const SIMPLE_LIMIT = 4 * 1024 * 1024
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

mkdirSync('migration-logs', { recursive: true })
const logFile = `migration-logs/migration-${new Date().toISOString().replace(/[:.]/g, '-')}${APPLY ? '' : '-dryrun'}.csv`
const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
function log(row) {
  appendFileSync(logFile, row.map(csv).join(',') + '\n')
  console.log(row.join(' | '))
}
appendFileSync(logFile, 'document_id,status,legacy_url,destination,detail\n')

let token = null
let tokenExp = 0
async function getToken() {
  if (token && tokenExp > Date.now() + 60_000) return token
  const r = await fetch(`https://login.microsoftonline.com/${e.SHAREPOINT_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: e.SHAREPOINT_CLIENT_ID,
      client_secret: e.SHAREPOINT_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  if (!r.ok) throw new Error(`Token request failed (${r.status})`)
  const j = await r.json()
  token = j.access_token
  tokenExp = Date.now() + j.expires_in * 1000
  return token
}

async function gfetch(path, init = {}, tries = 6) {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(path.startsWith('http') ? path : `${GRAPH}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await getToken()}`, ...(init.headers ?? {}) },
    })
    if ((r.status === 429 || r.status === 503 || r.status === 504) && attempt < tries) {
      const wait = Number(r.headers.get('retry-after') ?? 0) * 1000 || 2000 * attempt
      await sleep(wait)
      continue
    }
    return r
  }
}

const sb = (path, init = {}) =>
  fetch(`${e.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: e.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

function sanitize(value, fallback = 'Sans nom') {
  const cleaned = (value ?? '')
    .replace(/["*:<>?/\\|#%\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/\.{2,}/g, '.')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 100)
  return cleaned || fallback
}
const encodePath = (p) => p.split('/').map((s) => encodeURIComponent(s).replace(/'/g, '%27')).join('/')

function sanitizeFileName(name) {
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 && name.length - dot <= 6 ? name.slice(dot) : ''
  const base = sanitize(ext ? name.slice(0, dot) : name, 'document').slice(0, 200 - ext.length)
  return `${base}${ext}`
}

async function resolveSource(rawUrl) {
  let url = rawUrl
  if (new URL(url).hostname === '1drv.ms') {
    const r = await fetch(url, { redirect: 'manual' })
    url = r.headers.get('location') ?? url
  }
  const enc =
    'u!' + Buffer.from(url).toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')
  const r = await gfetch(`/shares/${enc}/driveItem?$select=id,name,size,file,folder,parentReference`)
  if (!r.ok) throw new Error(`resolve failed (${r.status})`)
  const item = await r.json()
  if (item.folder || !item.file) throw new Error('not a file')
  return item
}

let destDriveId = null
async function getDestDrive() {
  if (destDriveId) return destDriveId
  const r = await gfetch(`/sites/${e.SHAREPOINT_SITE_ID}/drive?$select=id`)
  if (!r.ok) throw new Error(`destination drive failed (${r.status})`)
  destDriveId = (await r.json()).id
  return destDriveId
}

async function upload(folderPath, fileName, buffer, mimeType) {
  const driveId = await getDestDrive()
  const itemPath = encodePath(`${folderPath}/${sanitizeFileName(fileName)}`)
  const conflict = '@microsoft.graph.conflictBehavior=rename'

  if (buffer.byteLength <= SIMPLE_LIMIT) {
    const r = await gfetch(`/drives/${driveId}/root:/${itemPath}:/content?${conflict}`, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType || 'application/octet-stream' },
      body: buffer,
    })
    if (!r.ok) throw new Error(`upload failed (${r.status})`)
    return { ...(await r.json()), driveId }
  }

  const s = await gfetch(`/drives/${driveId}/root:/${itemPath}:/createUploadSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }),
  })
  if (!s.ok) throw new Error(`upload session failed (${s.status})`)
  const { uploadUrl } = await s.json()

  let result = null
  for (let start = 0; start < buffer.byteLength; start += CHUNK) {
    const end = Math.min(start + CHUNK, buffer.byteLength)
    const r = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(end - start),
        'Content-Range': `bytes ${start}-${end - 1}/${buffer.byteLength}`,
      },
      body: buffer.subarray(start, end),
    })
    if (!r.ok) {
      await fetch(uploadUrl, { method: 'DELETE' }).catch(() => {})
      throw new Error(`chunk upload failed (${r.status})`)
    }
    if (end === buffer.byteLength) result = await r.json()
  }
  if (!result) throw new Error('upload incomplete')
  return { ...result, driveId }
}

const siteIndexCache = new Map()

// Drive search is denied for app-only tokens, so list the whole library with delta instead.
async function buildSiteIndex(hostname, site) {
  const dr = await gfetch(`/sites/${hostname}:/sites/${site}:/drive?$select=id`)
  if (!dr.ok) throw new Error(`recover: site drive failed (${dr.status})`)
  const driveId = (await dr.json()).id

  const all = new Map()
  let next = `/drives/${driveId}/root/delta?$select=id,name,size,file,folder,parentReference`
  while (next) {
    const r = await gfetch(next)
    if (!r.ok) throw new Error(`recover: listing failed (${r.status})`)
    const j = await r.json()
    for (const i of j.value) all.set(i.id, i)
    next = j['@odata.nextLink'] ?? null
  }

  const pathOf = (item) => {
    const parts = []
    let cur = all.get(item.parentReference?.id)
    while (cur && cur.parentReference?.id) {
      parts.unshift(cur.name)
      cur = all.get(cur.parentReference.id)
    }
    return `/${parts.join('/')}`
  }

  const byName = new Map()
  for (const i of all.values()) {
    if (!i.file) continue
    i.parentReference = { ...i.parentReference, driveId }
    const k = i.name.toLowerCase()
    byName.set(k, [...(byName.get(k) ?? []), i])
  }
  console.log(`Indexed ${all.size} items for ${hostname}/${site}`)
  return { byName, pathOf }
}

function fileNameFromUrl(rawUrl) {
  const u = new URL(rawUrl)
  const fromId = u.searchParams.get('id')
  const path = fromId ?? decodeURIComponent(u.pathname)
  const last = path.split('/').filter(Boolean).pop() ?? ''
  return /\.[A-Za-z0-9]{2,5}$/.test(last) ? last : null
}

async function searchSource(d) {
  const u = new URL(d.legacy_url)
  const site = decodeURIComponent(u.pathname).match(/\/sites\/([^/]+)/)?.[1]
  const name = fileNameFromUrl(d.legacy_url)
  if (!site || !name) throw new Error('recover: no site or file name in url')

  const key = `${u.hostname}/${site}`
  if (!siteIndexCache.has(key)) {
    siteIndexCache.set(key, await buildSiteIndex(u.hostname, site))
  }
  const { byName, pathOf } = siteIndexCache.get(key)

  let hits = byName.get(name.toLowerCase()) ?? []
  if (hits.length === 0) throw new Error('recover: not found')
  if (hits.length > 1) {
    const lastName = d.artworks?.artists?.last_name?.toLowerCase()
    const narrowed = lastName ? hits.filter((i) => pathOf(i).toLowerCase().includes(lastName)) : []
    if (narrowed.length === 1) hits = narrowed
  }
  if (hits.length > 1) {
    throw new Error(`recover: ambiguous (${hits.length}): ${hits.map(pathOf).join(' ; ')}`)
  }
  return hits[0]
}

async function getSource(d) {
  try {
    return await resolveSource(d.legacy_url)
  } catch (err) {
    if (!RECOVER || !/\((403|404)\)/.test(err.message)) throw err
    return await searchSource(d)
  }
}

function buildFolder(d) {
  if (MARKET) {
    const title = d.market_section_items?.market_sections?.title
    return `Markets/${sanitize(title, 'Sans section')}`
  }
  const a = d.artworks?.artists
  const artistName = a ? [a.last_name, a.first_name].filter(Boolean).join(' ') : null
  return `Artistes/${sanitize(artistName, 'Artiste inconnu')}/${sanitize(d.artworks?.title, 'Sans titre')} (${d.artwork_id.slice(0, 8)})`
}

const select = MARKET
  ? 'select=id,market_section_item_id,label,url,legacy_url,market_section_items!documents_market_section_item_id_fkey(label,market_sections(title))'
  : 'select=id,artwork_id,label,url,legacy_url,artworks!documents_artwork_id_fkey(title,artists(first_name,last_name))'
const filter = MARKET
  ? 'storage_provider=eq.legacy&legacy_url=not.is.null&market_section_item_id=not.is.null'
  : 'storage_provider=eq.legacy&document_type=neq.image&legacy_url=not.is.null&artwork_id=not.is.null'
const res = await sb(`documents?${select}&${filter}&order=id.asc&limit=5000`)
const all = await res.json()
if (!Array.isArray(all)) throw new Error(JSON.stringify(all))

const candidates = all.filter((d) => {
  let host = ''
  try {
    host = new URL(d.legacy_url).hostname
  } catch {
    return false
  }
  if (!(host.endsWith('.sharepoint.com') || host === '1drv.ms')) return false
  if (!ARTIST) return true
  const a = d.artworks?.artists
  return [a?.last_name, a?.first_name].filter(Boolean).join(' ').toLowerCase().includes(ARTIST)
})

console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'}: ${candidates.length} candidates (limit ${LIMIT})`)

const stats = { ok: 0, skipped: 0, failed: 0 }
let processed = 0
for (const d of candidates) {
  if (processed >= LIMIT) break
  processed++

  const folder = buildFolder(d)

  try {
    const source = await getSource(d)
    const destination = `${folder}/${source.name}`

    if (!APPLY) {
      log([d.id, 'would-migrate', d.legacy_url, destination, `${source.size} bytes`])
      stats.ok++
      continue
    }

    const dl = await gfetch(`/drives/${source.parentReference.driveId}/items/${source.id}/content`)
    if (!dl.ok) throw new Error(`download failed (${dl.status})`)
    const buffer = Buffer.from(await dl.arrayBuffer())
    const mimeType = source.file.mimeType ?? dl.headers.get('content-type')

    const item = await upload(folder, source.name, buffer, mimeType)

    const patch = await sb(`documents?id=eq.${d.id}&storage_provider=eq.legacy`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        storage_provider: 'sharepoint',
        url: `/api/documents/${d.id}/open`,
        sharepoint_drive_id: item.driveId,
        sharepoint_item_id: item.id,
        sharepoint_web_url: item.webUrl,
        file_name: item.name,
        mime_type: mimeType,
        size_bytes: item.size,
      }),
    })
    if (!patch.ok) throw new Error(`db update failed (${patch.status}); file uploaded as ${item.id}`)

    log([d.id, 'migrated', d.legacy_url, `${folder}/${item.name}`, `${item.size} bytes`])
    stats.ok++
  } catch (err) {
    const skipped = err.message === 'not a file'
    log([d.id, skipped ? 'skipped' : 'failed', d.legacy_url, folder, err.message])
    stats[skipped ? 'skipped' : 'failed']++
  }
}

console.log(`Done: ${stats.ok} ok, ${stats.skipped} skipped, ${stats.failed} failed. Log: ${logFile}`)
