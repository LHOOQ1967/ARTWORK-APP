import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { parseQuoteInput } from '@/lib/transports'

const EDITOR_ROLES = ['Editor', 'Administrator'] as const

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await requireRole(EDITOR_ROLES, request)
  if (authorization.response) return authorization.response

  const { id } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const input = parseQuoteInput(body, true)
  if (!input) {
    return NextResponse.json({ error: 'Invalid quote' }, { status: 400 })
  }

  const { error } = await authorization.supabase
    .from('artwork_transport_quotes')
    .insert({ ...input, transport_id: id })

  if (error) {
    console.error('QUOTE CREATE FAILED:', error)
    return NextResponse.json({ error: 'Unable to create quote' }, { status: 500 })
  }
  return NextResponse.json({ ok: true }, { status: 201 })
}
