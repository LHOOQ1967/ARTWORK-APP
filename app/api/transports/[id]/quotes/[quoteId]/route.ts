import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { parseQuoteInput } from '@/lib/transports'

const EDITOR_ROLES = ['Editor', 'Administrator'] as const

type Params = { params: Promise<{ id: string; quoteId: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const authorization = await requireRole(EDITOR_ROLES, request)
  if (authorization.response) return authorization.response

  const { id, quoteId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const input = parseQuoteInput(body, false)
  if (!input || Object.keys(input).length === 0) {
    return NextResponse.json({ error: 'Invalid quote' }, { status: 400 })
  }

  const { error } = await authorization.supabase
    .from('artwork_transport_quotes')
    .update(input)
    .eq('id', quoteId)
    .eq('transport_id', id)

  if (error) {
    console.error('QUOTE UPDATE FAILED:', error)
    return NextResponse.json({ error: 'Unable to update quote' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const authorization = await requireRole(EDITOR_ROLES, request)
  if (authorization.response) return authorization.response

  const { id, quoteId } = await params
  const { error } = await authorization.supabase
    .from('artwork_transport_quotes')
    .delete()
    .eq('id', quoteId)
    .eq('transport_id', id)

  if (error) {
    console.error('QUOTE DELETE FAILED:', error)
    return NextResponse.json({ error: 'Unable to delete quote' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
