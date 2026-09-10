import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'

const EDITOR_ROLES = ['Editor', 'Administrator'] as const
type EditorRole = (typeof EDITOR_ROLES)[number]

function isEditorRole(role: unknown): role is EditorRole {
  return role === 'Editor' || role === 'Administrator'
}

function parseNullableString(value: unknown): string | null {
  if (value === undefined) return null
  if (value === null) return null
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

function parseNullableDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return value
}

const INTEGER_FIELDS: Record<string, string> = {
  type_no: 'Type invalide.',
  status_no: 'Status invalide.',
  publisher_no: 'Publisher invalide.',
  publication_year: 'Année invalide.',
}

const TEXT_FIELDS = [
  'title',
  'volume',
  'series',
  'remarks',
  'isbn',
  'cover_image_url',
  'copy',
  'search_artist',
  'search_author',
  'search_exhibition',
  'search_publisher',
] as const

function isProvidedInteger(value: unknown): boolean {
  return value !== undefined && value !== null && value !== ''
}

function parseUpdatePayload(body: Record<string, unknown>) {
  const updatePayload: Record<string, unknown> = {}

  if (Object.hasOwn(body, 'entered_at')) {
    const enteredAt = parseNullableDate(body.entered_at)
    if (isProvidedInteger(body.entered_at) && enteredAt === null) {
      return { error: 'Date de saisie invalide.' }
    }
    updatePayload.entered_at = enteredAt
  }

  for (const [field, message] of Object.entries(INTEGER_FIELDS)) {
    if (!Object.hasOwn(body, field)) continue
    const parsed = parseNullableInteger(body[field])
    if (isProvidedInteger(body[field]) && parsed === null) {
      return { error: message }
    }
    updatePayload[field] = parsed
  }

  for (const field of TEXT_FIELDS) {
    if (!Object.hasOwn(body, field)) continue
    updatePayload[field] = parseNullableString(body[field])
  }

  return { payload: updatePayload }
}

type AuthorLinkInput = { author_id: string; is_default: boolean }
type ArtistLinkInput = { artist_id: string | null; legacy_artist_no?: number | null; is_default: boolean }
type CatalogAuthor = { id: string; legacy_no: number; first_name: string | null; last_name: string | null }
type BookAuthorRow = { author_id: string; is_default: boolean; author: CatalogAuthor | null }

function normalizeBookAuthorRows(rows: unknown): BookAuthorRow[] {
  if (!Array.isArray(rows)) return []

  const normalized: BookAuthorRow[] = []
  for (const rawRow of rows) {
    if (!rawRow || typeof rawRow !== 'object') continue

    const row = rawRow as {
      author_id?: unknown
      is_default?: unknown
      author?: unknown
    }

    if (typeof row.author_id !== 'string' || !row.author_id) continue

    const authorValue = Array.isArray(row.author) ? row.author[0] : row.author
    let author: CatalogAuthor | null = null

    if (authorValue && typeof authorValue === 'object') {
      const candidate = authorValue as {
        id?: unknown
        legacy_no?: unknown
        first_name?: unknown
        last_name?: unknown
      }

      if (typeof candidate.id === 'string' && typeof candidate.legacy_no === 'number') {
        author = {
          id: candidate.id,
          legacy_no: candidate.legacy_no,
          first_name: typeof candidate.first_name === 'string' ? candidate.first_name : null,
          last_name: typeof candidate.last_name === 'string' ? candidate.last_name : null,
        }
      }
    }

    normalized.push({
      author_id: row.author_id,
      is_default: Boolean(row.is_default),
      author,
    })
  }

  return normalized
}

function normalizePersonName(value: string | null | undefined) {
  if (!value) return ''
  return value
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[-/]/g, ' ')
    .replaceAll('&', ' et ')
    .replaceAll('œ', 'oe')
    .replaceAll('æ', 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function signatureFromNormalized(normalized: string) {
  if (!normalized) return ''
  const parts = normalized.split(' ').filter(Boolean)
  const sortedParts = parts.toSorted((a, b) => a.localeCompare(b))
  return sortedParts.join(' ')
}

function coreSignatureFromNormalized(normalized: string) {
  if (!normalized) return ''
  const particles = new Set(['de', 'la', 'le', 'les', 'du', 'des', 'd', 'da', 'del', 'della', 'van', 'von'])
  const parts = normalized.split(' ').filter((part) => part && !particles.has(part))
  const sortedParts = parts.toSorted((a, b) => a.localeCompare(b))
  return sortedParts.join(' ')
}

function splitLegacyAuthors(raw: string | null | undefined) {
  if (!raw) return []
  return raw
    .replace(/(^|\s)(et|and)(\s|$)/gi, ',')
    .split(/[,;/|+&]+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function personKeys(firstName: string | null, lastName: string | null) {
  const fullA = normalizePersonName(`${firstName ?? ''} ${lastName ?? ''}`)
  const fullB = normalizePersonName(`${lastName ?? ''} ${firstName ?? ''}`)
  const sigA = signatureFromNormalized(fullA)
  const sigB = signatureFromNormalized(fullB)
  const coreA = coreSignatureFromNormalized(fullA)
  const coreB = coreSignatureFromNormalized(fullB)
  return [fullA, fullB, sigA, sigB, coreA, coreB].filter(Boolean)
}

function tokenKeys(token: string) {
  const normalized = normalizePersonName(token)
  const signature = signatureFromNormalized(normalized)
  const coreSignature = coreSignatureFromNormalized(normalized)
  return [normalized, signature, coreSignature].filter(Boolean)
}

function parseTypeNumber(value: string | null | undefined) {
  if (!value) return Number.NaN
  const numericToken = /\d+/.exec(value.trim())?.[0]
  return numericToken ? Number(numericToken) : Number.NaN
}

function compareTypeRows(left: { legacy_no: number; type_number: string | null; description: string | null; full_name: string | null }, right: { legacy_no: number; type_number: string | null; description: string | null; full_name: string | null }) {
  const leftValue = left.type_number ?? left.description ?? left.full_name ?? ''
  const rightValue = right.type_number ?? right.description ?? right.full_name ?? ''
  const leftNumeric = parseTypeNumber(leftValue)
  const rightNumeric = parseTypeNumber(rightValue)
  const leftHasNumeric = Number.isFinite(leftNumeric)
  const rightHasNumeric = Number.isFinite(rightNumeric)

  if (leftHasNumeric && rightHasNumeric && leftNumeric !== rightNumeric) return leftNumeric - rightNumeric
  if (leftHasNumeric && !rightHasNumeric) return -1
  if (!leftHasNumeric && rightHasNumeric) return 1

  const byValue = leftValue.localeCompare(rightValue, 'fr', { numeric: true, sensitivity: 'base' })
  if (byValue !== 0) return byValue
  return left.legacy_no - right.legacy_no
}

function buildAuthorLookup(allAuthors: CatalogAuthor[]) {
  const authorById = new Map<string, CatalogAuthor>()
  const authorIdsByKey = new Map<string, Set<string>>()

  for (const author of allAuthors) {
    authorById.set(author.id, author)
    for (const key of personKeys(author.first_name, author.last_name)) {
      if (!authorIdsByKey.has(key)) authorIdsByKey.set(key, new Set<string>())
      authorIdsByKey.get(key)?.add(author.id)
    }
  }

  return { authorById, authorIdsByKey }
}

function collectCandidateIds(token: string, authorIdsByKey: Map<string, Set<string>>) {
  const candidateIds = new Set<string>()
  for (const key of tokenKeys(token)) {
    const ids = authorIdsByKey.get(key)
    if (!ids) continue
    for (const id of ids) candidateIds.add(id)
  }
  return candidateIds
}

function mergeMissingAuthorLinksFromSearch(
  existingLinks: BookAuthorRow[],
  allAuthors: CatalogAuthor[],
  searchAuthor: string | null | undefined
) {
  const tokens = splitLegacyAuthors(searchAuthor)
  if (tokens.length === 0 || allAuthors.length === 0) return existingLinks

  const { authorById, authorIdsByKey } = buildAuthorLookup(allAuthors)

  const usedIds = new Set(existingLinks.map((row) => row.author_id))
  const hasDefault = existingLinks.some((row) => row.is_default)
  const additions: BookAuthorRow[] = []

  for (const token of tokens) {
    const candidateIds = collectCandidateIds(token, authorIdsByKey)

    if (candidateIds.size !== 1) continue
    const matchedId = Array.from(candidateIds)[0]
    if (!matchedId || usedIds.has(matchedId)) continue
    const matchedAuthor = authorById.get(matchedId)
    if (!matchedAuthor) continue

    usedIds.add(matchedId)
    additions.push({
      author_id: matchedId,
      is_default: !hasDefault && existingLinks.length === 0 && additions.length === 0,
      author: matchedAuthor,
    })
  }

  return additions.length > 0 ? [...existingLinks, ...additions] : existingLinks
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

async function updateBookFields(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabaseServer').supabaseServer>>,
  id: string,
  updatePayload: Record<string, unknown>
) {
  if (Object.keys(updatePayload).length === 0) return { ok: true as const }

  const { data, error } = await supabase
    .from('library_books')
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) return { ok: false as const, status: 400, error: error.message }
  if (!data) return { ok: false as const, status: 404, error: 'Book not found' }
  return { ok: true as const }
}

async function replaceAuthorLinks(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabaseServer').supabaseServer>>,
  id: string,
  authorLinks: AuthorLinkInput[]
) {
  const { error: deleteAuthorsError } = await supabase
    .from('library_book_authors')
    .delete()
    .eq('book_id', id)
  if (deleteAuthorsError) return { ok: false as const, status: 400, error: deleteAuthorsError.message }

  if (authorLinks.length === 0) return { ok: true as const }

  const { error: insertAuthorsError } = await supabase
    .from('library_book_authors')
    .insert(authorLinks.map((row) => ({ book_id: id, author_id: row.author_id, is_default: row.is_default })))
  if (insertAuthorsError) return { ok: false as const, status: 400, error: insertAuthorsError.message }

  return { ok: true as const }
}

async function replaceArtistLinks(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabaseServer').supabaseServer>>,
  id: string,
  artistLinks: ArtistLinkInput[]
) {
  const { error: deleteArtistsError } = await supabase
    .from('library_book_artists')
    .delete()
    .eq('book_id', id)
  if (deleteArtistsError) return { ok: false as const, status: 400, error: deleteArtistsError.message }

  const dedupedArtistLinks = dedupeArtistLinksForWrite(artistLinks)
  if (dedupedArtistLinks.length === 0) return { ok: true as const }

  const { data: maxLegacyRows, error: maxLegacyError } = await supabase
    .from('library_book_artists')
    .select('legacy_artist_no')
    .order('legacy_artist_no', { ascending: false })
    .limit(1)

  if (maxLegacyError) return { ok: false as const, status: 400, error: maxLegacyError.message }

  let nextLegacyArtistNo = (maxLegacyRows?.[0]?.legacy_artist_no ?? 999999) + 1
  const rows = dedupedArtistLinks.map((row) => {
    const legacyArtistNo = row.legacy_artist_no ?? nextLegacyArtistNo++
    return {
      book_id: id,
      artist_id: row.artist_id,
      legacy_artist_no: legacyArtistNo,
      is_default: row.is_default,
    }
  })

  const { error: insertArtistsError } = await supabase
    .from('library_book_artists')
    .insert(rows)
  if (insertArtistsError) return { ok: false as const, status: 400, error: insertArtistsError.message }

  return { ok: true as const }
}

type ParsedPatchBody = {
  updatePayload: Record<string, unknown>
  authorLinks: AuthorLinkInput[] | null
  artistLinks: ArtistLinkInput[] | null
}

function parsePatchBody(body: Record<string, unknown>) {
  const parsed = parseUpdatePayload(body)
  if ('error' in parsed) return { error: parsed.error }

  const hasAuthorLinks = Object.hasOwn(body, 'author_links')
  const hasArtistLinks = Object.hasOwn(body, 'artist_links')
  const authorLinks = hasAuthorLinks ? parseAuthorLinks(body.author_links) : null
  const artistLinks = hasArtistLinks ? parseArtistLinks(body.artist_links) : null

  if (hasAuthorLinks && authorLinks === null) return { error: 'Liens auteurs invalides.' }
  if (hasArtistLinks && artistLinks === null) return { error: 'Liens artistes invalides.' }

  if (Object.keys(parsed.payload).length === 0 && !hasAuthorLinks && !hasArtistLinks) {
    return { error: 'Aucun champ modifiable fourni.' }
  }

  return {
    payload: {
      updatePayload: parsed.payload,
      authorLinks,
      artistLinks,
    } satisfies ParsedPatchBody,
  }
}

async function applyPatchChanges(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabaseServer').supabaseServer>>,
  id: string,
  patchBody: ParsedPatchBody
) {
  const bookUpdateResult = await updateBookFields(supabase, id, patchBody.updatePayload)
  if (!bookUpdateResult.ok) return bookUpdateResult

  if (patchBody.authorLinks) {
    const authorUpdateResult = await replaceAuthorLinks(supabase, id, patchBody.authorLinks)
    if (!authorUpdateResult.ok) return authorUpdateResult
  }

  if (patchBody.artistLinks) {
    const artistUpdateResult = await replaceArtistLinks(supabase, id, patchBody.artistLinks)
    if (!artistUpdateResult.ok) return artistUpdateResult
  }

  return { ok: true as const }
}

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
    supabase.from('library_book_authors').select('author_id, is_default, author:library_authors(id, legacy_no, first_name, last_name)').eq('book_id', id),
    supabase.from('library_book_artists').select('is_default, legacy_artist_no, artist:artists(id, first_name, last_name, year_of_birth, year_of_death)').eq('book_id', id),
    supabase.from('library_exhibitions').select('legacy_no, starts_on, ends_on, related_name:library_related_names(legacy_no, name, location)').eq('book_id', id).order('starts_on', { ascending: true }),
    supabase.from('library_book_types').select('legacy_no, type_number, description, full_name'),
    supabase.from('library_statuses').select('legacy_no, label'),
  ])

  const error = bookResult.error ?? authorsResult.error ?? artistsResult.error ?? exhibitionsResult.error ?? typeResult.error ?? statusResult.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!bookResult.data) return NextResponse.json({ error: 'Book not found' }, { status: 404 })

  const sortedTypes = [...(typeResult.data ?? []) as Array<{ legacy_no: number; type_number: string | null; description: string | null; full_name: string | null }>].sort(compareTypeRows)

  const createdBy = (bookResult.data as { created_by?: unknown }).created_by
  const searchAuthor = (bookResult.data as { search_author?: unknown }).search_author
  const linkedAuthors = normalizeBookAuthorRows(authorsResult.data)
  const shouldAugmentAuthors = typeof searchAuthor === 'string' && Boolean(searchAuthor.trim())

  let responseAuthors: BookAuthorRow[] = linkedAuthors
  if (shouldAugmentAuthors) {
    const authorCatalogResult = await supabase
      .from('library_authors')
      .select('id, legacy_no, first_name, last_name')

    if (authorCatalogResult.error) {
      return NextResponse.json({ error: authorCatalogResult.error.message }, { status: 500 })
    }

    responseAuthors = mergeMissingAuthorLinksFromSearch(
      linkedAuthors,
      (authorCatalogResult.data ?? []) as CatalogAuthor[],
      searchAuthor as string
    )
  }

  const creatorResult = typeof createdBy === 'string' && createdBy
    ? await supabase.from('profiles').select('id, email').eq('id', createdBy).maybeSingle()
    : { data: null, error: null }

  if (creatorResult.error) return NextResponse.json({ error: creatorResult.error.message }, { status: 500 })

  return NextResponse.json({
    book: bookResult.data,
    creator: creatorResult.data,
    authors: responseAuthors,
    artists: artistsResult.data ?? [],
    exhibitions: exhibitionsResult.data ?? [],
    types: sortedTypes,
    statuses: statusResult.data ?? [],
  })
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authorization = await requireUser(request)
  if (authorization.response) return authorization.response

  if (!isEditorRole(authorization.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await context.params
  if (!id) return NextResponse.json({ error: 'Book id missing' }, { status: 400 })

  const body = await request.json() as Record<string, unknown>
  const parsedBody = parsePatchBody(body)
  if ('error' in parsedBody) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 })
  }

  const updateResult = await applyPatchChanges(authorization.supabase, id, parsedBody.payload)
  if (!updateResult.ok) {
    return NextResponse.json({ error: updateResult.error }, { status: updateResult.status })
  }

  const { data: refreshedBook, error: refreshedBookError } = await authorization.supabase
    .from('library_books')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (refreshedBookError) return NextResponse.json({ error: refreshedBookError.message }, { status: 500 })
  if (!refreshedBook) return NextResponse.json({ error: 'Book not found' }, { status: 404 })

  return NextResponse.json({ book: refreshedBook })
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authorization = await requireUser(request)
  if (authorization.response) return authorization.response

  if (!isEditorRole(authorization.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await context.params
  if (!id) return NextResponse.json({ error: 'Book id missing' }, { status: 400 })

  const { error } = await authorization.supabase
    .from('library_books')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}