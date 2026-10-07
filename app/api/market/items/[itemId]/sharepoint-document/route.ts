import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { deleteDocument, sanitizeSegment, uploadDocument } from '@/lib/sharepoint'

const MAX_FILE_SIZE = 100 * 1024 * 1024

export async function POST(
  req: Request,
  context: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await context.params
  const authorization = await requireRole(['Editor', 'Administrator'])
  if (authorization.response) return authorization.response

  const form = await req.formData()
  const file = form.get('file')
  const documentType = form.get('document_type')

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large' }, { status: 413 })
  }

  const { data: item } = await authorization.supabase
    .from('market_section_items')
    .select('id, item_type, market_sections(title)')
    .eq('id', itemId)
    .maybeSingle()

  if (!item || item.item_type !== 'document') {
    return NextResponse.json({ error: 'Market item not found' }, { status: 404 })
  }

  const sectionRaw = item.market_sections as { title: string } | { title: string }[] | null
  const section = Array.isArray(sectionRaw) ? sectionRaw[0] : sectionRaw

  let uploaded
  try {
    uploaded = await uploadDocument({
      folderPath: `Markets/${sanitizeSegment(section?.title, 'Sans section')}`,
      fileName: file.name,
      content: await file.arrayBuffer(),
      mimeType: file.type,
    })
  } catch (err) {
    console.error('SHAREPOINT MARKET UPLOAD ERROR:', err)
    return NextResponse.json({ error: 'SharePoint upload failed' }, { status: 502 })
  }

  const documentId = crypto.randomUUID()
  const { data, error } = await authorization.supabase
    .from('documents')
    .insert({
      id: documentId,
      artwork_id: null,
      market_section_item_id: itemId,
      document_type: typeof documentType === 'string' && documentType ? documentType : 'market_pdf',
      url: `/api/documents/${documentId}/open`,
      position: 0,
      storage_provider: 'sharepoint',
      sharepoint_drive_id: uploaded.driveId,
      sharepoint_item_id: uploaded.id,
      sharepoint_web_url: uploaded.webUrl,
      file_name: uploaded.name,
      mime_type: uploaded.mimeType ?? file.type ?? null,
      size_bytes: uploaded.size,
    })
    .select()
    .single()

  if (error) {
    await deleteDocument(uploaded.driveId, uploaded.id).catch(() => undefined)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(data)
}
