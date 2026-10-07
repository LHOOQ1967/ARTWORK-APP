import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { getShareLink } from '@/lib/sharepoint'

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const authorization = await requireRole(['Editor', 'Administrator'], req)
  if (authorization.response) return authorization.response

  const { data: doc } = await authorization.supabase
    .from('documents')
    .select('storage_provider, sharepoint_drive_id, sharepoint_item_id')
    .eq('id', id)
    .maybeSingle()

  if (!doc || doc.storage_provider !== 'sharepoint') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const url = await getShareLink(doc.sharepoint_drive_id, doc.sharepoint_item_id)
    return NextResponse.json({ url })
  } catch (err) {
    console.error('SHAREPOINT SHARE LINK ERROR:', err)
    return NextResponse.json({ error: 'SharePoint share link failed' }, { status: 502 })
  }
}
