
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { deleteDocument as deleteSharePointDocument } from '@/lib/sharepoint'
import { parseDocumentAccess, type DocumentAccess } from '@/lib/documentVisibility'
import { isDocumentCategory, type DocumentCategory } from '@/lib/documentCategory'
import { scheduleThumbnailCleanup, scheduleThumbnailGeneration } from '@/lib/scheduleThumbnailCleanup'

type RouteParams = {
  id: string
  documentId: string
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  const { id } = await context.params
  const authorization = await requireRole(['Editor', 'Administrator'])
  if (authorization.response) {
    return authorization.response
  }

  const body = await req.json()
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid document payload' }, { status: 400 })
  }
  const accessResult = parseDocumentAccess(body)
  const category = body.link_category === undefined ? 'general' : body.link_category
  if (!isDocumentCategory(category)) {
    return NextResponse.json({ error: 'Invalid link category' }, { status: 400 })
  }
  if ('error' in accessResult) {
    return NextResponse.json({ error: accessResult.error }, { status: 400 })
  }

  const { data, error } = await authorization.supabase
    .from('documents')
    .insert({
      artwork_id: id,
      ...accessResult.access,
      link_category: category,
      document_type: body.document_type,
      label: body.label,
      url: body.url,
      position: body.position,
    })
    .select()
    .single()

  if (error) {
    console.error('INSERT DOCUMENT ERROR:', error)
    return NextResponse.json(error, { status: 400 })
  }

  if (body.document_type === 'image' && typeof body.url === 'string') {
    scheduleThumbnailGeneration(authorization.supabase, body.url)
  }
  return NextResponse.json(data)
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  const { id, documentId } = await context.params
  const authorization = await requireRole(['Editor', 'Administrator'])
  if (authorization.response) {
    return authorization.response
  }

  const { data: existing } = await authorization.supabase
    .from('documents')
    .select('storage_provider, sharepoint_drive_id, sharepoint_item_id')
    .eq('id', documentId)
    .eq('artwork_id', id)
    .maybeSingle()

  if (existing?.storage_provider === 'sharepoint') {
    try {
      await deleteSharePointDocument(existing.sharepoint_drive_id, existing.sharepoint_item_id)
    } catch (err) {
      console.error('SHAREPOINT DELETE ERROR:', err)
      return NextResponse.json({ error: 'SharePoint delete failed' }, { status: 502 })
    }
  }

  const { error } = await authorization.supabase
    .from('documents')
    .delete()
    .eq('id', documentId)
    .eq('artwork_id', id)

  if (error) {
    console.error('DELETE DOCUMENT ERROR:', error)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  scheduleThumbnailCleanup()
  return NextResponse.json({ success: true })
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  const { id, documentId } = await context.params
  const authorization = await requireRole(['Editor', 'Administrator'])
  if (authorization.response) {
    return authorization.response
  }

  const body = await req.json()
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid document payload' }, { status: 400 })
  }
  const changes: { label?: string | null; link_category?: DocumentCategory } & Partial<DocumentAccess> = {}
  if ('link_category' in body) {
    if (!isDocumentCategory(body.link_category)) {
      return NextResponse.json({ error: 'Invalid link category' }, { status: 400 })
    }
    changes.link_category = body.link_category
  }
  if ('label' in body && body.label !== null && typeof body.label !== 'string') {
    return NextResponse.json({ error: 'Invalid document label' }, { status: 400 })
  }
  if ('label' in body) changes.label = body.label
  if ('visibility' in body || 'recipient_contact_id' in body) {
    if (!('visibility' in body)) {
      return NextResponse.json({ error: 'Document visibility is required' }, { status: 400 })
    }
    const result = parseDocumentAccess(body)
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
    Object.assign(changes, result.access)
  }
  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: 'No document changes provided' }, { status: 400 })
  }

  const { data, error } = await authorization.supabase
    .from('documents')
    .update(changes)
    .eq('id', documentId)
    .eq('artwork_id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(data)
}
