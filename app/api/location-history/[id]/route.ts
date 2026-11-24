import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'

const EDITOR_ROLES = ['Editor', 'Administrator'] as const

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await requireRole(EDITOR_ROLES, request)
  if (authorization.response) return authorization.response

  const { id } = await params
  const { error } = await authorization.supabase
    .from('artwork_location_history')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('LOCATION HISTORY DELETE FAILED:', error)
    return NextResponse.json({ error: 'Unable to delete history entry' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
