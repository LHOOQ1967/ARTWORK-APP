import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { logAuditEvent } from '@/lib/audit'
import { buildArtworkFolderPath, deleteDocument, uploadDocument } from '@/lib/sharepoint'
import { scheduleThumbnailGeneration } from '@/lib/scheduleThumbnailCleanup'
import type { BlondeauSheetFields } from '@/lib/blondeauSheet'

export const runtime = 'nodejs'

const MAX_PDF_SIZE = 100 * 1024 * 1024
const MAX_IMAGE_SIZE = 15 * 1024 * 1024
const ALLOWED_FIELDS = new Set([
  'title',
  'medium',
  'signature',
  'edition',
  'year_execution',
  'year_execution_start',
])

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function parseFields(value: FormDataEntryValue | null): Partial<BlondeauSheetFields> | null {
  if (typeof value !== 'string') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const entries = Object.entries(parsed)
  if (entries.some(([key]) => !ALLOWED_FIELDS.has(key))) return null

  const fields: Partial<BlondeauSheetFields> = {}
  for (const [key, fieldValue] of entries) {
    if (key === 'year_execution' || key === 'year_execution_start') {
      if (key === 'year_execution_start' && fieldValue === null) {
        fields.year_execution_start = null
        continue
      }
      if (typeof fieldValue !== 'number' || !Number.isInteger(fieldValue) || fieldValue < 1000 || fieldValue > 2100) return null
      fields[key] = fieldValue
    } else {
      if (typeof fieldValue !== 'string' || fieldValue.trim().length === 0 || fieldValue.length > 2000) return null
      const textValue = fieldValue.trim()
      switch (key) {
        case 'title':
          fields.title = textValue
          break
        case 'medium':
          fields.medium = textValue
          break
        case 'signature':
          fields.signature = textValue
          break
        case 'edition':
          fields.edition = textValue
          break
        default:
          return null
      }
    }
  }

  if (
    ('year_execution' in fields) !== ('year_execution_start' in fields) ||
    (fields.year_execution_start != null &&
      fields.year_execution != null &&
      fields.year_execution_start > fields.year_execution)
  ) return null

  return fields
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: artworkId } = await context.params
  const authorization = await requireRole(['Editor', 'Administrator'], request)
  if (authorization.response) return authorization.response
  if (!isUuid(artworkId)) return NextResponse.json({ error: 'Invalid artwork ID' }, { status: 400 })

  const form = await request.formData()
  const pdf = form.get('pdf')
  const image = form.get('image')
  const fields = parseFields(form.get('fields'))
  if (!(pdf instanceof File) || pdf.size === 0) {
    return NextResponse.json({ error: 'Select a PDF file' }, { status: 400 })
  }
  if (pdf.size > MAX_PDF_SIZE) return NextResponse.json({ error: 'PDF exceeds the 100 MB size limit' }, { status: 413 })
  if (!fields) return NextResponse.json({ error: 'Invalid selected artwork changes' }, { status: 400 })
  if (image !== null && (!(image instanceof File) || image.size === 0 || image.size > MAX_IMAGE_SIZE || image.type !== 'image/png')) {
    return NextResponse.json({ error: 'The extracted artwork image must be a PNG no larger than 15 MB' }, { status: 400 })
  }

  const pdfBytes = Buffer.from(await pdf.arrayBuffer())
  if (pdfBytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
    return NextResponse.json({ error: 'The selected file is not a valid PDF' }, { status: 400 })
  }
  const imageBytes = image instanceof File ? Buffer.from(await image.arrayBuffer()) : null
  if (imageBytes && imageBytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    return NextResponse.json({ error: 'The extracted image is not a valid PNG' }, { status: 400 })
  }

  const { supabase, userId } = authorization
  const { data: artwork, error: artworkError } = await supabase
    .from('artworks')
    .select('id,title,artist_id,medium,signature,edition,year_execution,year_execution_start,artist:artists(first_name,last_name)')
    .eq('id', artworkId)
    .maybeSingle()
  if (artworkError) {
    await logAuditEvent({
      actorId: userId,
      action: 'blondeau_sheet_import',
      outcome: 'failure',
      subjectType: 'artwork',
      subjectId: artworkId,
      errorMessage: artworkError.message,
    })
    return NextResponse.json({ error: 'Could not load the artwork' }, { status: 502 })
  }
  if (!artwork) return NextResponse.json({ error: 'Artwork not found' }, { status: 404 })

  const artistValue = artwork.artist as
    | { first_name: string | null; last_name: string }
    | { first_name: string | null; last_name: string }[]
    | null
  const artist = Array.isArray(artistValue) ? artistValue[0] : artistValue
  const artistName = artist ? [artist.last_name, artist.first_name].filter(Boolean).join(' ') : null

  const { data: lastDocument, error: positionError } = await supabase
    .from('documents')
    .select('position')
    .eq('artwork_id', artworkId)
    .order('position', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (positionError) {
    return NextResponse.json({ error: 'Could not determine the next document position' }, { status: 502 })
  }
  const nextPosition = (lastDocument?.position ?? -1) + 1

  let sharePointItem: Awaited<ReturnType<typeof uploadDocument>> | null = null
  let imagePath: string | null = null
  let insertedDocumentIds: string[] = []
  let artworkUpdated = false
  try {
    const pdfName = pdf.name.toLowerCase().endsWith('.pdf') ? pdf.name : `${pdf.name}.pdf`
    sharePointItem = await uploadDocument({
      folderPath: buildArtworkFolderPath({ artistName, artworkTitle: artwork.title, artworkId }),
      fileName: pdfName,
      content: pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer,
      mimeType: 'application/pdf',
    })

    const documentId = crypto.randomUUID()
    const pdfDocumentRow = {
      id: documentId,
      artwork_id: artworkId,
      visibility: 'all_clients',
      recipient_contact_id: null,
      link_category: 'general',
      document_type: 'link',
      label: 'Fiche Blondeau',
      url: `/api/documents/${documentId}/open`,
      position: nextPosition,
      storage_provider: 'sharepoint',
      sharepoint_drive_id: sharePointItem.driveId,
      sharepoint_item_id: sharePointItem.id,
      sharepoint_web_url: sharePointItem.webUrl,
      file_name: sharePointItem.name,
      mime_type: sharePointItem.mimeType ?? 'application/pdf',
      size_bytes: sharePointItem.size,
    }

    if (image instanceof File && imageBytes) {
      imagePath = `${artworkId}/${Date.now()}-${crypto.randomUUID()}.png`
      const { error: imageUploadError } = await supabase.storage
        .from('artwork-images')
        .upload(imagePath, imageBytes, { contentType: 'image/png', upsert: false })
      if (imageUploadError) throw new Error(`Image upload failed: ${imageUploadError.message}`)
    }

    const documentRows = [
      pdfDocumentRow,
      ...(image instanceof File && imagePath
        ? [{
          id: crypto.randomUUID(),
          artwork_id: artworkId,
          visibility: 'all_clients',
          recipient_contact_id: null,
          link_category: 'images',
          document_type: 'image',
          label: 'Blondeau artwork image',
          url: supabase.storage.from('artwork-images').getPublicUrl(imagePath).data.publicUrl,
          position: nextPosition + 1,
          storage_provider: 'legacy',
          file_name: image.name,
          mime_type: 'image/png',
          size_bytes: image.size,
        }]
        : []),
    ]

    const { data: insertedDocuments, error: documentError } = await supabase
      .from('documents')
      .insert(documentRows)
      .select()
    if (documentError || !insertedDocuments) {
      throw new Error(`Document record creation failed: ${documentError?.message ?? 'No records returned'}`)
    }
    insertedDocumentIds = insertedDocuments.map(document => document.id)

    if (Object.keys(fields).length > 0) {
      const { error: updateError } = await supabase
        .from('artworks')
        .update(fields)
        .eq('id', artworkId)
      if (updateError) throw new Error(`Artwork update failed: ${updateError.message}`)
      artworkUpdated = true
    }

    if (imagePath && image instanceof File) {
      const { data: imageUrl } = supabase.storage.from('artwork-images').getPublicUrl(imagePath)
      scheduleThumbnailGeneration(supabase, imageUrl.publicUrl, image)
    }

    await logAuditEvent({
      actorId: userId,
      action: 'blondeau_sheet_import',
      outcome: 'success',
      subjectType: 'artwork',
      subjectId: artworkId,
      metadata: { updated_fields: Object.keys(fields).length, imported_image: image instanceof File },
    })
    return NextResponse.json({ documents: insertedDocuments, fields })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unexpected Blondeau sheet import failure'
    if (insertedDocumentIds.length > 0) {
      const { error } = await supabase.from('documents').delete().in('id', insertedDocumentIds)
      if (error) console.error('BLONDEAU IMPORT DOCUMENT ROLLBACK FAILED:', error.message)
    }
    if (artworkUpdated) {
      const { error } = await supabase.from('artworks').update({
        medium: artwork.medium,
        signature: artwork.signature,
        edition: artwork.edition,
        year_execution: artwork.year_execution,
        year_execution_start: artwork.year_execution_start,
        title: artwork.title,
      }).eq('id', artworkId)
      if (error) console.error('BLONDEAU IMPORT ARTWORK ROLLBACK FAILED:', error.message)
    }
    if (imagePath) {
      const { error } = await supabase.storage.from('artwork-images').remove([imagePath])
      if (error) console.error('BLONDEAU IMPORT IMAGE ROLLBACK FAILED:', error.message)
    }
    if (sharePointItem) {
      try {
        await deleteDocument(sharePointItem.driveId, sharePointItem.id)
      } catch (cleanupError) {
        console.error('BLONDEAU IMPORT SHAREPOINT ROLLBACK FAILED:', cleanupError)
      }
    }
    await logAuditEvent({
      actorId: userId,
      action: 'blondeau_sheet_import',
      outcome: 'failure',
      subjectType: 'artwork',
      subjectId: artworkId,
      errorMessage: message,
    })
    console.error('BLONDEAU SHEET IMPORT FAILED:', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
