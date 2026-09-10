import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'

const EDITOR_ROLES = ['Editor', 'Administrator'] as const

type BookWritePayload = {
  entered_at: string
  type_no: number | null
  status_no: number | null
  title: string | null
  publisher_no: number | null
  publication_year: number | null
  volume: string | null
  series: string | null
  remarks: string | null
  isbn: string | null
  copy: string | null
  search_artist: string | null
  search_author: string | null
  search_exhibition: string | null
  search_publisher: string | null
}

type BookInsertPayload = BookWritePayload & { created_by: string }
type AuthorLinkInput = { author_id: string; is_default: boolean }
type ArtistLinkInput = { artist_id: string | null; legacy_artist_no?: number | null; is_default: boolean }
type ParsedCreateBody = { payload: BookWritePayload; authorLinks: AuthorLinkInput[]; artistLinks: ArtistLinkInput[] }

function parseNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function parseNullableInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed)) return null
  return parsed
}

function currentDateIso() {
  return new Date().toISOString().slice(0, 10)
}

function dedupeArtistLinksForWrite(links: ArtistLinkInput[]) {
  const unique: ArtistLinkInput[] = []
  const indexByKey = new Map<string, number>()

  for (const link of links) {
    const key = link.artist_id ? `artist:${link.artist_id}` : `legacy:${link.legacy_artist_no ?? 'none'}`
    const existingIndex = indexByKey.get(key)
    if (existingIndex === undefined) {
      indexByKey.set(key, unique.length)
      unique.push(link)
      continue
    }

    if (link.is_default && !unique[existingIndex].is_default) {
      unique[existingIndex] = { ...unique[existingIndex], is_default: true }
    }
  }

  return unique
}

function parseAuthorLinks(value: unknown): AuthorLinkInput[] | null {
  if (!Array.isArray(value)) return null
  const links: AuthorLinkInput[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const row = item as Record<string, unknown>
    if (typeof row.author_id !== 'string' || !row.author_id) return null
    links.push({ author_id: row.author_id, is_default: Boolean(row.is_default) })
  }
  return links
}

function parseArtistLinks(value: unknown): ArtistLinkInput[] | null {
  if (!Array.isArray(value)) return null
  const links: ArtistLinkInput[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const row = item as Record<string, unknown>
    const legacyArtistNo = row.legacy_artist_no
    const artistId = row.artist_id
    const parsedArtistId = typeof artistId === 'string' && artistId ? artistId : null
    if (legacyArtistNo !== undefined && legacyArtistNo !== null && !Number.isInteger(legacyArtistNo)) return null
    if (!parsedArtistId && (legacyArtistNo === undefined || legacyArtistNo === null)) return null
    links.push({
      artist_id: parsedArtistId,
      legacy_artist_no: typeof legacyArtistNo === 'number' ? legacyArtistNo : null,
      is_default: Boolean(row.is_default),
    })
  }
  return links
}

function parseCreateBody(body: unknown): ParsedCreateBody | null {
  if (!body || typeof body !== 'object') return null
  const input = body as Record<string, unknown>

  const typeNo = parseNullableInteger(input.type_no)
  if (input.type_no !== undefined && input.type_no !== null && input.type_no !== '' && typeNo === null) return null

  const statusNo = parseNullableInteger(input.status_no)
  if (input.status_no !== undefined && input.status_no !== null && input.status_no !== '' && statusNo === null) return null

  const publisherNo = parseNullableInteger(input.publisher_no)
  if (input.publisher_no !== undefined && input.publisher_no !== null && input.publisher_no !== '' && publisherNo === null) return null

  const publicationYear = parseNullableInteger(input.publication_year)
  if (input.publication_year !== undefined && input.publication_year !== null && input.publication_year !== '' && publicationYear === null) return null

  const hasAuthorLinks = Object.hasOwn(input, 'author_links')
  const hasArtistLinks = Object.hasOwn(input, 'artist_links')
  const authorLinks = hasAuthorLinks ? parseAuthorLinks(input.author_links) : []
  const artistLinks = hasArtistLinks ? parseArtistLinks(input.artist_links) : []
  if (hasAuthorLinks && authorLinks === null) return null
  if (hasArtistLinks && artistLinks === null) return null

  return {
    payload: {
      // Automatic entry date for new books.
      entered_at: currentDateIso(),
      type_no: typeNo,
      status_no: statusNo,
      title: parseNullableString(input.title),
      publisher_no: publisherNo,
      publication_year: publicationYear,
      volume: parseNullableString(input.volume),
      series: parseNullableString(input.series),
      remarks: parseNullableString(input.remarks),
      isbn: parseNullableString(input.isbn),
      copy: parseNullableString(input.copy),
      search_artist: parseNullableString(input.search_artist),
      search_author: parseNullableString(input.search_author),
      search_exhibition: parseNullableString(input.search_exhibition),
      search_publisher: parseNullableString(input.search_publisher),
    },
    authorLinks: authorLinks ?? [],
    artistLinks: artistLinks ?? [],
  }
}

async function insertAuthorLinks(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabaseServer').supabaseServer>>,
  bookId: string,
  authorLinks: AuthorLinkInput[]
) {
  if (authorLinks.length === 0) return { ok: true as const }
  const { error } = await supabase
    .from('library_book_authors')
    .insert(authorLinks.map((row) => ({ book_id: bookId, author_id: row.author_id, is_default: row.is_default })))
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}

async function insertArtistLinks(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabaseServer').supabaseServer>>,
  bookId: string,
  artistLinks: ArtistLinkInput[]
) {
  const dedupedLinks = dedupeArtistLinksForWrite(artistLinks)
  if (dedupedLinks.length === 0) return { ok: true as const }

  const { data: maxLegacyRows, error: maxLegacyError } = await supabase
    .from('library_book_artists')
    .select('legacy_artist_no')
    .order('legacy_artist_no', { ascending: false })
    .limit(1)

  if (maxLegacyError) return { ok: false as const, error: maxLegacyError.message }

  let nextLegacyArtistNo = (maxLegacyRows?.[0]?.legacy_artist_no ?? 999999) + 1
  const rows = dedupedLinks.map((row) => {
    const legacyArtistNo = row.legacy_artist_no ?? nextLegacyArtistNo++
    return {
      book_id: bookId,
      artist_id: row.artist_id,
      legacy_artist_no: legacyArtistNo,
      is_default: row.is_default,
    }
  })

  const { error } = await supabase.from('library_book_artists').insert(rows)
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}

export async function POST(request: NextRequest) {
  const authorization = await requireRole(EDITOR_ROLES, request)
  if (authorization.response) return authorization.response

  const parsedPayload = parseCreateBody(await request.json())
  if (!parsedPayload) {
    return NextResponse.json({ error: 'Livre invalide.' }, { status: 400 })
  }

  const payload: BookInsertPayload = { ...parsedPayload.payload, created_by: authorization.userId }

  const { data, error } = await authorization.supabase
    .from('library_books')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const createdBookId = (data as { id?: string } | null)?.id
  if (!createdBookId) {
    return NextResponse.json({ error: 'Livre cree sans identifiant.' }, { status: 500 })
  }

  const authorLinkResult = await insertAuthorLinks(authorization.supabase, createdBookId, parsedPayload.authorLinks)
  if (!authorLinkResult.ok) {
    await authorization.supabase.from('library_books').delete().eq('id', createdBookId)
    return NextResponse.json({ error: authorLinkResult.error }, { status: 400 })
  }

  const artistLinkResult = await insertArtistLinks(authorization.supabase, createdBookId, parsedPayload.artistLinks)
  if (!artistLinkResult.ok) {
    await authorization.supabase.from('library_books').delete().eq('id', createdBookId)
    return NextResponse.json({ error: artistLinkResult.error }, { status: 400 })
  }

  return NextResponse.json({ book: data })
}
