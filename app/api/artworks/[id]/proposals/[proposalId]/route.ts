
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'

export async function DELETE(
  req: NextRequest,
  context: {
    params: Promise<{ id: string; proposalId: string }>
  }
) {
  const { id, proposalId } = await context.params
  const authorization = await requireRole(['Editor', 'Administrator'])
  if (authorization.response) {
    return authorization.response
  }

  const { error } = await authorization.supabase
    .from('artwork_proposals')
    .delete()
    .eq('id', proposalId)
    .eq('artwork_id', id)

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    )
  }

  return NextResponse.json({ success: true })
}