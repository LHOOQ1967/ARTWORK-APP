import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { parseQuoteInput } from '@/lib/transports'
import { buildArtworkFolderPath, deleteDocument, uploadDocument } from '@/lib/sharepoint'

const EDITOR_ROLES = ['Editor', 'Administrator'] as const

type Params = { params: Promise<{ id: string; quoteId: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const authorization = await requireRole(EDITOR_ROLES, request)
  if (authorization.response) return authorization.response

  const { id, quoteId } = await params
  let body: Record<string, unknown> | null
  let file: File | undefined
  try {
    if (request.headers.get('content-type')?.includes('multipart/form-data')) {
      const form = await request.formData()
      const files = form.getAll('file')
      if (files.length !== 1 || !(files[0] instanceof File) || files[0].size === 0) {
        return NextResponse.json({ error: 'Select one non-empty quote file.' }, { status: 400 })
      }
      file = files[0]
      if (file.size > 100 * 1024 * 1024) {
        return NextResponse.json({ error: 'File too large. Maximum size: 100 MB.' }, { status: 413 })
      }
      const raw = form.get('quote')
      if (typeof raw !== 'string') {
        return NextResponse.json({ error: 'Invalid quote' }, { status: 400 })
      }
      body = JSON.parse(raw)
    } else {
      body = await request.json()
    }
  } catch {
    return NextResponse.json({ error: 'Invalid quote payload' }, { status: 400 })
  }
  const input = parseQuoteInput(body, false)
  if (!input || (!file && Object.keys(input).length === 0)) {
    return NextResponse.json({ error: 'Invalid quote' }, { status: 400 })
  }

  const { supabase } = authorization

  let uploaded: Awaited<ReturnType<typeof uploadDocument>> | undefined
  let documentId: string | undefined
  async function cleanupUpload() {
    if (documentId) {
      const { error } = await supabase.from('documents').delete().eq('id', documentId)
      if (error) {
        console.error('TRANSPORT QUOTE CLEANUP FAILED:', error)
        throw new Error('Unable to remove the unsaved quote document.')
      }
    }
    if (uploaded) {
      try {
        await deleteDocument(uploaded.driveId, uploaded.id)
      } catch (error) {
        console.error('TRANSPORT QUOTE SHAREPOINT CLEANUP FAILED:', error)
        throw new Error('Unable to remove the unsaved SharePoint quote.')
      }
    }
  }

  async function failedSave(message: string, status: number) {
    try {
      await cleanupUpload()
    } catch (error) {
      return NextResponse.json({
        error: error instanceof Error ? error.message : 'Quote file cleanup failed.',
      }, { status: 500 })
    }
    return NextResponse.json({ error: message }, { status })
  }

  if (file) {
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
      console.error('TRANSPORT QUOTE UPLOAD FAILED:', error)
      return NextResponse.json({ error: 'SharePoint upload failed.' }, { status: 502 })
    }
    documentId = crypto.randomUUID()
    const quoteUrl = `/api/documents/${documentId}/open`
    const { error: documentError } = await supabase.from('documents').insert({
      id: documentId,
      artwork_id: artwork.id,
      document_type: 'link',
      label: 'Transport quote',
      url: quoteUrl,
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
      console.error('TRANSPORT QUOTE DOCUMENT SAVE FAILED:', documentError)
      return failedSave('Unable to save quote file.', 500)
    }
    input.quote_pdf_url = quoteUrl
  }

  const { data: updated, error } = await supabase
    .from('artwork_transport_quotes')
    .update(input)
    .eq('id', quoteId)
    .eq('transport_id', id)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('QUOTE UPDATE FAILED:', error)
    return failedSave('Unable to update quote', 500)
  }
  if (!updated) {
    return failedSave('Quote not found', 404)
  }

  // Only one quote can be accepted per transport.
  if (typeof input.accepted_date === 'string') {
    const { error: clearError } = await supabase
      .from('artwork_transport_quotes')
      .update({ accepted_date: null })
      .eq('transport_id', id)
      .neq('id', quoteId)
    if (clearError) {
      console.error('QUOTE ACCEPTANCE CLEAR FAILED:', clearError)
      return NextResponse.json(
        { error: 'Quote saved, but unable to clear acceptance on the other quotes.' },
        { status: 500 }
      )
    }
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const authorization = await requireRole(EDITOR_ROLES, request)
  if (authorization.response) return authorization.response

  const { id, quoteId } = await params
  const { error } = await authorization.supabase
    .from('artwork_transport_quotes')
    .delete()
    .eq('id', quoteId)
    .eq('transport_id', id)

  if (error) {
    console.error('QUOTE DELETE FAILED:', error)
    return NextResponse.json({ error: 'Unable to delete quote' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
