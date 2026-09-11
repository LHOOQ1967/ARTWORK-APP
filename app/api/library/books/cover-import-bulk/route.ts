import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'

const EDITOR_ROLES = ['Editor', 'Administrator'] as const
const DEFAULT_BATCH_SIZE = 10
const MAX_BATCH_SIZE = 25

function normalizeIsbn(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.replace(/[^0-9Xx]/g, '').toUpperCase()
}

function normalizeTitle(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

type BookRow = { id: string; legacy_no: number; isbn: string | null; title: string | null; search_author: string | null }
type CoverImageData = { arrayBuffer: ArrayBuffer; contentType: string }

// Books without an ISBN can't be looked up directly; only accept an Open Library title
// search result when the normalized title matches exactly, to avoid attaching the wrong cover.
async function findOpenLibraryCoverByTitle(title: string, author: string | null) {
  const searchTitle = title.trim()
  if (!searchTitle) return null

  const params = new URLSearchParams({ title: searchTitle, limit: '5', fields: 'title,cover_i' })
  if (author?.trim()) params.set('author', author.trim())

  const response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`, { cache: 'no-store' })
  if (!response.ok) return null

  const payload = await response.json().catch(() => null) as { docs?: Array<{ title?: string; cover_i?: number }> } | null
  const normalizedTarget = normalizeTitle(searchTitle)
  const match = (payload?.docs ?? []).find(
    (doc) => typeof doc.cover_i === 'number' && normalizeTitle(doc.title ?? '') === normalizedTarget
  )

  if (!match || typeof match.cover_i !== 'number') return null
  return `https://covers.openlibrary.org/b/id/${match.cover_i}-L.jpg`
}

async function fetchCoverImage(url: string): Promise<CoverImageData | null> {
  const response = await fetch(url, { cache: 'no-store' })
  const contentType = response.headers.get('content-type') ?? ''
  if (!response.ok || !contentType.startsWith('image/')) return null
  return { arrayBuffer: await response.arrayBuffer(), contentType }
}

export async function POST(request: NextRequest) {
  const authorization = await requireRole(EDITOR_ROLES, request)
  if (authorization.response) return authorization.response

  const body = await request.json().catch(() => null) as { afterLegacyNo?: unknown; limit?: unknown } | null
  const afterLegacyNo = typeof body?.afterLegacyNo === 'number' ? body.afterLegacyNo : null
  const limit = Math.min(Math.max(Number(body?.limit) || DEFAULT_BATCH_SIZE, 1), MAX_BATCH_SIZE)

  // All books missing a cover are candidates: ISBN lookups are tried first (reliable),
  // then a strict title match on Open Library for books that have no ISBN on file.
  let query = authorization.supabase
    .from('library_books')
    .select('id, legacy_no, isbn, title, search_author')
    .is('cover_image_url', null)
    .order('legacy_no', { ascending: true })
    .limit(limit)

  if (afterLegacyNo !== null) {
    query = query.gt('legacy_no', afterLegacyNo)
  }

  const { data: books, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (books ?? []) as BookRow[]
  let imported = 0
  let skipped = 0
  let failed = 0

  for (const row of rows) {
    try {
      let cover: CoverImageData | null = null

      const isbn = normalizeIsbn(row.isbn)
      if (isbn) {
        cover = await fetchCoverImage(`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`)
      }

      if (!cover && row.title) {
        const titleMatchUrl = await findOpenLibraryCoverByTitle(row.title, row.search_author)
        if (titleMatchUrl) {
          cover = await fetchCoverImage(titleMatchUrl)
        }
      }

      if (!cover) {
        skipped += 1
        continue
      }

      const extension = cover.contentType.split('/')[1]?.split(';')[0]?.trim() || 'jpg'
      const filePath = `library-books/${row.id}/cover-${crypto.randomUUID()}.${extension}`

      const { error: uploadError } = await authorization.supabase.storage
        .from('artwork-images')
        .upload(filePath, Buffer.from(cover.arrayBuffer), { contentType: cover.contentType, upsert: false })

      if (uploadError) {
        failed += 1
        continue
      }

      const { data: publicUrlData } = authorization.supabase.storage.from('artwork-images').getPublicUrl(filePath)

      const { error: updateError } = await authorization.supabase
        .from('library_books')
        .update({ cover_image_url: publicUrlData.publicUrl })
        .eq('id', row.id)

      if (updateError) {
        failed += 1
        continue
      }

      imported += 1
    } catch {
      failed += 1
    }
  }

  const lastLegacyNo = rows.length > 0 ? rows[rows.length - 1].legacy_no : afterLegacyNo

  return NextResponse.json({
    processedCount: rows.length,
    imported,
    skipped,
    failed,
    nextCursor: lastLegacyNo,
    done: rows.length < limit,
  })
}
