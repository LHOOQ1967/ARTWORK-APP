import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { deleteDocument } from '@/lib/sharepoint'

export async function DELETE(
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

  if (!doc) return NextResponse.json({ success: true })

  if (doc.storage_provider === 'sharepoint') {
    try {
      await deleteDocument(doc.sharepoint_drive_id, doc.sharepoint_item_id)
    } catch (err) {
      console.error('SHAREPOINT DELETE ERROR:', err)
      return NextResponse.json({ error: 'SharePoint delete failed' }, { status: 502 })
    }
  }

  const { error } = await authorization.supabase.from('documents').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
