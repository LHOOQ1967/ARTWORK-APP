
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { deleteDocument as deleteSharePointDocument } from '@/lib/sharepoint'

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

  const { data, error } = await authorization.supabase
    .from('documents')
    .insert({
      artwork_id: id,
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
  if (body.label !== null && typeof body.label !== 'string') {
    return NextResponse.json({ error: 'Invalid document label' }, { status: 400 })
  }

  const { data, error } = await authorization.supabase
    .from('documents')
    .update({
      label: body.label ?? null,
    })
    .eq('id', documentId)
    .eq('artwork_id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(data)
}
