export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { logAuditEvent } from '@/lib/audit'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json({ error: 'Missing artist id' }, { status: 400 })
  }

  const authorization = await requireRole(['Editor', 'Administrator'], req)
  if (authorization.response) {
    return authorization.response
  }

  const [bookLinksResult, artworkLinksResult] = await Promise.all([
    supabaseAdmin
      .from('library_book_artists')
      .select('book_id', { count: 'exact', head: true })
      .eq('artist_id', id),
    supabaseAdmin
      .from('artworks')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', id),
  ])

  if (bookLinksResult.error) {
    return NextResponse.json({ error: bookLinksResult.error.message }, { status: 400 })
  }
  if (artworkLinksResult.error) {
    return NextResponse.json({ error: artworkLinksResult.error.message }, { status: 400 })
  }

  const bookLinksCount = bookLinksResult.count ?? 0
  const artworkLinksCount = artworkLinksResult.count ?? 0

  if (bookLinksCount > 0 || artworkLinksCount > 0) {
    const parts = [
      bookLinksCount > 0 ? `${bookLinksCount} livre(s)` : '',
      artworkLinksCount > 0 ? `${artworkLinksCount} artwork(s)` : '',
    ].filter(Boolean)

    await logAuditEvent({
      actorId: authorization.userId,
      action: 'artist_delete',
      outcome: 'failure',
      subjectType: 'artist',
      subjectId: id,
      errorMessage: `Linked records remain: ${parts.join(' and ')}`,
    })

    return NextResponse.json(
      { error: `Impossible de supprimer cet artiste tant qu'il reste des liens: ${parts.join(' et ')}.` },
      { status: 409 }
    )
  }

  const { data, error } = await supabaseAdmin
    .from('artists')
    .delete()
    .eq('id', id)
    .select('id')

  if (error) {
    await logAuditEvent({
      actorId: authorization.userId,
      action: 'artist_delete',
      outcome: 'failure',
      subjectType: 'artist',
      subjectId: id,
      errorMessage: error.message,
    })

    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (!data || data.length === 0) {
    await logAuditEvent({
      actorId: authorization.userId,
      action: 'artist_delete',
      outcome: 'failure',
      subjectType: 'artist',
      subjectId: id,
      errorMessage: 'Artist not deleted',
    })
    return NextResponse.json({ error: 'Artist not deleted' }, { status: 404 })
  }

  await logAuditEvent({
    actorId: authorization.userId,
    action: 'artist_delete',
    outcome: 'success',
    subjectType: 'artist',
    subjectId: id,
  })

  return NextResponse.json({ success: true })
}
