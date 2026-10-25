import { createHash } from 'node:crypto'
import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from './supabaseAdmin'

export const THUMBNAIL_BUCKET = 'artwork-thumbnails'
const SOURCE_BUCKET = 'artwork-images'

export class ThumbnailError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

export async function encodeArtworkThumbnail(source: Blob) {
  if (source.size > 100 * 1024 * 1024) {
    throw new ThumbnailError('Image too large to generate a thumbnail', 413)
  }
  try {
    return await sharp(await source.arrayBuffer(), { limitInputPixels: 100_000_000 })
      .rotate().resize(160, 140, { fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 75 }).toBuffer()
  } catch (cause) {
    console.error('ARTWORK THUMBNAIL PROCESSING ERROR:', cause)
    throw new ThumbnailError('Unable to generate image thumbnail', 422)
  }
}

function missing(error: { statusCode?: string | number; status?: number }) {
  return String(error.statusCode ?? error.status) === '404'
}

async function accessibleDocument(client: SupabaseClient, sourceUrl: string, documentId?: string) {
  let query = client.from('documents').select('id, url').eq('document_type', 'image').eq('url', sourceUrl)
  if (documentId) query = query.eq('id', documentId)
  const { data, error } = await query.limit(1).maybeSingle()
  if (error) {
    console.error('ARTWORK THUMBNAIL ACCESS ERROR:', error)
    throw new ThumbnailError('Unable to verify image access', 502)
  }
  if (!data) throw new ThumbnailError('Image unavailable', 404)
  return data
}

export async function storedArtworkThumbnail(
  client: SupabaseClient, sourceUrl: string, filePath: string, uploadedSource?: Blob,
) {
  // Storage source policies are broader than document visibility. Never use the
  // service role or a cached derivative before checking the document with RLS.
  const document = await accessibleDocument(client, sourceUrl)
  const source = client.storage.from(SOURCE_BUCKET)
  const { data: info, error: infoError } = await source.info(filePath)
  if (infoError || !info?.version) {
    console.error('ARTWORK THUMBNAIL SOURCE INFO ERROR:', infoError)
    throw new ThumbnailError('Image unavailable', 404)
  }
  const version = createHash('sha256').update(`${sourceUrl}\n${info.id}\n${info.version}\n160x140-webp75-v1`).digest('hex')
  const sourceHash = createHash('sha256').update(sourceUrl).digest('hex')
  const key = `${document.id}/${sourceHash}-${version}.webp`
  const bucket = supabaseAdmin.storage.from(THUMBNAIL_BUCKET)
  const { data: cached, error: cacheError } = await bucket.download(key)
  if (cached) return { bytes: new Uint8Array(await cached.arrayBuffer()), key }
  if (cacheError && !missing(cacheError)) {
    console.error('ARTWORK THUMBNAIL CACHE READ ERROR:', cacheError)
    throw new ThumbnailError('Unable to read stored thumbnail', 502)
  }

  let original = uploadedSource
  if (!original) {
    const { data, error } = await source.download(filePath)
    if (error || !data) {
      console.error('ARTWORK THUMBNAIL DOWNLOAD ERROR:', error)
      throw new ThumbnailError('Image unavailable', 404)
    }
    original = data
  }
  const bytes = await encodeArtworkThumbnail(original)
  await accessibleDocument(client, sourceUrl, document.id)
  // Versioned source keys prevent an overwritten original reusing old pixels.
  const { data: currentInfo, error: currentError } = await source.info(filePath)
  if (currentError || currentInfo?.version !== info.version) {
    throw new ThumbnailError('Image changed during thumbnail generation; retry', 409)
  }
  const { error: uploadError } = await bucket.upload(key, bytes, {
    contentType: 'image/webp', cacheControl: '0', upsert: true,
  })
  if (uploadError) {
    console.error('ARTWORK THUMBNAIL CACHE WRITE ERROR:', uploadError)
    throw new ThumbnailError('Unable to save image thumbnail', 502)
  }
  try {
    await accessibleDocument(client, sourceUrl, document.id)
  } catch (cause) {
    const { error } = await bucket.remove([key])
    if (error) {
      console.error('ARTWORK THUMBNAIL RACE CLEANUP ERROR:', error)
      const { error: queueError } = await supabaseAdmin.from('artwork_thumbnail_cleanup').upsert({
        document_id: document.id, source_url: sourceUrl, queued_at: new Date().toISOString(),
      }, { onConflict: 'document_id,source_url' })
      if (queueError) console.error('ARTWORK THUMBNAIL RACE CLEANUP QUEUE ERROR:', queueError)
    }
    throw cause
  }
  return { bytes: new Uint8Array(bytes), key }
}

export async function cleanArtworkThumbnails() {
  const { data: jobs, error } = await supabaseAdmin.from('artwork_thumbnail_cleanup')
    .select('document_id, source_url, queued_at').order('queued_at').limit(20)
  if (error) throw new Error(`Unable to load thumbnail cleanup queue: ${error.message}`)
  const bucket = supabaseAdmin.storage.from(THUMBNAIL_BUCKET)
  for (const job of jobs ?? []) {
    const prefix = createHash('sha256').update(job.source_url).digest('hex')
    const { data: current, error: currentError } = await supabaseAdmin.from('documents')
      .select('id').eq('id', job.document_id).eq('url', job.source_url).eq('document_type', 'image').maybeSingle()
    if (currentError) throw new Error(`Unable to verify thumbnail cleanup source: ${currentError.message}`)
    // Removal changes the listing, so always read the first page.
    while (!current) {
      const { data, error } = await bucket.list(job.document_id, { limit: 100, search: `${prefix}-` })
      if (error) throw new Error(`Unable to list thumbnail cleanup objects: ${error.message}`)
      if (!data?.length) break
      const { error: removeError } = await bucket.remove(data.map(file => `${job.document_id}/${file.name}`))
      if (removeError) throw new Error(`Unable to remove thumbnails: ${removeError.message}`)
    }
    const { error: deleteError } = await supabaseAdmin.from('artwork_thumbnail_cleanup')
      .delete().eq('document_id', job.document_id).eq('source_url', job.source_url).eq('queued_at', job.queued_at)
    if (deleteError) throw new Error(`Unable to acknowledge thumbnail cleanup: ${deleteError.message}`)
  }
}
