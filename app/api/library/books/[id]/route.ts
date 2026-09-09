import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authorization = await requireUser(request)
  if (authorization.response) return authorization.response

  const { id } = await context.params
  const { supabase } = authorization
  const [bookResult, authorsResult, artistsResult, exhibitionsResult, typeResult, statusResult] = await Promise.all([
    supabase.from('library_books').select('*').eq('id', id).maybeSingle(),
    supabase.from('library_book_authors').select('is_default, author:library_authors(id, legacy_no, first_name, last_name)').eq('book_id', id),
    supabase.from('library_book_artists').select('is_default, legacy_artist_no, artist:artists(id, first_name, last_name, year_of_birth, year_of_death)').eq('book_id', id),
    supabase.from('library_exhibitions').select('legacy_no, starts_on, ends_on, related_name:library_related_names(legacy_no, name, location)').eq('book_id', id).order('starts_on', { ascending: true }),
    supabase.from('library_book_types').select('legacy_no, type_number, description, full_name'),
    supabase.from('library_statuses').select('legacy_no, label'),
  ])

  const error = bookResult.error ?? authorsResult.error ?? artistsResult.error ?? exhibitionsResult.error ?? typeResult.error ?? statusResult.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!bookResult.data) return NextResponse.json({ error: 'Book not found' }, { status: 404 })

  return NextResponse.json({
    book: bookResult.data,
    authors: authorsResult.data ?? [],
    artists: artistsResult.data ?? [],
    exhibitions: exhibitionsResult.data ?? [],
    types: typeResult.data ?? [],
    statuses: statusResult.data ?? [],
  })
}