import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { parseFreeportInput } from '@/lib/genevaFreeport'
import { logAuditEvent } from '@/lib/audit'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await requireRole(['Editor', 'Administrator'], request)
  if (authorization.response) return authorization.response
  const { id } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid artwork ID.' }, { status: 400 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }
  const input = parseFreeportInput(body)
  if ('error' in input) return NextResponse.json(input, { status: 400 })
  const { error } = await authorization.supabase.rpc('save_geneva_freeport_inventory', {
    p_artwork_id: id, p_inventory: input.inventory, p_documents: input.documents,
  })
  await logAuditEvent({
    actorId: authorization.userId,
    action: 'geneva_freeport_inventory_update',
    outcome: error ? 'failure' : 'success',
    subjectType: 'artwork',
    subjectId: id,
    ...(error ? { errorMessage: error.message } : {}),
  })
  if (error) {
    console.error('SAVE GENEVA FREEPORT INVENTORY FAILED:', error)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ success: true })
}
