import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'

type DocumentPosition = {
  id: string
  position: number
}

function isDocumentPosition(value: unknown): value is DocumentPosition {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as DocumentPosition).id === 'string' &&
    Number.isInteger((value as DocumentPosition).position)
  )
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: artworkId } = await context.params
  const authorization = await requireRole(['Editor', 'Administrator'])
  if (authorization.response) {
    return authorization.response
  }

  const body: unknown = await req.json()
  if (!Array.isArray(body) || !body.every(isDocumentPosition)) {
    return NextResponse.json({ error: 'Invalid document positions' }, { status: 400 })
  }

  const results = await Promise.all(
    body.map(({ id, position }) =>
      authorization.supabase
        .from('documents')
        .update({ position })
        .eq('id', id)
        .eq('artwork_id', artworkId)
    )
  )
  const failedUpdate = results.find(({ error }) => error)

  if (failedUpdate?.error) {
    return NextResponse.json(
      { error: failedUpdate.error.message },
      { status: 400 }
    )
  }

  return NextResponse.json({ success: true })
}
