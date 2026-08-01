
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // ✅ params est une Promise
) {
  const { id } = await context.params
  const authorization = await requireRole(['Editor', 'Administrator'])
  if (authorization.response) {
    return authorization.response
  }

  const body = await req.json()

  const { contact_id, proposed_at } = body

  if (!contact_id) {
    return NextResponse.json(
      { error: 'contact_id is required' },
      { status: 400 }
    )
  }

  const { error } = await authorization.supabase
    .from('artwork_proposals')
    .insert({
      artwork_id: id,
      contact_id,
      proposed_at: proposed_at || null,
    })

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    )
  }

  return NextResponse.json({ success: true })
}