const GRAPH = 'https://graph.microsoft.com/v1.0'
const CHUNK_SIZE = 320 * 1024 * 10
const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024

export type SharePointItem = {
  id: string
  name: string
  size: number
  webUrl: string
  driveId: string
  mimeType: string | null
}

type GraphDriveItem = {
  id: string
  name: string
  size?: number
  webUrl?: string
  file?: { mimeType?: string }
  parentReference?: { driveId?: string }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value
  }

  const tenantId = requireEnv('SHAREPOINT_TENANT_ID')
  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: requireEnv('SHAREPOINT_CLIENT_ID'),
        client_secret: requireEnv('SHAREPOINT_CLIENT_SECRET'),
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
      cache: 'no-store',
    }
  )

  if (!res.ok) {
    throw new Error(`SharePoint authentication failed (${res.status})`)
  }

  const json = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  }
  return cachedToken.value
}

async function graphFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()
  return fetch(`${GRAPH}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    cache: 'no-store',
  })
}

async function graphJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await graphFetch(path, init)
  if (!res.ok) {
    throw new Error(`Graph request failed (${res.status}): ${await res.text()}`)
  }
  return (await res.json()) as T
}

let cachedDriveId: string | null = null

const GUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const SITE_ID_PATTERN = new RegExp(`^[a-z0-9.-]+,${GUID},${GUID}$`, 'i')

function requireSiteId(): string {
  const siteId = requireEnv('SHAREPOINT_SITE_ID').trim()
  if (!SITE_ID_PATTERN.test(siteId)) {
    throw new Error(
      'Invalid SHAREPOINT_SITE_ID: expected "<hostname>,<site-collection-guid>,<web-guid>"'
    )
  }
  return siteId
}

export async function getDefaultDriveId(): Promise<string> {
  if (cachedDriveId) return cachedDriveId
  const drive = await graphJson<{ id: string }>(
    `/sites/${requireSiteId()}/drive?$select=id`
  )
  cachedDriveId = drive.id
  return drive.id
}

export function sanitizeSegment(value: string | null | undefined, fallback = 'Sans nom'): string {
  const cleaned = (value ?? '')
    .replace(/["*:<>?/\\|#%\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/\.{2,}/g, '.')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 100)
  return cleaned || fallback
}

export function buildArtworkFolderPath(params: {
  artistName: string | null
  artworkTitle: string | null
  artworkId: string
}): string {
  const artist = sanitizeSegment(params.artistName, 'Artiste inconnu')
  const title = sanitizeSegment(params.artworkTitle, 'Sans titre')
  return `Artistes/${artist}/${title} (${params.artworkId.slice(0, 8)})`
}

function encodePath(path: string): string {
  return path.split('/').map((s) => encodeURIComponent(s).replace(/'/g, '%27')).join('/')
}

function sanitizeFileName(name: string): string {
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 && name.length - dot <= 6 ? name.slice(dot) : ''
  const base = sanitizeSegment(ext ? name.slice(0, dot) : name, 'document').slice(0, 200 - ext.length)
  return `${base}${ext}`
}

function toItem(item: GraphDriveItem, driveId: string): SharePointItem {
  return {
    id: item.id,
    name: item.name,
    size: item.size ?? 0,
    webUrl: item.webUrl ?? '',
    driveId: item.parentReference?.driveId ?? driveId,
    mimeType: item.file?.mimeType ?? null,
  }
}

export async function uploadDocument(params: {
  folderPath: string
  fileName: string
  content: ArrayBuffer
  mimeType?: string | null
}): Promise<SharePointItem> {
  const driveId = await getDefaultDriveId()
  const fileName = sanitizeFileName(params.fileName)
  const itemPath = encodePath(`${params.folderPath}/${fileName}`)
  const conflict = '@microsoft.graph.conflictBehavior=rename'
  const size = params.content.byteLength

  if (size <= SIMPLE_UPLOAD_LIMIT) {
    const item = await graphJson<GraphDriveItem>(
      `/drives/${driveId}/root:/${itemPath}:/content?${conflict}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': params.mimeType || 'application/octet-stream' },
        body: params.content,
      }
    )
    return toItem(item, driveId)
  }

  const session = await graphJson<{ uploadUrl: string }>(
    `/drives/${driveId}/root:/${itemPath}:/createUploadSession`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }),
    }
  )

  let result: GraphDriveItem | null = null
  for (let start = 0; start < size; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, size)
    // The upload URL is pre-authenticated: no Authorization header.
    const res = await fetch(session.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(end - start),
        'Content-Range': `bytes ${start}-${end - 1}/${size}`,
      },
      body: params.content.slice(start, end),
    })
    if (!res.ok) {
      await fetch(session.uploadUrl, { method: 'DELETE' }).catch(() => undefined)
      throw new Error(`SharePoint chunk upload failed (${res.status})`)
    }
    if (end === size) result = (await res.json()) as GraphDriveItem
  }

  if (!result) throw new Error('SharePoint upload did not complete')
  return toItem(result, driveId)
}

export async function deleteDocument(driveId: string, itemId: string): Promise<void> {
  const res = await graphFetch(`/drives/${driveId}/items/${itemId}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) {
    throw new Error(`SharePoint delete failed (${res.status})`)
  }
}

export async function getShareLink(driveId: string, itemId: string): Promise<string> {
  const json = await graphJson<{ link: { webUrl: string } }>(
    `/drives/${driveId}/items/${itemId}/createLink`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'view', scope: 'organization' }),
    }
  )
  return json.link.webUrl
}

export async function listArtworkDocuments(folderPath: string): Promise<SharePointItem[]> {
  const driveId = await getDefaultDriveId()
  const res = await graphFetch(`/drives/${driveId}/root:/${encodePath(folderPath)}:/children`)
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`SharePoint list failed (${res.status})`)
  const json = (await res.json()) as { value: GraphDriveItem[] }
  return json.value.filter((i) => i.file).map((i) => toItem(i, driveId))
}

export async function downloadDocument(driveId: string, itemId: string): Promise<Response> {
  const res = await graphFetch(`/drives/${driveId}/items/${itemId}/content`)
  if (!res.ok || !res.body) {
    throw new Error(`SharePoint download failed (${res.status})`)
  }
  return res
}
