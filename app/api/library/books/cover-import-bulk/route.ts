import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { findCoverForBook } from '@/lib/coverFetcher'

const EDITOR_ROLES = ['Editor', 'Administrator'] as const
const DEFAULT_BATCH_SIZE = 10
const MAX_BATCH_SIZE = 25

type BookRow = { id: string; legacy_no: number; isbn: string | null; title: string | null; search_author: string | null }

export async function POST(request: NextRequest) {
  const authorization = await requireRole(EDITOR_ROLES, request)
  if (authorization.response) return authorization.response

  const body = await request.json().catch(() => null) as { afterLegacyNo?: unknown; limit?: unknown } | null
  const afterLegacyNo = typeof body?.afterLegacyNo === 'number' ? body.afterLegacyNo : null
  const limit = Math.min(Math.max(Number(body?.limit) || DEFAULT_BATCH_SIZE, 1), MAX_BATCH_SIZE)

  // All books missing a cover are candidates: ISBN lookups are tried first (reliable),
  // then a strict title match for books that have no ISBN on file.
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
      const cover = await findCoverForBook(row.isbn, row.title, row.search_author)

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

  const nextCursor = rows.length > 0 ? rows[rows.length - 1].legacy_no : null
  const done = rows.length < limit

  return NextResponse.json({
    imported,
    skipped,
    failed,
    processedCount: rows.length,
    nextCursor,
    done,
  })
}
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
