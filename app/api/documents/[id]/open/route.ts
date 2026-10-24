import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'
import { downloadDocument } from '@/lib/sharepoint'
import { iphoneDocumentViewerUrl } from '@/lib/documentViewer'

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const authorization = await requireUser(req)
  if (authorization.response) return authorization.response

  const { data: doc, error } = await authorization.supabase
    .from('documents')
    .select(
      'url, legacy_url, storage_provider, sharepoint_drive_id, sharepoint_item_id, file_name, mime_type, artwork_id'
    )
    .eq('id', id)
    .maybeSingle()

  if (error || !doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (doc.storage_provider !== 'sharepoint') {
    return NextResponse.redirect(doc.legacy_url ?? doc.url)
  }

  const viewerUrl = iphoneDocumentViewerUrl(req, id, doc.artwork_id)
  if (viewerUrl) {
    return NextResponse.redirect(viewerUrl, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }

  try {
    const upstream = await downloadDocument(doc.sharepoint_drive_id, doc.sharepoint_item_id)
    const fileName = encodeURIComponent(doc.file_name ?? 'document')
    const disposition = new URL(req.url).searchParams.get('download') === '1' ? 'attachment' : 'inline'
    return new Response(upstream.body, {
      headers: {
        'Content-Type':
          doc.mime_type ?? upstream.headers.get('content-type') ?? 'application/octet-stream',
        'Content-Disposition': `${disposition}; filename*=UTF-8''${fileName}`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    console.error('SHAREPOINT DOWNLOAD ERROR:', err)
    return NextResponse.json({ error: 'SharePoint download failed' }, { status: 502 })
  }
}
