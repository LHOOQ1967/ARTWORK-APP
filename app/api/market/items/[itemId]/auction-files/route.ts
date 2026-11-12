import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { deleteDocument, ensureFolderPath, sanitizeSegment, uploadDocument } from '@/lib/sharepoint'

const MAX_FILE_SIZE = 100 * 1024 * 1024

async function auctionItem(itemId: string, request: Request) {
  const authorization = await requireRole(['Editor', 'Administrator'], request)
  if (authorization.response) return { response: authorization.response }
  const { data, error } = await authorization.supabase.from('market_section_items')
    .select('id, section_id, market_sections(title, category)').eq('id', itemId).maybeSingle()
  if (error) return { response: NextResponse.json({ error: error.message }, { status: 500 }) }
  const section = Array.isArray(data?.market_sections) ? data.market_sections[0] : data?.market_sections
  if (!data || !section || section.category !== 'Ventes aux enchères') {
    return { response: NextResponse.json({ error: 'Auction sale not found' }, { status: 404 }) }
  }
  return { authorization, item: data, section }
}

export async function POST(request: Request, context: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await context.params
  const result = await auctionItem(itemId, request)
  if (result.response) return result.response
  const { authorization, item, section } = result
  const form = await request.formData()
  const kind = form.get('kind')
  const file = form.get('file')
  if ((kind !== 'catalogue' && kind !== 'result') || !(file instanceof File) || !file.name.toLowerCase().endsWith('.pdf') || file.size === 0) {
    return NextResponse.json({ error: 'Select a PDF file and a valid document type.' }, { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'File too large. Maximum size: 100 MB.' }, { status: 413 })
  const content = await file.arrayBuffer()
  if (new TextDecoder().decode(content.slice(0, 5)) !== '%PDF-') {
    return NextResponse.json({ error: 'The selected file is not a valid PDF.' }, { status: 400 })
  }
  const db = authorization.supabase
  const { data: link, error: linkError } = await db.from('market_auction_file_links')
    .select('file_id').eq('item_id', itemId).eq('kind', kind).maybeSingle()
  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 })
  let previous: { sharepoint_drive_id: string; sharepoint_item_id: string } | null = null
  if (link) {
    const { data, error } = await db.from('market_auction_files')
      .select('sharepoint_drive_id, sharepoint_item_id').eq('id', link.file_id).maybeSingle()
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Existing document not found.' }, { status: 500 })
    previous = data
  }

  let uploaded
  try {
    const folderPath = `Markets/${sanitizeSegment(section.title, 'Section')}`
    await ensureFolderPath(folderPath)
    uploaded = await uploadDocument({
      folderPath,
      fileName: `${crypto.randomUUID()}-${file.name}`,
      content,
      mimeType: 'application/pdf',
    })
  } catch (error) {
    console.error('MARKET AUCTION PDF UPLOAD ERROR:', error)
    return NextResponse.json({ error: 'SharePoint upload failed.' }, { status: 502 })
  }
  const metadata = {
    file_name: file.name,
    sharepoint_drive_id: uploaded.driveId,
    sharepoint_item_id: uploaded.id,
  }
  const fileId = link?.file_id ?? crypto.randomUUID()
  const write = link
    ? db.from('market_auction_files').update(metadata).eq('id', fileId)
      .eq('sharepoint_drive_id', previous!.sharepoint_drive_id)
      .eq('sharepoint_item_id', previous!.sharepoint_item_id).select('id').maybeSingle()
    : db.from('market_auction_files').insert({ id: fileId, section_id: item.section_id, kind, ...metadata }).select('id').maybeSingle()
  const { data: saved, error: saveError } = await write
  if (saveError || !saved) {
    try {
      await deleteDocument(uploaded.driveId, uploaded.id)
    } catch (cleanupError) {
      console.error('MARKET AUCTION PDF CLEANUP ERROR:', cleanupError)
      return NextResponse.json({ error: 'Document could not be saved and the uploaded file could not be removed from SharePoint.' }, { status: 500 })
    }
    return NextResponse.json({ error: saveError?.message ?? 'Document was not saved.' }, { status: 500 })
  }
  if (!link) {
    const { error } = await db.from('market_auction_file_links').insert({ item_id: itemId, section_id: item.section_id, kind, file_id: fileId })
    if (error) {
      const { error: rollbackError } = await db.from('market_auction_files').delete().eq('id', fileId)
      try {
        await deleteDocument(uploaded.driveId, uploaded.id)
      } catch (cleanupError) {
        console.error('MARKET AUCTION PDF CLEANUP ERROR:', cleanupError)
        return NextResponse.json({ error: 'Document could not be linked and the uploaded file could not be removed from SharePoint.' }, { status: 500 })
      }
      if (rollbackError) console.error('MARKET AUCTION PDF METADATA CLEANUP ERROR:', rollbackError)
      return NextResponse.json({ error: rollbackError ? 'Document could not be linked or cleaned up.' : error.message }, { status: 500 })
    }
  }
  if (previous) {
    try {
      await deleteDocument(previous.sharepoint_drive_id, previous.sharepoint_item_id)
    } catch (error) {
      console.error('MARKET AUCTION OLD PDF CLEANUP ERROR:', previous, error)
      return NextResponse.json({ error: 'The new PDF was saved, but the previous SharePoint file could not be removed.' }, { status: 502 })
    }
  }
  return NextResponse.json({ id: fileId })
}

export async function PUT(request: Request, context: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await context.params
  const result = await auctionItem(itemId, request)
  if (result.response) return result.response
  const body: unknown = await request.json()
  if (!body || typeof body !== 'object' || !('fileId' in body) || typeof body.fileId !== 'string') {
    return NextResponse.json({ error: 'Select a catalogue.' }, { status: 400 })
  }
  const db = result.authorization.supabase
  const { data: existing, error: existingError } = await db.from('market_auction_file_links')
    .select('file_id').eq('item_id', itemId).eq('kind', 'catalogue').maybeSingle()
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
  if (existing) return NextResponse.json({ error: 'Delete the existing catalogue before selecting another.' }, { status: 409 })
  const { data, error } = await db.from('market_auction_files').select('id')
    .eq('id', body.fileId).eq('section_id', result.item.section_id).eq('kind', 'catalogue').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Catalogue not found in this section.' }, { status: 404 })
  const { error: updateError } = await db.from('market_auction_file_links').insert({
    item_id: itemId, section_id: result.item.section_id, kind: 'catalogue', file_id: data.id,
  })
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ id: data.id })
}
