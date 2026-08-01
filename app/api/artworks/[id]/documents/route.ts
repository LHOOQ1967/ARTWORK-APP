

import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: artworkId } = await context.params
  const authorization = await requireRole(['Editor', 'Administrator'])
  if (authorization.response) {
    return authorization.response
  }

  const body = await req.json()
  if (
    typeof body.document_type !== 'string' ||
    typeof body.url !== 'string' ||
    body.url.length === 0
  ) {
    return NextResponse.json({ error: 'Invalid document payload' }, { status: 400 })
  }

  const { data, error } = await authorization.supabase
    .from('documents')
    .insert({
      artwork_id: artworkId,
      document_type: body.document_type,
      url: body.url,
      label: body.label ?? null,
      position: body.position ?? 0,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    )
  }

  return NextResponse.json(data)
}


