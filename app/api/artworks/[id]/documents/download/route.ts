import { NextResponse } from 'next/server'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import archiver from 'archiver'
import { requireUser } from '@/lib/apiAuth'
import { DOCUMENT_CATEGORY_LABELS, isDocumentCategory } from '@/lib/documentCategory'
import { downloadDocument } from '@/lib/sharepoint'

export const runtime = 'nodejs'

type DownloadableDocument = {
  id: string
  file_name: string | null
  link_category: string
  sharepoint_drive_id: string
  sharepoint_item_id: string
}

function archiveName(document: DownloadableDocument, used: Set<string>): string {
  const name = (document.file_name || `document-${document.id}`)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/^[. ]+|[. ]+$/g, '') || `document-${document.id}`
  const folder = isDocumentCategory(document.link_category)
    ? DOCUMENT_CATEGORY_LABELS[document.link_category] : 'General'
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ''
  let path = `${folder}/${name}`
  for (let suffix = 2; used.has(path.toLowerCase()); suffix++) {
    path = `${folder}/${base} (${suffix})${extension}`
  }
  used.add(path.toLowerCase())
  return path
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireUser(req)
  if (authorization.response) return authorization.response
  const { id } = await context.params
  const categories = [...new Set(new URL(req.url).searchParams.getAll('category'))]
  if (categories.length === 0 || !categories.every(isDocumentCategory)) {
    return NextResponse.json({ error: 'Select at least one valid document category' }, { status: 400 })
  }

  const documents: DownloadableDocument[] = []
  for (let offset = 0; ; offset += 200) {
    const { data, error } = await authorization.supabase.from('documents')
      .select('id, file_name, link_category, sharepoint_drive_id, sharepoint_item_id')
      .eq('artwork_id', id)
      .eq('storage_provider', 'sharepoint')
      .in('document_type', ['link', 'onedrive'])
      .in('link_category', categories)
      .order('position').order('id').range(offset, offset + 199)
      .returns<DownloadableDocument[]>()
    if (error) {
      console.error('DOCUMENT ZIP QUERY ERROR:', error)
      return NextResponse.json({ error: 'Unable to load files for download' }, { status: 502 })
    }
    documents.push(...(data ?? []))
    if (!data || data.length < 200) break
  }
  if (documents.length === 0) {
    return NextResponse.json({ error: 'No downloadable files are available in the selected categories' }, { status: 404 })
  }

  // Fetch the first file before sending ZIP headers so initial failures remain explicit.
  let first: Response
  try {
    first = await downloadDocument(documents[0].sharepoint_drive_id, documents[0].sharepoint_item_id)
    if (!first.body) throw new Error('Empty SharePoint response')
  } catch (error) {
    console.error('DOCUMENT ZIP DOWNLOAD ERROR:', error)
    return NextResponse.json({ error: 'Unable to download files from SharePoint' }, { status: 502 })
  }

  const archive = archiver('zip', { store: true })
  let source: Readable | undefined
  const stop = () => {
    source?.destroy(new Error('Download cancelled'))
    archive.destroy(new Error('Download cancelled'))
  }
  req.signal.addEventListener('abort', stop, { once: true })
  archive.once('close', () => req.signal.removeEventListener('abort', stop))
  archive.on('warning', error => archive.destroy(error))
  // A failed entry must abort the response, never finalize a successful-looking partial ZIP.
  archive.on('error', error => {
    console.error('DOCUMENT ZIP STREAM ERROR:', error)
    source?.destroy(error)
  })
  const stream = Readable.toWeb(archive) as ReadableStream<Uint8Array>
  const used = new Set<string>()
  async function produce() {
    for (let index = 0; index < documents.length; index++) {
      if (req.signal.aborted || archive.destroyed) throw new Error('Download cancelled')
      const document = documents[index]
      const response = index === 0 ? first :
        await downloadDocument(document.sharepoint_drive_id, document.sharepoint_item_id)
      if (!response.body) throw new Error('Empty SharePoint response')
      const body = response.body
      source = Readable.from((async function* () {
        const reader = body.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            yield value
          }
        } finally {
          await reader.cancel()
          reader.releaseLock()
        }
      })())
      const consumed = finished(source)
      archive.append(source, { name: archiveName(document, used) })
      await consumed
    }
    await archive.finalize()
  }
  void produce().catch(error => {
    console.error('DOCUMENT ZIP BUILD ERROR:', error)
    archive.destroy(error instanceof Error ? error : new Error('ZIP download failed'))
  })
  if (req.signal.aborted) stop()
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="artwork-${id.replace(/[^a-zA-Z0-9-]/g, '_')}-documents.zip"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
