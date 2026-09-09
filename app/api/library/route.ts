import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'

export async function GET(request: NextRequest) {
  const authorization = await requireUser(request)
  if (authorization.response) return authorization.response

  const query = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? 50), 100)
  let booksQuery = authorization.supabase
    .from('library_books')
    .select(`
      id, legacy_no, title, publication_year, volume, series, isbn, copy, remarks,
      library_book_authors(author:library_authors(last_name, first_name)),
      library_book_artists(artist:artists(id, first_name, last_name))
    `)
    .order('title', { ascending: true, nullsFirst: false })
    .limit(Number.isFinite(limit) && limit > 0 ? limit : 50)

  if (query) {
    booksQuery = booksQuery.or(
      `title.ilike.%${query}%,isbn.ilike.%${query}%,series.ilike.%${query}%,remarks.ilike.%${query}%`
    )
  }

  const { data, error } = await booksQuery
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ books: data ?? [] })
}