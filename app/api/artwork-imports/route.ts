import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { logAuditEvent } from '@/lib/audit'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: NextRequest) {
  const authorization = await requireRole(['Editor', 'Administrator'])
  if (authorization.response) {
    return authorization.response
  }

  const formData = await req.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    await logAuditEvent({
      actorId: authorization.userId,
      action: 'artwork_import',
      outcome: 'failure',
      errorMessage: 'Fichier manquant',
    })
    return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 })
  }

  const { data: importRow, error: insertError } = await supabaseAdmin
    .from('artwork_imports')
    .insert({
      created_by: authorization.userId,
      status: 'pending',
      source_type: 'label_photo',
    })
    .select('*')
    .single()

  if (insertError || !importRow) {
    await logAuditEvent({
      actorId: authorization.userId,
      action: 'artwork_import',
      outcome: 'failure',
      errorMessage: insertError?.message ?? 'Création import impossible',
    })
    return NextResponse.json(
      { error: insertError?.message ?? 'Création import impossible' },
      { status: 500 }
    )
  }

  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const filePath = `${authorization.userId}/${importRow.id}/label.${extension}`
  const { error: uploadError } = await supabaseAdmin.storage
    .from('artwork-imports')
    .upload(filePath, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type || 'image/jpeg',
      upsert: true,
    })

  if (uploadError) {
    await supabaseAdmin
      .from('artwork_imports')
      .update({
        status: 'failed',
        error_message: uploadError.message,
      })
      .eq('id', importRow.id)

    await logAuditEvent({
      actorId: authorization.userId,
      action: 'artwork_import_upload',
      outcome: 'failure',
      subjectType: 'artwork_import',
      subjectId: importRow.id,
      errorMessage: uploadError.message,
    })

    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from('artwork-imports')
    .getPublicUrl(filePath)

  const { data: updatedImport, error: updateError } = await supabaseAdmin
    .from('artwork_imports')
    .update({
      image_path: filePath,
      image_url: publicUrlData.publicUrl,
      status: 'uploaded',
    })
    .eq('id', importRow.id)
    .select('*')
    .single()

  if (updateError) {
    await logAuditEvent({
      actorId: authorization.userId,
      action: 'artwork_import',
      outcome: 'failure',
      subjectType: 'artwork_import',
      subjectId: importRow.id,
      errorMessage: updateError.message,
    })
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ import: updatedImport })
}
