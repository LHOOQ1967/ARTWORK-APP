import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'

type AuthorRow = { id: string; legacy_no: number; first_name: string | null; last_name: string | null }
type LinkedAuthorValue = { id: string; legacy_no: number; first_name: string | null; last_name: string | null }
type LinkedAuthorRow = { book_id: string; author: LinkedAuthorValue | LinkedAuthorValue[] | null }

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

function splitLegacyPeople(raw: string | null | undefined) {
  if (!raw) return []
  return raw
    .replace(/(^|\s)(et|and)(\s|$)/gi, ',')
    .split(/[,;/|+&]+/)
    .map((token) => token.trim())
    .filter(Boolean)
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

function personDisplayName(person: { first_name: string | null; last_name: string | null; legacy_no?: number | null }) {
  const name = [person.first_name, person.last_name].filter(Boolean).join(' ').trim()
  if (name) return name
  return person.legacy_no ? String(person.legacy_no) : ''
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
  const core = coreSignatureFromNormalized(normalized)
  return [normalized, signature, core].filter(Boolean)
}

function parseTypeNumber(value: string | null | undefined) {
  if (!value) return Number.NaN
  const numericToken = /\d+/.exec(value.trim())?.[0]
  return numericToken ? Number(numericToken) : Number.NaN
}

function compareTypeNumberValues(left: { type_number: string | null; description: string | null; legacy_no: number }, right: { type_number: string | null; description: string | null; legacy_no: number }) {
  const leftNumeric = parseTypeNumber(left.type_number) || parseTypeNumber(left.description)
  const rightNumeric = parseTypeNumber(right.type_number) || parseTypeNumber(right.description)
  const leftHasNumeric = Number.isFinite(leftNumeric)
  const rightHasNumeric = Number.isFinite(rightNumeric)

  if (leftHasNumeric && rightHasNumeric && leftNumeric !== rightNumeric) {
    return leftNumeric - rightNumeric
  }
  if (leftHasNumeric && !rightHasNumeric) return -1
  if (!leftHasNumeric && rightHasNumeric) return 1

  const byText = (left.type_number ?? '').localeCompare((right.type_number ?? ''), 'fr', { numeric: true, sensitivity: 'base' })
  if (byText !== 0) return byText

  const byDescription = (left.description ?? '').localeCompare((right.description ?? ''), 'fr', { sensitivity: 'base' })
  if (byDescription !== 0) return byDescription

  return left.legacy_no - right.legacy_no
}

export async function GET(request: NextRequest) {
  const authorization = await requireUser(request)
  if (authorization.response) return authorization.response

  const query = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  const view = request.nextUrl.searchParams.get('view') ?? 'books'
  const order = request.nextUrl.searchParams.get('order') ?? 'title'
  const sortByParam = request.nextUrl.searchParams.get('sortBy') ?? 'legacy'
  const sortDirParam = request.nextUrl.searchParams.get('sortDir') ?? 'desc'
  const artistId = request.nextUrl.searchParams.get('artistId')?.trim() ?? ''
  const authorId = request.nextUrl.searchParams.get('authorId')?.trim() ?? ''
  const publisherId = request.nextUrl.searchParams.get('publisherId')?.trim() ?? ''
  const typeId = request.nextUrl.searchParams.get('typeId')?.trim() ?? ''
  const statusId = request.nextUrl.searchParams.get('statusId')?.trim() ?? ''
  const typeNoParam = request.nextUrl.searchParams.get('typeNo')?.trim() ?? ''
  const yearFromParam = request.nextUrl.searchParams.get('yearFrom')?.trim() ?? ''
  const yearToParam = request.nextUrl.searchParams.get('yearTo')?.trim() ?? ''
  const authorQuery = request.nextUrl.searchParams.get('authorQ')?.trim() ?? ''
  const compactArtists = request.nextUrl.searchParams.get('compact') === '1'
  const compactAuthors = request.nextUrl.searchParams.get('compact') === '1'
  const countOnly = request.nextUrl.searchParams.get('countOnly') === '1'
  const includeTotal = request.nextUrl.searchParams.get('includeTotal') === '1'
  const loadAll = request.nextUrl.searchParams.get('all') === '1'
  const requestedLimit = Number(request.nextUrl.searchParams.get('limit') ?? 50)
  const limit = loadAll ? 50000 : Math.min(requestedLimit, 100)
  const offset = Math.max(Number(request.nextUrl.searchParams.get('offset') ?? 0), 0)
  const pageSize = Number.isFinite(limit) && limit > 0 ? limit : 50

  const sortBy = ['title', 'author', 'artist', 'year', 'isbn', 'legacy', 'type', 'publisher'].includes(sortByParam)
    ? sortByParam
    : 'legacy'
  const sortAscending = sortDirParam !== 'desc'
  const typeNoFilter = /^\d+$/.test(typeNoParam) ? Number(typeNoParam) : null
  const publisherNoFilter = /^\d+$/.test(publisherId) ? Number(publisherId) : null
  const typeIdFilter = /^\d+$/.test(typeId) ? Number(typeId) : null
  const typeIdIsNone = typeId === 'none'
  const statusIdFilter = /^\d+$/.test(statusId) ? Number(statusId) : null
  const statusIdIsNone = statusId === 'none'
  const yearFromFilter = /^\d{1,4}$/.test(yearFromParam) ? Number(yearFromParam) : null
  const yearToFilter = /^\d{1,4}$/.test(yearToParam) ? Number(yearToParam) : null

  if (view === 'artists') {
    const artistsSortBy = ['name', 'birth', 'death', 'legacy'].includes(sortByParam) ? sortByParam : 'name'
    let artistsSortColumn: 'last_name' | 'year_of_birth' | 'year_of_death' = 'last_name'
    if (artistsSortBy === 'birth') artistsSortColumn = 'year_of_birth'
    else if (artistsSortBy === 'death') artistsSortColumn = 'year_of_death'

    const artistsQuery = authorization.supabase
      .from('artists')
      .select(compactArtists ? 'id, first_name, last_name' : 'id, first_name, last_name, year_of_birth, year_of_death')
      .order(artistsSortColumn, { ascending: sortAscending, nullsFirst: false })
      .order('last_name', { ascending: true, nullsFirst: false })
      .order('first_name', { ascending: true, nullsFirst: false })
      .range(offset, offset + (Number.isFinite(limit) && limit > 0 ? limit : 50) - 1)
    const searchQuery = query.trim()
    const { data, error } = searchQuery
      ? compactArtists
        ? await artistsQuery.or(`first_name.ilike.${searchQuery}%,last_name.ilike.${searchQuery}%`)
        : await artistsQuery.or(`first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%`)
      : await artistsQuery
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ artists: data ?? [], hasMore: (data ?? []).length === limit })
  }

  if (view === 'authors') {
    const authorsSortBy = ['name', 'legacy'].includes(sortByParam) ? sortByParam : 'name'

    const authorsQuery = authorization.supabase
      .from('library_authors')
      .select(compactAuthors ? 'id, first_name, last_name' : 'id, legacy_no, first_name, last_name')
      .order(authorsSortBy === 'legacy' ? 'legacy_no' : 'last_name', { ascending: sortAscending, nullsFirst: false })
      .order('last_name', { ascending: true, nullsFirst: false })
      .order('first_name', { ascending: true, nullsFirst: false })
      .range(offset, offset + (Number.isFinite(limit) && limit > 0 ? limit : 50) - 1)
    const searchQuery = query.trim()
    const { data, error } = searchQuery
      ? compactAuthors
        ? await authorsQuery.or(`first_name.ilike.${searchQuery}%,last_name.ilike.${searchQuery}%`)
        : await authorsQuery.or(`first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%`)
      : await authorsQuery
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ authors: data ?? [], hasMore: (data ?? []).length === limit })
  }

  if (view === 'related-names') {
    const relatedSortBy = ['name', 'location', 'legacy'].includes(sortByParam) ? sortByParam : 'name'
    const relatedSortColumn = relatedSortBy === 'location'
      ? 'location'
      : relatedSortBy === 'legacy'
        ? 'legacy_no'
        : 'name'

    const namesQuery = authorization.supabase
      .from('library_related_names')
      .select('legacy_no, name, location')
      .order(relatedSortColumn, { ascending: sortAscending, nullsFirst: false })
      .order('name', { ascending: true, nullsFirst: false })
      .order('legacy_no', { ascending: true, nullsFirst: false })
      .range(offset, offset + (Number.isFinite(limit) && limit > 0 ? limit : 50) - 1)
    const { data, error } = query
      ? await namesQuery.or(`name.ilike.%${query}%,location.ilike.%${query}%`)
      : await namesQuery
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ relatedNames: data ?? [], hasMore: (data ?? []).length === limit })
  }

  if (view === 'types' || view === 'status') {
    if (view === 'types') {
      const { data, error } = await authorization.supabase.from('library_book_types').select('legacy_no, type_number, description, full_name').order('legacy_no', { ascending: true })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const sortedTypes = [...(data ?? [])].sort(compareTypeNumberValues)
      return NextResponse.json({ types: sortedTypes })
    }
    const { data, error } = await authorization.supabase.from('library_statuses').select('legacy_no, label').order('legacy_no', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ statuses: data ?? [] })
  }

  if (view === 'unresolved-artists') {
    const unresolvedQuery = authorization.supabase
      .from('library_unresolved_artists')
      .select('book_id, book_legacy_no, book_title, entered_at, search_artist, legacy_artist_no, is_default, created_by')
      .order('book_legacy_no', { ascending: true })
      .order('legacy_artist_no', { ascending: true })
      .range(offset, offset + (Number.isFinite(limit) && limit > 0 ? limit : 50) - 1)

    const { data, error } = query
      ? await unresolvedQuery.or(`book_title.ilike.%${query}%,search_artist.ilike.%${query}%`)
      : await unresolvedQuery

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ unresolvedArtists: data ?? [], hasMore: (data ?? []).length === limit })
  }

  if (view === 'unresolved-authors') {
    const rangeEnd = offset + (Number.isFinite(limit) && limit > 0 ? limit : 50) - 1
    const booksQuery = authorization.supabase
      .from('library_books')
      .select('id, legacy_no, title, entered_at, search_author, created_by')
      .not('search_author', 'is', null)
      .neq('search_author', '')
      .order('legacy_no', { ascending: true })
      .range(offset, rangeEnd)

    const { data: books, error: booksError } = query
      ? await booksQuery.or(`title.ilike.%${query}%,search_author.ilike.%${query}%`)
      : await booksQuery
    if (booksError) return NextResponse.json({ error: booksError.message }, { status: 500 })

    const selectedBooks = books ?? []
    if (selectedBooks.length === 0) {
      return NextResponse.json({ unresolvedAuthors: [], hasMore: false })
    }

    const bookIds = selectedBooks.map((book) => book.id)
    const [{ data: allAuthors, error: allAuthorsError }, { data: linkedAuthors, error: linkedAuthorsError }] = await Promise.all([
      authorization.supabase.from('library_authors').select('id, legacy_no, first_name, last_name'),
      authorization.supabase
        .from('library_book_authors')
        .select('book_id, author:library_authors(id, legacy_no, first_name, last_name)')
        .in('book_id', bookIds),
    ])

    if (allAuthorsError) return NextResponse.json({ error: allAuthorsError.message }, { status: 500 })
    if (linkedAuthorsError) return NextResponse.json({ error: linkedAuthorsError.message }, { status: 500 })

    const authorById = new Map<string, AuthorRow>()
    const authorIdsByKey = new Map<string, Set<string>>()
    for (const author of (allAuthors ?? []) as AuthorRow[]) {
      authorById.set(author.id, author)
      for (const key of personKeys(author.first_name, author.last_name)) {
        if (!authorIdsByKey.has(key)) authorIdsByKey.set(key, new Set<string>())
        authorIdsByKey.get(key)?.add(author.id)
      }
    }

    const linkedKeysByBook = new Map<string, Set<string>>()
    for (const row of (linkedAuthors ?? []) as LinkedAuthorRow[]) {
      const author = Array.isArray(row.author) ? row.author[0] ?? null : row.author
      if (!author) continue
      if (!linkedKeysByBook.has(row.book_id)) linkedKeysByBook.set(row.book_id, new Set<string>())
      const keySet = linkedKeysByBook.get(row.book_id)
      for (const key of personKeys(author.first_name, author.last_name)) {
        keySet?.add(key)
      }
    }

    const unresolvedAuthors: Array<{
      book_id: string
      book_legacy_no: number
      book_title: string | null
      entered_at: string | null
      search_author: string | null
      token_pos: number
      legacy_author_name: string
      candidate_count: number
      candidate_names: string | null
      resolution_status: 'no_match' | 'unique_match_not_linked' | 'ambiguous_match'
      created_by: string | null
    }> = []

    for (const book of selectedBooks) {
      const linkedKeys = linkedKeysByBook.get(book.id) ?? new Set<string>()
      const tokens = splitLegacyPeople(book.search_author)

      tokens.forEach((token, index) => {
        const keys = tokenKeys(token)
        if (keys.length === 0) return

        // Already resolved for this book if any linked author matches one of the token keys.
        if (keys.some((key) => linkedKeys.has(key))) return

        const candidateIds = new Set<string>()
        for (const key of keys) {
          const ids = authorIdsByKey.get(key)
          if (!ids) continue
          for (const id of ids) candidateIds.add(id)
        }

        const candidateCount = candidateIds.size
        const candidateNames = candidateCount > 0
          ? Array.from(candidateIds)
              .map((id) => authorById.get(id))
              .filter((item): item is AuthorRow => Boolean(item))
              .map((item) => personDisplayName(item))
              .filter(Boolean)
              .sort((a, b) => a.localeCompare(b))
              .join(', ')
          : null

        let resolutionStatus: 'no_match' | 'unique_match_not_linked' | 'ambiguous_match' = 'ambiguous_match'
        if (candidateCount === 0) resolutionStatus = 'no_match'
        else if (candidateCount === 1) resolutionStatus = 'unique_match_not_linked'

        unresolvedAuthors.push({
          book_id: book.id,
          book_legacy_no: book.legacy_no,
          book_title: book.title,
          entered_at: book.entered_at,
          search_author: book.search_author,
          token_pos: index + 1,
          legacy_author_name: token,
          candidate_count: candidateCount,
          candidate_names: candidateNames,
          resolution_status: resolutionStatus,
          created_by: book.created_by,
        })
      })
    }

    unresolvedAuthors.sort((a, b) => a.book_legacy_no - b.book_legacy_no || a.token_pos - b.token_pos)
    return NextResponse.json({ unresolvedAuthors, hasMore: selectedBooks.length === limit })
  }

  const isBookListView = view === 'books' || view === 'by-artists' || view === 'by-authors'

  let artistBookIds: string[] | null = null
  let authorBookIds: string[] | null = null
  if (view === 'by-artists' && artistId) {
    const { data: linkedBooks, error: linkedBooksError } = await authorization.supabase
      .from('library_book_artists')
      .select('book_id')
      .eq('artist_id', artistId)

    if (linkedBooksError) {
      return NextResponse.json({ error: linkedBooksError.message }, { status: 500 })
    }

    artistBookIds = Array.from(new Set((linkedBooks ?? []).map((row) => row.book_id)))
    if (artistBookIds.length === 0) {
      return NextResponse.json({ books: [], hasMore: false, totalCount: 0 })
    }
  }

  if (view === 'by-authors' && authorId) {
    const { data: linkedBooks, error: linkedBooksError } = await authorization.supabase
      .from('library_book_authors')
      .select('book_id')
      .eq('author_id', authorId)

    if (linkedBooksError) {
      return NextResponse.json({ error: linkedBooksError.message }, { status: 500 })
    }

    authorBookIds = Array.from(new Set((linkedBooks ?? []).map((row) => row.book_id)))
    if (authorBookIds.length === 0) {
      return NextResponse.json({ books: [], hasMore: false, totalCount: 0 })
    }
  }

  function applyBookFilters<T>(queryBuilder: T): T {
    let nextQuery = queryBuilder as Record<string, unknown>

    if (artistBookIds && artistBookIds.length > 0) {
      nextQuery = (nextQuery as { in: (column: string, values: string[]) => unknown }).in('id', artistBookIds) as Record<string, unknown>
    }
    if (authorBookIds && authorBookIds.length > 0) {
      nextQuery = (nextQuery as { in: (column: string, values: string[]) => unknown }).in('id', authorBookIds) as Record<string, unknown>
    }
    if (publisherNoFilter !== null) {
      nextQuery = (nextQuery as { eq: (column: string, value: number) => unknown }).eq('publisher_no', publisherNoFilter) as Record<string, unknown>
    }
    if (typeIdFilter !== null) {
      nextQuery = (nextQuery as { eq: (column: string, value: number) => unknown }).eq('type_no', typeIdFilter) as Record<string, unknown>
    } else if (typeIdIsNone) {
      nextQuery = (nextQuery as { or: (filters: string) => unknown }).or('type_no.is.null,type_no.eq.0') as Record<string, unknown>
    }
    if (statusIdFilter !== null) {
      nextQuery = (nextQuery as { eq: (column: string, value: number) => unknown }).eq('status_no', statusIdFilter) as Record<string, unknown>
    } else if (statusIdIsNone) {
      nextQuery = (nextQuery as { is: (column: string, value: null) => unknown }).is('status_no', null) as Record<string, unknown>
    }

    if (typeNoFilter !== null) {
      nextQuery = (nextQuery as { eq: (column: string, value: number) => unknown }).eq('type_no', typeNoFilter) as Record<string, unknown>
    }
    if (yearFromFilter !== null) {
      nextQuery = (nextQuery as { gte: (column: string, value: number) => unknown }).gte('publication_year', yearFromFilter) as Record<string, unknown>
    }
    if (yearToFilter !== null) {
      nextQuery = (nextQuery as { lte: (column: string, value: number) => unknown }).lte('publication_year', yearToFilter) as Record<string, unknown>
    }
    if (authorQuery) {
      nextQuery = (nextQuery as { ilike: (column: string, pattern: string) => unknown }).ilike('search_author', `%${authorQuery}%`) as Record<string, unknown>
    }

    if (query) {
      let searchColumn: 'search_artist' | 'search_author' | null = null
      if (view === 'by-artists') searchColumn = 'search_artist'
      else if (view === 'by-authors') searchColumn = 'search_author'

      if (searchColumn) {
        nextQuery = (nextQuery as { ilike: (column: string, pattern: string) => unknown }).ilike(searchColumn, `%${query}%`) as Record<string, unknown>
      } else {
        const searchFilters = [
          `title.ilike.%${query}%`,
          `isbn.ilike.%${query}%`,
          `series.ilike.%${query}%`,
          `volume.ilike.%${query}%`,
          `copy.ilike.%${query}%`,
          `remarks.ilike.%${query}%`,
          `search_author.ilike.%${query}%`,
          `search_artist.ilike.%${query}%`,
          `search_publisher.ilike.%${query}%`,
          `search_exhibition.ilike.%${query}%`,
        ]
        if (/^\d+$/.test(query)) {
          searchFilters.push(`legacy_no.eq.${Number(query)}`)
        }

        nextQuery = (nextQuery as { or: (filters: string) => unknown }).or(searchFilters.join(',')) as Record<string, unknown>
      }
    }

    return nextQuery as T
  }

  if (countOnly && (view === 'books' || view === 'by-artists' || view === 'by-authors' || view === 'by-publisher' || view === 'by-types' || view === 'by-status')) {
    let countQuery = authorization.supabase
      .from('library_books')
      .select('id', { count: 'exact', head: true })

    countQuery = applyBookFilters(countQuery)

    const { count: totalCount, error: countError } = await countQuery
    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 })
    }

    return NextResponse.json({ totalCount: totalCount ?? 0 })
  }

  let booksQuery = authorization.supabase
    .from('library_books')
    .select(`
      id, legacy_no, title, publication_year, type_no, status_no, publisher_no, volume, series, isbn, copy, remarks, search_artist, search_author, search_publisher, search_exhibition,
      cover_image_url,
      library_book_authors(author:library_authors(last_name, first_name)),
      library_book_artists(artist:artists(id, first_name, last_name))
    `)
    .range(offset, offset + pageSize)

  if (isBookListView && (sortBy === 'type' || sortBy === 'publisher')) {
    let allBooksQuery = authorization.supabase
      .from('library_books')
      .select(`
        id, legacy_no, title, publication_year, type_no, status_no, publisher_no, volume, series, isbn, copy, remarks, search_artist, search_author, search_publisher, search_exhibition,
        cover_image_url,
        library_book_authors(author:library_authors(last_name, first_name)),
        library_book_artists(artist:artists(id, first_name, last_name))
      `)

    allBooksQuery = applyBookFilters(allBooksQuery)

    const { data: allRows, error: allRowsError } = await allBooksQuery
    if (allRowsError) {
      return NextResponse.json({ error: allRowsError.message }, { status: 500 })
    }

    const allBooks = (allRows ?? []) as Array<{
      id: string
      legacy_no: number
      title: string | null
      publication_year: number | null
      type_no: number | null
      status_no: number | null
      publisher_no: number | null
      volume: string | null
      series: string | null
      isbn: string | null
      copy: string | null
      remarks: string | null
      search_artist: string | null
      search_author: string | null
      search_publisher: string | null
      search_exhibition: string | null
      cover_image_url: string | null
      library_book_authors?: Array<{ author: { last_name: string | null; first_name: string | null } | Array<{ last_name: string | null; first_name: string | null }> | null }>
      library_book_artists?: Array<{ artist: { first_name: string | null; last_name: string | null } | Array<{ first_name: string | null; last_name: string | null }> | null }>
    }>

    const typeNos = Array.from(new Set(allBooks.map((row) => row.type_no).filter((value): value is number => typeof value === 'number')))
    const publisherNos = Array.from(new Set(allBooks.map((row) => row.publisher_no).filter((value): value is number => typeof value === 'number')))

    const [{ data: typeRows, error: typesError }, { data: publisherRows, error: publishersError }] = await Promise.all([
      typeNos.length > 0
        ? authorization.supabase.from('library_book_types').select('legacy_no, type_number, description').in('legacy_no', typeNos)
        : Promise.resolve({ data: [], error: null }),
      publisherNos.length > 0
        ? authorization.supabase.from('library_related_names').select('legacy_no, name').in('legacy_no', publisherNos)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (typesError) {
      return NextResponse.json({ error: typesError.message }, { status: 500 })
    }
    if (publishersError) {
      return NextResponse.json({ error: publishersError.message }, { status: 500 })
    }

    const typeByLegacy = new Map<number, { type_number: string; description: string }>()
    for (const row of (typeRows ?? []) as Array<{ legacy_no: number; type_number: string | null; description: string | null }>) {
      typeByLegacy.set(row.legacy_no, { type_number: row.type_number ?? '', description: row.description ?? '' })
    }

    const publisherByLegacy = new Map<number, string>()
    for (const row of (publisherRows ?? []) as Array<{ legacy_no: number; name: string | null }>) {
      publisherByLegacy.set(row.legacy_no, row.name ?? '')
    }

    const normalize = (value: string | null | undefined) => (value ?? '').toLocaleLowerCase()
    const enrichedBooks = allBooks.map((row) => {
      const typeData = row.type_no ? typeByLegacy.get(row.type_no) : undefined
      return {
        ...row,
        type_number: typeData?.type_number ?? '',
        type_description: typeData?.description ?? '',
        publisher_label: row.publisher_no ? (publisherByLegacy.get(row.publisher_no) ?? '') : (row.search_publisher ?? ''),
      }
    })

    enrichedBooks.sort((left, right) => {
      let compare = 0
      if (sortBy === 'type') {
        compare = normalize(left.type_number).localeCompare(normalize(right.type_number), 'fr', { numeric: true })
        if (compare === 0) {
          const leftYear = left.publication_year ?? Number.POSITIVE_INFINITY
          const rightYear = right.publication_year ?? Number.POSITIVE_INFINITY
          compare = leftYear - rightYear
        }
      } else {
        compare = normalize(left.publisher_label).localeCompare(normalize(right.publisher_label), 'fr')
      }

      if (compare === 0) {
        compare = normalize(left.title).localeCompare(normalize(right.title), 'fr')
      }

      return sortAscending ? compare : -compare
    })

    const pagedBooks = loadAll ? enrichedBooks : enrichedBooks.slice(offset, offset + limit)
    return NextResponse.json({ books: pagedBooks, hasMore: loadAll ? false : offset + limit < enrichedBooks.length, totalCount: enrichedBooks.length })
  }

  if (isBookListView) {
    let sortColumn: 'legacy_no' | 'publication_year' | 'isbn' | 'search_artist' | 'search_author' | 'title' = 'title'
    if (sortBy === 'legacy') sortColumn = 'legacy_no'
    else if (sortBy === 'year') sortColumn = 'publication_year'
    else if (sortBy === 'isbn') sortColumn = 'isbn'
    else if (sortBy === 'artist') sortColumn = 'search_artist'
    else if (sortBy === 'author') sortColumn = 'search_author'

    booksQuery = booksQuery
      .order(sortColumn, { ascending: sortAscending, nullsFirst: false })
      .order('legacy_no', { ascending: true, nullsFirst: false })
  } else {
    booksQuery = booksQuery.order(order === 'artist' ? 'search_artist' : 'title', { ascending: true, nullsFirst: false })
  }

  booksQuery = applyBookFilters(booksQuery)

  const { data, error } = await booksQuery
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const fetchedRows = (data ?? []) as Array<{
    id: string
    legacy_no: number
    title: string | null
    publication_year: number | null
    type_no: number | null
    publisher_no: number | null
    volume: string | null
    series: string | null
    isbn: string | null
    copy: string | null
    remarks: string | null
    search_artist: string | null
    search_publisher: string | null
    cover_image_url: string | null
    library_book_authors?: Array<{ author: { last_name: string | null; first_name: string | null } | Array<{ last_name: string | null; first_name: string | null }> | null }>
    library_book_artists?: Array<{ artist: { first_name: string | null; last_name: string | null } | Array<{ first_name: string | null; last_name: string | null }> | null }>
  }>

  const hasMore = !loadAll && fetchedRows.length > pageSize
  const rows = hasMore ? fetchedRows.slice(0, pageSize) : fetchedRows

  const typeNos = Array.from(new Set(rows.map((row) => row.type_no).filter((value): value is number => typeof value === 'number')))
  const publisherNos = Array.from(new Set(rows.map((row) => row.publisher_no).filter((value): value is number => typeof value === 'number')))

  const [{ data: typeRows, error: typesError }, { data: publisherRows, error: publishersError }] = await Promise.all([
    typeNos.length > 0
      ? authorization.supabase.from('library_book_types').select('legacy_no, type_number, description').in('legacy_no', typeNos)
      : Promise.resolve({ data: [], error: null }),
    publisherNos.length > 0
      ? authorization.supabase.from('library_related_names').select('legacy_no, name').in('legacy_no', publisherNos)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (typesError) {
    return NextResponse.json({ error: typesError.message }, { status: 500 })
  }
  if (publishersError) {
    return NextResponse.json({ error: publishersError.message }, { status: 500 })
  }

  const typeByLegacy = new Map<number, { type_number: string; description: string }>()
  for (const row of (typeRows ?? []) as Array<{ legacy_no: number; type_number: string | null; description: string | null }>) {
    typeByLegacy.set(row.legacy_no, { type_number: row.type_number ?? '', description: row.description ?? '' })
  }

  const publisherByLegacy = new Map<number, string>()
  for (const row of (publisherRows ?? []) as Array<{ legacy_no: number; name: string | null }>) {
    publisherByLegacy.set(row.legacy_no, row.name ?? '')
  }

  const books = rows.map((row) => ({
    ...row,
    type_abbrev: row.type_no ? (typeByLegacy.get(row.type_no)?.type_number ?? '') : '',
    type_description: row.type_no ? (typeByLegacy.get(row.type_no)?.description ?? '') : '',
    publisher_label: row.publisher_no ? (publisherByLegacy.get(row.publisher_no) ?? '') : (row.search_publisher ?? ''),
  }))

  if (!includeTotal) {
    return NextResponse.json({ books, hasMore, totalCount: loadAll ? rows.length : null })
  }

  let countQuery = authorization.supabase
    .from('library_books')
    .select('id', { count: 'exact', head: true })

  countQuery = applyBookFilters(countQuery)

  const { count: totalCount, error: countError } = await countQuery
  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 })
  }

  const safeTotalCount = totalCount ?? rows.length
  return NextResponse.json({ books, hasMore: offset + rows.length < safeTotalCount, totalCount: safeTotalCount })
}