import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'

export async function GET(request: NextRequest) {
  const authorization = await requireUser(request)
  if (authorization.response) return authorization.response

  const query = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  const view = request.nextUrl.searchParams.get('view') ?? 'books'
  const order = request.nextUrl.searchParams.get('order') ?? 'title'
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? 50), 100)
  const offset = Math.max(Number(request.nextUrl.searchParams.get('offset') ?? 0), 0)

  if (view === 'artists') {
    const artistsQuery = authorization.supabase
      .from('artists')
      .select('id, first_name, last_name, year_of_birth, year_of_death')
      .order('last_name', { ascending: true })
      .range(offset, offset + (Number.isFinite(limit) && limit > 0 ? limit : 50) - 1)
    const { data, error } = query
      ? await artistsQuery.or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
      : await artistsQuery
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ artists: data ?? [], hasMore: (data ?? []).length === limit })
  }

  if (view === 'authors') {
    const authorsQuery = authorization.supabase
      .from('library_authors')
      .select('id, legacy_no, first_name, last_name')
      .order('last_name', { ascending: true })
      .range(offset, offset + (Number.isFinite(limit) && limit > 0 ? limit : 50) - 1)
    const { data, error } = query
      ? await authorsQuery.or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
      : await authorsQuery
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ authors: data ?? [], hasMore: (data ?? []).length === limit })
  }

  if (view === 'related-names') {
    const namesQuery = authorization.supabase
      .from('library_related_names')
      .select('legacy_no, name, location')
      .order('name', { ascending: true })
      .range(offset, offset + (Number.isFinite(limit) && limit > 0 ? limit : 50) - 1)
    const { data, error } = query
      ? await namesQuery.or(`name.ilike.%${query}%,location.ilike.%${query}%`)
      : await namesQuery
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ relatedNames: data ?? [], hasMore: (data ?? []).length === limit })
  }

  if (view === 'types' || view === 'status') {
    if (view === 'types') {
      const { data, error } = await authorization.supabase.from('library_books').select('type_no').not('type_no', 'is', null).order('type_no', { ascending: true }).limit(1000)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ values: Array.from(new Set((data ?? []).map((row) => row.type_no))) })
    }
    const { data, error } = await authorization.supabase.from('library_books').select('status_no').not('status_no', 'is', null).order('status_no', { ascending: true }).limit(1000)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ values: Array.from(new Set((data ?? []).map((row) => row.status_no))) })
  }

  let booksQuery = authorization.supabase
    .from('library_books')
    .select(`
      id, legacy_no, title, publication_year, volume, series, isbn, copy, remarks,
      library_book_authors(author:library_authors(last_name, first_name)),
      library_book_artists(artist:artists(id, first_name, last_name))
    `)
    .order(order === 'artist' ? 'search_artist' : 'title', { ascending: true, nullsFirst: false })
    .range(offset, offset + (Number.isFinite(limit) && limit > 0 ? limit : 50) - 1)

  if (query) {
    const searchColumn = view === 'by-artists' ? 'search_artist' : view === 'by-authors' ? 'search_author' : null
    if (searchColumn) {
      booksQuery = booksQuery.ilike(searchColumn, `%${query}%`)
    } else {
    booksQuery = booksQuery.or(
      `title.ilike.%${query}%,isbn.ilike.%${query}%,series.ilike.%${query}%,remarks.ilike.%${query}%`
    )
    }
  }

  const { data, error } = await booksQuery
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ books: data ?? [], hasMore: (data ?? []).length === limit })
}