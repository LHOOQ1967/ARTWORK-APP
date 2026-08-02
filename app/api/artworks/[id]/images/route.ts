import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { logAuditEvent } from '@/lib/audit'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const authorization = await requireRole(['Editor', 'Administrator'])
  if (authorization.response) {
    return authorization.response
  }

  const formData = await req.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    await logAuditEvent({
      actorId: authorization.userId,
      action: 'artwork_image_upload',
      outcome: 'failure',
      subjectType: 'artwork',
      subjectId: id,
      errorMessage: 'No file provided',
    })
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filePath = `${id}/${Date.now()}-${filename}`
  const { error: uploadError } = await authorization.supabase.storage
    .from('artwork-images')
    .upload(filePath, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })

  if (uploadError) {
    await logAuditEvent({
      actorId: authorization.userId,
      action: 'artwork_image_upload',
      outcome: 'failure',
      subjectType: 'artwork',
      subjectId: id,
      errorMessage: uploadError.message,
    })
    return NextResponse.json(
      { error: 'Upload failed', details: uploadError.message },
      { status: 400 }
    )
  }

  const { data: publicUrlData } = authorization.supabase.storage
    .from('artwork-images')
    .getPublicUrl(filePath)

  const { error: documentError } = await authorization.supabase
    .from('documents')
    .insert({
      artwork_id: id,
      document_type: 'image',
      label: 'Image',
      url: publicUrlData.publicUrl,
    })

  if (documentError) {
    await authorization.supabase.storage.from('artwork-images').remove([filePath])
    await logAuditEvent({
      actorId: authorization.userId,
      action: 'artwork_image_upload',
      outcome: 'failure',
      subjectType: 'artwork',
      subjectId: id,
      errorMessage: documentError.message,
    })
    return NextResponse.json(
      { error: 'Failed to save document', details: documentError.message },
      { status: 400 }
    )
  }

  return NextResponse.json({ url: publicUrlData.publicUrl }, { status: 201 })
}
