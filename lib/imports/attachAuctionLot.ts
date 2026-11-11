import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { record, auctionHouseNames, type AuctionLot, type AuctionProvider } from './auction'
import { scheduleThumbnailGeneration } from '@/lib/scheduleThumbnailCleanup'

function documentId(artworkId: string, provider: AuctionProvider, url: string) {
  const hash = createHash('sha256').update(`${artworkId}:${provider}:${url}`).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

export async function attachAuctionLot(request: Request, context: { params: Promise<{ id: string }> }, config: {
  provider: AuctionProvider
  lotUrl: (value: unknown) => string
  imageUrl: (value: unknown) => string
  fetchLot: (url: string) => Promise<AuctionLot>
  fetchBytes: (url: string, kind: 'image') => Promise<Uint8Array>
}) {
  const house = auctionHouseNames[config.provider]
  const authorization = await requireRole(['Editor', 'Administrator'], request)
  if (authorization.response) return authorization.response
  const { id: artworkId } = await context.params
  if (!/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(artworkId)) {
    return NextResponse.json({ error: 'Invalid artwork ID.' }, { status: 400 })
  }
  let url: string
  let imageUrls: string[]
  try {
    const body: unknown = await request.json()
    url = config.lotUrl(record(body) ? body.url : null)
    if (!record(body) || !Array.isArray(body.images) || body.images.length > 30) throw new Error('Select up to 30 lot images.')
    imageUrls = [...new Set(body.images.map(config.imageUrl))]
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Invalid import request.' }, { status: 400 })
  }

  const { supabase } = authorization
  const { data: artwork, error: artworkError } = await supabase.from('artworks').select('id').eq('id', artworkId).maybeSingle()
  if (artworkError) return NextResponse.json({ error: 'Could not load the artwork.' }, { status: 502 })
  if (!artwork) return NextResponse.json({ error: 'Artwork not found.' }, { status: 404 })

  try {
    const deadline = Date.now() + 240_000
    const lot = await config.fetchLot(url)
    if (imageUrls.some(image => !lot.images.some(item => item.url === image))) {
      return NextResponse.json({ error: 'The selected images no longer match this lot. Reopen the import and review its gallery.' }, { status: 400 })
    }
    const sourceId = documentId(artworkId, config.provider, url)
    const ids = [sourceId, ...imageUrls.map(image => documentId(artworkId, config.provider, image))]
    const { data: existing, error: existingError } = await supabase.from('documents').select('id').eq('artwork_id', artworkId).in('id', ids)
    if (existingError) throw new Error('Could not check previously imported documents.')
    const existingIds = new Set((existing ?? []).map(item => item.id))
    const { data: last, error: positionError } = await supabase.from('documents').select('position')
      .eq('artwork_id', artworkId).order('position', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()
    if (positionError) throw new Error('Could not determine document order.')
    let position = (last?.position ?? -1) + 1
    const access = { artwork_id: artworkId, visibility: 'all_clients', recipient_contact_id: null }
    if (!existingIds.has(sourceId)) {
      const { error } = await supabase.from('documents').upsert({
        ...access, id: sourceId, document_type: 'link', label: `${house} auction lot`,
        url, link_category: 'general', position: position++,
      }, { onConflict: 'id', ignoreDuplicates: true })
      if (error) throw new Error(`Could not save the ${house} source link.`)
    }
    for (const imageUrl of imageUrls) {
      const id = documentId(artworkId, config.provider, imageUrl)
      if (existingIds.has(id)) continue
      if (Date.now() > deadline) throw new Error('Image import reached its time limit. Retry to finish attaching the remaining images.')
      const bytes = await config.fetchBytes(imageUrl, 'image')
      const jpeg = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().jpeg({ quality: 90 }).toBuffer()
      const file = new File([new Uint8Array(jpeg)], `${config.provider}-${id}.jpg`, { type: 'image/jpeg' })
      const path = `${artworkId}/${config.provider}-${id}.jpg`
      const { error: uploadError } = await supabase.storage.from('artwork-images').upload(path, file, {
        contentType: file.type, upsert: true,
      })
      if (uploadError) throw new Error(`Could not store a ${house} image.`)
      const imagePublicUrl = supabase.storage.from('artwork-images').getPublicUrl(path).data.publicUrl
      const { error: documentError } = await supabase.from('documents').upsert({
        ...access, id, document_type: 'image', url: imagePublicUrl, link_category: 'images',
        label: lot.images.find(item => item.url === imageUrl)?.label ?? `${house} image`,
        position: position++, storage_provider: 'legacy', file_name: file.name,
        mime_type: file.type, size_bytes: file.size,
      }, { onConflict: 'id', ignoreDuplicates: true })
      if (documentError) throw new Error('Could not save an imported image document. Retry to finish attaching the images.')
      scheduleThumbnailGeneration(supabase, imagePublicUrl, file)
    }
    return NextResponse.json({ artwork_id: artworkId, document_ids: ids })
  } catch (cause) {
    console.error(`${house} DOCUMENT IMPORT ERROR:`, cause)
    return NextResponse.json({
      error: cause instanceof Error ? cause.message : `Could not attach the ${house} source and images.`,
    }, { status: 502 })
  }
}
