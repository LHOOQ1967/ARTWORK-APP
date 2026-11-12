import { NextResponse } from 'next/server'
import { requireRole, requireUser } from '@/lib/apiAuth'
import { deleteDocument, downloadDocument } from '@/lib/sharepoint'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const authorization = await requireUser(request)
  if (authorization.response) return authorization.response
  const { data, error } = await authorization.supabase.from('market_auction_files')
    .select('file_name, sharepoint_drive_id, sharepoint_item_id').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
  try {
    const upstream = await downloadDocument(data.sharepoint_drive_id, data.sharepoint_item_id)
    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(data.file_name)}`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('MARKET AUCTION PDF DOWNLOAD ERROR:', error)
    return NextResponse.json({ error: 'SharePoint download failed.' }, { status: 502 })
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const authorization = await requireRole(['Editor', 'Administrator'], request)
  if (authorization.response) return authorization.response
  const { data, error } = await authorization.supabase.from('market_auction_files')
    .select('sharepoint_drive_id, sharepoint_item_id').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
  try {
    await deleteDocument(data.sharepoint_drive_id, data.sharepoint_item_id)
  } catch (cause) {
    console.error('MARKET AUCTION PDF DELETE ERROR:', cause)
    return NextResponse.json({ error: 'SharePoint deletion failed.' }, { status: 502 })
  }
  const { data: deleted, error: deleteError } = await authorization.supabase.from('market_auction_files')
    .delete().eq('id', id).eq('sharepoint_drive_id', data.sharepoint_drive_id)
    .eq('sharepoint_item_id', data.sharepoint_item_id).select('id').maybeSingle()
  if (deleteError || !deleted) {
    return NextResponse.json({ error: 'The SharePoint file was deleted, but its record could not be removed.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
