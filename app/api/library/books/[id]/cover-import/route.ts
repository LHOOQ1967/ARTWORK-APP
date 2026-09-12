import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { findCoverForBook, normalizeIsbn } from '@/lib/coverFetcher'

const EDITOR_ROLES = ['Editor', 'Administrator'] as const

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireRole(EDITOR_ROLES, request)
  if (authorization.response) return authorization.response

  const { id } = await context.params
  const body = await request.json().catch(() => null) as { isbn?: unknown; title?: unknown; search_author?: unknown } | null
  const isbn = normalizeIsbn(body?.isbn)

  if (!isbn && typeof body?.title !== 'string') {
    return NextResponse.json({ error: 'ISBN ou titre manquant ou invalide.' }, { status: 400 })
  }

  const cover = await findCoverForBook(isbn, typeof body?.title === 'string' ? body.title : null, typeof body?.search_author === 'string' ? body.search_author : null)
  if (!cover) {
    return NextResponse.json({ error: 'Aucune couverture trouvée pour cet ouvrage.' }, { status: 404 })
  }

  const extension = cover.contentType.split('/')[1]?.split(';')[0]?.trim() || 'jpg'
  const filePath = `library-books/${id}/cover-${crypto.randomUUID()}.${extension}`

  const { error: uploadError } = await authorization.supabase.storage
    .from('artwork-images')
    .upload(filePath, Buffer.from(cover.arrayBuffer), { contentType: cover.contentType, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data } = authorization.supabase.storage.from('artwork-images').getPublicUrl(filePath)

  return NextResponse.json({ url: data.publicUrl, source: cover.source })
}
