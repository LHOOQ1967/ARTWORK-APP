import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { parseTransportInput } from '@/lib/transports'

const EDITOR_ROLES = ['Editor', 'Administrator'] as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await requireRole(EDITOR_ROLES, request)
  if (authorization.response) return authorization.response

  const { id } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const input = parseTransportInput(body, false)
  if (!input || Object.keys(input).length === 0) {
    return NextResponse.json({ error: 'Invalid transport' }, { status: 400 })
  }

  const { error } = await authorization.supabase
    .from('artwork_transports')
    .update(input)
    .eq('id', id)

  if (error) {
    console.error('TRANSPORT UPDATE FAILED:', error)
    return NextResponse.json({ error: 'Unable to update transport' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await requireRole(EDITOR_ROLES, request)
  if (authorization.response) return authorization.response

  const { id } = await params
  const { error } = await authorization.supabase
    .from('artwork_transports')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('TRANSPORT DELETE FAILED:', error)
    return NextResponse.json({ error: 'Unable to delete transport' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
