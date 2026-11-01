import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { parseTransportInput } from '@/lib/transports'
import { buildArtworkFolderPath, deleteDocument, uploadDocument } from '@/lib/sharepoint'

const EDITOR_ROLES = ['Editor', 'Administrator'] as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await requireRole(EDITOR_ROLES, request)
  if (authorization.response) return authorization.response

  const { id } = await params
  let body: Record<string, unknown> | null
  let file: File | undefined
  try {
    if (request.headers.get('content-type')?.includes('multipart/form-data')) {
      const form = await request.formData()
      const files = form.getAll('file')
      if (files.length !== 1 || !(files[0] instanceof File) || files[0].size === 0) {
        return NextResponse.json({ error: 'Select one non-empty invoice file.' }, { status: 400 })
      }
      file = files[0]
      if (file.size > 100 * 1024 * 1024) {
        return NextResponse.json({ error: 'File too large. Maximum size: 100 MB.' }, { status: 413 })
      }
      const raw = form.get('transport')
      if (typeof raw !== 'string') {
        return NextResponse.json({ error: 'Invalid transport' }, { status: 400 })
      }
      body = JSON.parse(raw)
    } else {
      body = await request.json()
    }
  } catch {
    return NextResponse.json({ error: 'Invalid transport payload' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid transport' }, { status: 400 })
  }
  const input = parseTransportInput(body, false)
  if (!input || (!file && Object.keys(input).length === 0)) {
    return NextResponse.json({ error: 'Invalid transport' }, { status: 400 })
  }

  const { supabase } = authorization
  const { data: transport, error: transportError } = await supabase
    .from('artwork_transports')
    .select('artwork_id')
    .eq('id', id)
    .maybeSingle()
  if (transportError) {
    console.error('TRANSPORT LOAD FAILED:', transportError)
    return NextResponse.json({ error: 'Unable to load transport' }, { status: 500 })
  }
  if (!transport) return NextResponse.json({ error: 'Transport not found' }, { status: 404 })
  if (file && input.artwork_id !== undefined && input.artwork_id !== transport.artwork_id) {
    return NextResponse.json({ error: 'Invoice uploads cannot change the transport artwork.' }, { status: 400 })
  }

  let uploaded: Awaited<ReturnType<typeof uploadDocument>> | undefined
  let documentId: string | undefined
  async function cleanupUpload() {
    if (documentId) {
      const { error } = await supabase.from('documents').delete().eq('id', documentId)
      if (error) {
        console.error('TRANSPORT INVOICE CLEANUP FAILED:', error)
        throw new Error('Unable to remove the unsaved invoice document.')
      }
    }
    if (uploaded) {
      try {
        await deleteDocument(uploaded.driveId, uploaded.id)
      } catch (error) {
        console.error('TRANSPORT INVOICE SHAREPOINT CLEANUP FAILED:', error)
        throw new Error('Unable to remove the unsaved SharePoint invoice.')
      }
    }
  }

  async function failedSave(message: string, status: number) {
    try {
      await cleanupUpload()
    } catch (error) {
      return NextResponse.json({
        error: error instanceof Error ? error.message : 'Invoice cleanup failed.',
      }, { status: 500 })
    }
    return NextResponse.json({ error: message }, { status })
  }

  if (file) {
    const { data: artwork, error: artworkError } = await supabase
      .from('artworks')
      .select('id, title, artist:artists(first_name, last_name)')
      .eq('id', transport.artwork_id)
      .maybeSingle()
    if (artworkError || !artwork) {
      return NextResponse.json({ error: 'Artwork not found' }, { status: 404 })
    }
    const artist = Array.isArray(artwork.artist) ? artwork.artist[0] : artwork.artist
    try {
      uploaded = await uploadDocument({
        folderPath: buildArtworkFolderPath({
          artworkId: artwork.id,
          artworkTitle: artwork.title,
          artistName: artist ? [artist.last_name, artist.first_name].filter(Boolean).join(' ') : null,
        }),
        fileName: file.name,
        content: await file.arrayBuffer(),
        mimeType: file.type,
      })
    } catch (error) {
      console.error('TRANSPORT INVOICE UPLOAD FAILED:', error)
      return NextResponse.json({ error: 'SharePoint upload failed.' }, { status: 502 })
    }
    documentId = crypto.randomUUID()
    const invoiceUrl = `/api/documents/${documentId}/open`
    const { error: documentError } = await supabase.from('documents').insert({
      id: documentId,
      artwork_id: artwork.id,
      document_type: 'link',
      label: 'Transport final invoice',
      url: invoiceUrl,
      visibility: 'all_clients',
      recipient_contact_id: null,
      link_category: 'general',
      storage_provider: 'sharepoint',
      sharepoint_drive_id: uploaded.driveId,
      sharepoint_item_id: uploaded.id,
      sharepoint_web_url: uploaded.webUrl,
      file_name: uploaded.name,
      mime_type: uploaded.mimeType || file.type || null,
      size_bytes: uploaded.size,
    })
    if (documentError) {
      console.error('TRANSPORT INVOICE DOCUMENT SAVE FAILED:', documentError)
      return failedSave('Unable to save invoice file.', 500)
    }
    input.final_invoice_pdf_url = invoiceUrl
  }

  const { data: updated, error } = await supabase
    .from('artwork_transports')
    .update(input)
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('TRANSPORT UPDATE FAILED:', error)
    return failedSave('Unable to update transport', 500)
  }
  if (!updated) {
    return failedSave('Transport not found', 404)
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await requireRole(EDITOR_ROLES, request)
  if (authorization.response) return authorization.response

  const { id } = await params
  const { error } = await authorization.supabase
    .from('artwork_transports')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('TRANSPORT DELETE FAILED:', error)
    return NextResponse.json({ error: 'Unable to delete transport' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
