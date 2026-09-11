import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'

const EDITOR_ROLES = ['Editor', 'Administrator'] as const

function normalizeIsbn(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.replace(/[^0-9Xx]/g, '').toUpperCase()
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireRole(EDITOR_ROLES, request)
  if (authorization.response) return authorization.response

  const { id } = await context.params
  const body = await request.json().catch(() => null) as { isbn?: unknown } | null
  const isbn = normalizeIsbn(body?.isbn)

  if (!isbn) {
    return NextResponse.json({ error: 'ISBN manquant ou invalide.' }, { status: 400 })
  }

  const coverUrl = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`
  const imageResponse = await fetch(coverUrl, { cache: 'no-store' })

  const contentType = imageResponse.headers.get('content-type') ?? ''
  if (!imageResponse.ok || !contentType.startsWith('image/')) {
    return NextResponse.json({ error: 'Aucune couverture trouvée sur Open Library pour cet ISBN.' }, { status: 404 })
  }

  const arrayBuffer = await imageResponse.arrayBuffer()
  const extension = contentType.split('/')[1]?.split(';')[0]?.trim() || 'jpg'
  const filePath = `library-books/${id}/cover-${crypto.randomUUID()}.${extension}`

  const { error: uploadError } = await authorization.supabase.storage
    .from('artwork-images')
    .upload(filePath, Buffer.from(arrayBuffer), { contentType, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data } = authorization.supabase.storage.from('artwork-images').getPublicUrl(filePath)

  return NextResponse.json({ url: data.publicUrl })
}
