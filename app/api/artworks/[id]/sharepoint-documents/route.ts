import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { buildArtworkFolderPath, deleteDocument, uploadDocument } from '@/lib/sharepoint'

const MAX_FILE_SIZE = 100 * 1024 * 1024

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const authorization = await requireRole(['Viewer', 'Editor', 'Administrator'])
  if (authorization.response) return authorization.response

  const { data, error } = await authorization.supabase
    .from('documents')
    .select('*')
    .eq('artwork_id', id)
    .eq('storage_provider', 'sharepoint')
    .order('position', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: artworkId } = await context.params
  const authorization = await requireRole(['Editor', 'Administrator'])
  if (authorization.response) return authorization.response

  const form = await req.formData()
  const file = form.get('file')
  const label = form.get('label')

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large' }, { status: 413 })
  }

  const { data: artwork, error: artworkError } = await authorization.supabase
    .from('artworks')
    .select('id, title, artist:artists(first_name, last_name)')
    .eq('id', artworkId)
    .maybeSingle()

  if (artworkError || !artwork) {
    return NextResponse.json({ error: 'Artwork not found' }, { status: 404 })
  }

  const artistRaw = artwork.artist as
    | { first_name: string | null; last_name: string }
    | { first_name: string | null; last_name: string }[]
    | null
  const artist = Array.isArray(artistRaw) ? artistRaw[0] : artistRaw
  const artistName = artist
    ? [artist.last_name, artist.first_name].filter(Boolean).join(' ')
    : null

  const { data: last } = await authorization.supabase
    .from('documents')
    .select('position')
    .eq('artwork_id', artworkId)
    .order('position', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  let item
  try {
    item = await uploadDocument({
      folderPath: buildArtworkFolderPath({
        artistName,
        artworkTitle: artwork.title,
        artworkId,
      }),
      fileName: file.name,
      content: await file.arrayBuffer(),
      mimeType: file.type,
    })
  } catch (err) {
    console.error('SHAREPOINT UPLOAD ERROR:', err)
    return NextResponse.json({ error: 'SharePoint upload failed' }, { status: 502 })
  }

  const documentId = crypto.randomUUID()
  const { data, error } = await authorization.supabase
    .from('documents')
    .insert({
      id: documentId,
      artwork_id: artworkId,
      document_type: 'link',
      label: typeof label === 'string' && label.trim() ? label.trim() : item.name,
      url: `/api/documents/${documentId}/open`,
      position: (last?.position ?? -1) + 1,
      storage_provider: 'sharepoint',
      sharepoint_drive_id: item.driveId,
      sharepoint_item_id: item.id,
      sharepoint_web_url: item.webUrl,
      file_name: item.name,
      mime_type: item.mimeType ?? file.type ?? null,
      size_bytes: item.size,
    })
    .select()
    .single()

  if (error) {
    await deleteDocument(item.driveId, item.id).catch(() => undefined)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(data)
}
