'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import SearchSelect from '@/components/ui/SearchSelect'
import { privateImageUrl } from '@/lib/privateImageUrl'

const PAGE_SIZE = 50

type BookSortKey = 'title' | 'author' | 'artist' | 'year' | 'type' | 'publisher' | 'isbn' | 'legacy'
type ArtistSortKey = 'name' | 'birth' | 'death' | 'legacy'
type AuthorSortKey = 'name' | 'legacy'
type RelatedSortKey = 'name' | 'location' | 'legacy'
type SortDirection = 'asc' | 'desc'

type LibraryView = 'books' | 'by-authors' | 'by-artists' | 'by-publisher' | 'by-types' | 'by-status' | 'artists' | 'authors' | 'related-names' | 'types' | 'status' | 'unresolved-artists' | 'unresolved-authors'

type LibraryBook = {
  id: string
  legacy_no: number
  title: string | null
  publication_year: number | null
  type_no: number | null
  type_abbrev?: string | null
  type_description?: string | null
  publisher_no: number | null
  publisher_label?: string | null
  volume: string | null
  series: string | null
  isbn: string | null
  copy: string | null
  remarks: string | null
  search_artist: string | null
  search_publisher?: string | null
  cover_image_url?: string | null
  library_book_authors?: Array<{ author: { last_name: string | null; first_name: string | null } | null }>
  library_book_artists?: Array<{ artist: { first_name: string | null; last_name: string | null } | null }>
}

type LibraryArtist = { id: string; legacy_no: number; first_name: string | null; last_name: string | null; year_of_birth: number | null; year_of_death: number | null }
type LibraryAuthor = { id: string; legacy_no: number; first_name: string | null; last_name: string | null }
type RelatedName = { legacy_no: number; name: string | null; location: string | null }
type BookType = { legacy_no: number; type_number: string | null; description: string | null; full_name: string | null }
type LibraryStatus = { legacy_no: number; label: string }
type UnresolvedArtist = {
  book_id: string
  book_legacy_no: number
  book_title: string | null
  entered_at: string | null
  search_artist: string | null
  legacy_artist_no: number
  is_default: boolean
  created_by: string | null
}

type UnresolvedAuthor = {
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
}

type ArtistFilterOption = { id: string; label: string }
type AuthorFilterOption = { id: string; label: string }
type PublisherFilterOption = { id: string; label: string }
type StatusFilterOption = { id: string; label: string }
type TypeFilterOption = { legacy_no: number; description: string | null; type_number: string | null }

const libraryViews = ['books', 'by-authors', 'by-artists', 'by-publisher', 'by-types', 'by-status', 'artists', 'authors', 'related-names', 'types', 'status', 'unresolved-artists', 'unresolved-authors'] as const

function isLibraryView(value: string | null): value is LibraryView {
  return typeof value === 'string' && (libraryViews as readonly string[]).includes(value)
}

function personName(person: { first_name: string | null; last_name: string | null } | null) {
  return person ? [person.first_name, person.last_name].filter(Boolean).join(' ') : ''
}

function compareTypeNumbers(left: string | null, right: string | null) {
  const leftValue = (left ?? '').trim()
  const rightValue = (right ?? '').trim()
  if (!leftValue && !rightValue) return 0
  if (!leftValue) return 1
  if (!rightValue) return -1

  const leftPrefix = Number(/\d+/.exec(leftValue)?.[0] ?? Number.NaN)
  const rightPrefix = Number(/\d+/.exec(rightValue)?.[0] ?? Number.NaN)
  const leftHasNumeric = Number.isFinite(leftPrefix)
  const rightHasNumeric = Number.isFinite(rightPrefix)

  if (leftHasNumeric && rightHasNumeric && leftPrefix !== rightPrefix) {
    return leftPrefix - rightPrefix
  }
  if (leftHasNumeric && !rightHasNumeric) return -1
  if (!leftHasNumeric && rightHasNumeric) return 1

  return leftValue.localeCompare(rightValue, 'fr', { numeric: true, sensitivity: 'base' })
}

function typeSortValue(typeNumber: string | null, description: string | null) {
  if (typeNumber?.trim()) return typeNumber
  return description ?? ''
}

function normalizeIsbn(value: string | null) {
  if (!value) return ''
  return value.replace(/[^0-9Xx]/g, '').toUpperCase()
}

function openLibraryCoverUrl(isbn: string, size: 'S' | 'M' | 'L') {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-${size}.jpg?default=false`
}

function abebooksSearchUrl(isbn: string) {
  return `https://www.abebooks.com/servlet/SearchResults?isbn=${isbn}`
}

function BookCoverThumb({
  bookId,
  coverImageUrl,
  isbn,
  title,
}: Readonly<{
  bookId: string
  coverImageUrl?: string | null
  isbn: string | null
  title: string | null
}>) {
  const normalizedIsbn = normalizeIsbn(isbn)
  const [failedSource, setFailedSource] = useState<'open-library' | null>(null)
  const manualCoverUrl = privateImageUrl(coverImageUrl)

  if (manualCoverUrl) {
    return (
      <div className="flex flex-col items-center gap-1">
        <Link href={`/library/books/${bookId}`} title={title ? `Open ${title} in ArtMuse` : 'Open in ArtMuse'}>
          <Image
            src={manualCoverUrl}
            alt={title ? `Cover of ${title}` : 'Book cover'}
            width={48}
            height={72}
            className="h-[72px] w-[48px] rounded border object-cover"
            unoptimized
          />
        </Link>
        {normalizedIsbn ? <a href={abebooksSearchUrl(normalizedIsbn)} target="_blank" rel="noreferrer" className="text-[11px] underline">AbeBooks</a> : null}
      </div>
    )
  }

  if (!normalizedIsbn || failedSource === 'open-library') {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="flex h-[72px] w-[48px] items-center justify-center overflow-hidden rounded border bg-gray-100 text-[10px] text-gray-400">
          No cover
        </div>
        {normalizedIsbn ? (
          <a
            href={abebooksSearchUrl(normalizedIsbn)}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] underline"
            title={title ? `Search ${title} on AbeBooks` : 'Search on AbeBooks'}
          >
            AbeBooks
          </a>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <Link href={`/library/books/${bookId}`} title={title ? `Open ${title} in ArtMuse` : 'Open in ArtMuse'}>
        <Image
          src={openLibraryCoverUrl(normalizedIsbn, 'S')}
          alt={title ? `Cover of ${title}` : 'Book cover'}
          width={48}
          height={72}
          className="h-[72px] w-[48px] rounded border object-cover"
          onError={() => setFailedSource('open-library')}
          unoptimized
        />
      </Link>
      <a
        href={abebooksSearchUrl(normalizedIsbn)}
        target="_blank"
        rel="noreferrer"
        className="text-[11px] underline"
        title={title ? `Search ${title} on AbeBooks` : 'Search on AbeBooks'}
      >
        AbeBooks
      </a>
    </div>
  )
}

function isCountedBookView(view: LibraryView) {
  return view === 'books' || view === 'by-artists' || view === 'by-authors' || view === 'by-publisher' || view === 'by-types' || view === 'by-status'
}

export default function LibraryPage() {
  const searchParams = useSearchParams()
  const [view, setView] = useState<LibraryView>(() => {
    const requestedView = searchParams.get('view')
    const requestedArtistId = searchParams.get('artistId')?.trim() ?? ''
    if (isLibraryView(requestedView)) return requestedView
    if (requestedArtistId) return 'by-artists'
    return 'books'
  })
  const [bookSortKey, setBookSortKey] = useState<BookSortKey>('legacy')
  const [bookSortDirection, setBookSortDirection] = useState<SortDirection>('desc')
  const [artistSortKey, setArtistSortKey] = useState<ArtistSortKey>('name')
  const [artistSortDirection, setArtistSortDirection] = useState<SortDirection>('asc')
  const [authorSortKey, setAuthorSortKey] = useState<AuthorSortKey>('name')
  const [authorSortDirection, setAuthorSortDirection] = useState<SortDirection>('asc')
  const [relatedSortKey, setRelatedSortKey] = useState<RelatedSortKey>('name')
  const [relatedSortDirection, setRelatedSortDirection] = useState<SortDirection>('asc')
  const [query, setQuery] = useState('')
  const [selectedArtistId, setSelectedArtistId] = useState(() => searchParams.get('artistId')?.trim() || 'all')
  const [selectedAuthorId, setSelectedAuthorId] = useState('all')
  const [selectedPublisherId, setSelectedPublisherId] = useState('all')
  const [selectedTypeId, setSelectedTypeId] = useState('all')
  const [selectedStatusId, setSelectedStatusId] = useState('all')
  const [artistLookupQuery, setArtistLookupQuery] = useState('')
  const [authorLookupQuery, setAuthorLookupQuery] = useState('')
  const [publisherLookupQuery, setPublisherLookupQuery] = useState('')
  const [artistFilterOptions, setArtistFilterOptions] = useState<ArtistFilterOption[]>([])
  const [authorFilterOptions, setAuthorFilterOptions] = useState<AuthorFilterOption[]>([])
  const [publisherFilterOptions, setPublisherFilterOptions] = useState<PublisherFilterOption[]>([])
  const [statusFilterOptions, setStatusFilterOptions] = useState<StatusFilterOption[]>([])
  const [byArtistsTypeFilter, setByArtistsTypeFilter] = useState('all')
  const [byArtistsYearFrom, setByArtistsYearFrom] = useState('')
  const [byArtistsYearTo, setByArtistsYearTo] = useState('')
  const [byArtistsAuthorFilter, setByArtistsAuthorFilter] = useState('')
  const [bookTypeFilterOptions, setBookTypeFilterOptions] = useState<TypeFilterOption[]>([])
  const [books, setBooks] = useState<LibraryBook[]>([])
  const [artists, setArtists] = useState<LibraryArtist[]>([])
  const [authors, setAuthors] = useState<LibraryAuthor[]>([])
  const [relatedNames, setRelatedNames] = useState<RelatedName[]>([])
  const [bookTypes, setBookTypes] = useState<BookType[]>([])
  const [statuses, setStatuses] = useState<LibraryStatus[]>([])
  const [unresolvedArtists, setUnresolvedArtists] = useState<UnresolvedArtist[]>([])
  const [unresolvedAuthors, setUnresolvedAuthors] = useState<UnresolvedAuthor[]>([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [loadAllMode, setLoadAllMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const artistLookupCacheRef = useRef<Record<string, ArtistFilterOption[]>>({})
  const floatingActionBarStyle: React.CSSProperties = {
    position: 'fixed',
    top: 68,
    right: 24,
    zIndex: 1100,
    display: 'flex',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'var(--section-page-bg, #f3f5f1)',
    boxShadow: '0 8px 24px rgba(31,56,46,0.16)',
  }
  const authorLookupCacheRef = useRef<Record<string, AuthorFilterOption[]>>({})
  const publisherLookupCacheRef = useRef<Record<string, PublisherFilterOption[]>>({})

  useEffect(() => {
    const controller = new AbortController()
    const delay = query ? 180 : 0
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setLoading(true)
          if (offset === 0 && !loadAllMode && isCountedBookView(view)) {
            setTotalCount(null)
          }
          const params = new URLSearchParams({
            view,
            offset: String(offset),
            q: query,
            limit: String(loadAllMode ? 50000 : PAGE_SIZE),
          })

          if (view === 'books' || view === 'by-artists' || view === 'by-authors') {
            params.set('sortBy', bookSortKey)
            params.set('sortDir', bookSortDirection)
            if (loadAllMode) {
              params.set('all', '1')
            }

            if (view === 'by-artists') {
              if (byArtistsTypeFilter !== 'all') params.set('typeNo', byArtistsTypeFilter)
              if (byArtistsYearFrom.trim()) params.set('yearFrom', byArtistsYearFrom.trim())
              if (byArtistsYearTo.trim()) params.set('yearTo', byArtistsYearTo.trim())
              if (byArtistsAuthorFilter.trim()) params.set('authorQ', byArtistsAuthorFilter.trim())
            }
          } else if (view === 'artists') {
            params.set('sortBy', artistSortKey)
            params.set('sortDir', artistSortDirection)
          } else if (view === 'authors') {
            params.set('sortBy', authorSortKey)
            params.set('sortDir', authorSortDirection)
          } else if (view === 'related-names') {
            params.set('sortBy', relatedSortKey)
            params.set('sortDir', relatedSortDirection)
          }

          if (view === 'by-artists' && selectedArtistId !== 'all') {
            params.set('artistId', selectedArtistId)
          }
          if (view === 'by-authors' && selectedAuthorId !== 'all') {
            params.set('authorId', selectedAuthorId)
          }
          if (view === 'by-publisher' && selectedPublisherId !== 'all') {
            params.set('publisherId', selectedPublisherId)
          }
          if (view === 'by-types' && selectedTypeId !== 'all') {
            params.set('typeId', selectedTypeId)
          }
          if (view === 'by-status' && selectedStatusId !== 'all') {
            params.set('statusId', selectedStatusId)
          }

          const response = await fetch(`/api/library?${params.toString()}`, {
            signal: controller.signal,
          })
          const payload = (await response.json()) as { books?: LibraryBook[]; artists?: LibraryArtist[]; authors?: LibraryAuthor[]; relatedNames?: RelatedName[]; types?: BookType[]; statuses?: LibraryStatus[]; unresolvedArtists?: UnresolvedArtist[]; unresolvedAuthors?: UnresolvedAuthor[]; hasMore?: boolean; totalCount?: number; error?: string }
          if (!controller.signal.aborted) {
            setBooks((current) => offset === 0 ? payload.books ?? [] : [...current, ...(payload.books ?? [])])
            setArtists((current) => offset === 0 ? payload.artists ?? [] : [...current, ...(payload.artists ?? [])])
            setAuthors((current) => offset === 0 ? payload.authors ?? [] : [...current, ...(payload.authors ?? [])])
            setRelatedNames((current) => offset === 0 ? payload.relatedNames ?? [] : [...current, ...(payload.relatedNames ?? [])])
            setUnresolvedArtists((current) => offset === 0 ? payload.unresolvedArtists ?? [] : [...current, ...(payload.unresolvedArtists ?? [])])
            setUnresolvedAuthors((current) => offset === 0 ? payload.unresolvedAuthors ?? [] : [...current, ...(payload.unresolvedAuthors ?? [])])
            setBookTypes(payload.types ?? [])
            setStatuses(payload.statuses ?? [])
            setHasMore(payload.hasMore ?? false)
            setTotalCount((current) => typeof payload.totalCount === 'number' ? payload.totalCount : current)
            setError(response.ok ? '' : payload.error ?? 'Impossible de charger la bibliothèque.')
          }
        } catch (loadError) {
          if (controller.signal.aborted) return
          if (loadError instanceof DOMException && loadError.name === 'AbortError') return
          setError(loadError instanceof Error ? loadError.message : 'Erreur de chargement.')
        } finally {
          if (!controller.signal.aborted) {
            setLoading(false)
          }
        }
      })()
    }, delay)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [
    query,
    view,
    offset,
    selectedArtistId,
    selectedAuthorId,
    selectedPublisherId,
    selectedTypeId,
    selectedStatusId,
    loadAllMode,
    bookSortKey,
    bookSortDirection,
    artistSortKey,
    artistSortDirection,
    authorSortKey,
    authorSortDirection,
    relatedSortKey,
    relatedSortDirection,
    byArtistsTypeFilter,
    byArtistsYearFrom,
    byArtistsYearTo,
    byArtistsAuthorFilter,
  ])

  useEffect(() => {
    let cancelled = false
    const loadReferenceOptions = async () => {
      const [typesResponse, statusesResponse] = await Promise.all([
        fetch('/api/library?view=types'),
        fetch('/api/library?view=status'),
      ])
      const [typesPayload, statusesPayload] = await Promise.all([
        typesResponse.json() as Promise<{ types?: BookType[]; error?: string }>,
        statusesResponse.json() as Promise<{ statuses?: LibraryStatus[]; error?: string }>,
      ])

      if (cancelled) return

      if (typesResponse.ok) {
        const sortedTypes = (typesPayload.types ?? [])
          .map((item) => ({
            legacy_no: item.legacy_no,
            description: item.description,
            type_number: item.type_number,
          }))
          .sort((left, right) => {
            const byTypeNumber = compareTypeNumbers(
              typeSortValue(left.type_number, left.description),
              typeSortValue(right.type_number, right.description)
            )
            if (byTypeNumber !== 0) return byTypeNumber
            return left.legacy_no - right.legacy_no
          })
        setBookTypeFilterOptions(sortedTypes)
      }

      if (statusesResponse.ok) {
        const sortedStatuses = (statusesPayload.statuses ?? [])
          .slice()
          .sort((left, right) => left.legacy_no - right.legacy_no)
          .map((item) => ({
            id: String(item.legacy_no),
            label: item.label,
          }))
        setStatusFilterOptions(sortedStatuses)
      }
    }

    void loadReferenceOptions()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!isCountedBookView(view) || loadAllMode) return

    const controller = new AbortController()

    void (async () => {
      try {
        const params = new URLSearchParams({
          view,
          q: query,
          countOnly: '1',
        })

        if (view === 'by-artists') {
          if (selectedArtistId !== 'all') params.set('artistId', selectedArtistId)
          if (byArtistsTypeFilter !== 'all') params.set('typeNo', byArtistsTypeFilter)
          if (byArtistsYearFrom.trim()) params.set('yearFrom', byArtistsYearFrom.trim())
          if (byArtistsYearTo.trim()) params.set('yearTo', byArtistsYearTo.trim())
          if (byArtistsAuthorFilter.trim()) params.set('authorQ', byArtistsAuthorFilter.trim())
        }
        if (view === 'by-authors' && selectedAuthorId !== 'all') {
          params.set('authorId', selectedAuthorId)
        }
        if (view === 'by-publisher' && selectedPublisherId !== 'all') {
          params.set('publisherId', selectedPublisherId)
        }
        if (view === 'by-types' && selectedTypeId !== 'all') {
          params.set('typeId', selectedTypeId)
        }
        if (view === 'by-status' && selectedStatusId !== 'all') {
          params.set('statusId', selectedStatusId)
        }

        const response = await fetch(`/api/library?${params.toString()}`, { signal: controller.signal })
        const payload = (await response.json()) as { totalCount?: number; error?: string }

        if (!controller.signal.aborted && response.ok) {
          setTotalCount(typeof payload.totalCount === 'number' ? payload.totalCount : null)
        }
      } catch (countError) {
        if (controller.signal.aborted) return
        if (countError instanceof DOMException && countError.name === 'AbortError') return
      }
    })()

    return () => {
      controller.abort()
    }
  }, [
    view,
    query,
    loadAllMode,
    selectedArtistId,
    selectedAuthorId,
    selectedPublisherId,
    selectedTypeId,
    selectedStatusId,
    byArtistsTypeFilter,
    byArtistsYearFrom,
    byArtistsYearTo,
    byArtistsAuthorFilter,
  ])

  useEffect(() => {
    if (view !== 'by-artists') return

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void (async () => {
        const lookupQuery = artistLookupQuery.trim()
        const cacheKey = lookupQuery.length < 2 ? '__default__' : lookupQuery.toLocaleLowerCase()
        const cached = artistLookupCacheRef.current[cacheKey]
        if (cached) {
          setArtistFilterOptions(cached)
          return
        }

        try {
          const params = new URLSearchParams({
            view: 'artists',
            offset: '0',
            limit: '25',
            sortBy: 'name',
            sortDir: 'asc',
            compact: '1',
          })
          if (lookupQuery.length >= 2) {
            params.set('q', lookupQuery)
          }
          const response = await fetch(`/api/library?${params.toString()}`, {
            signal: controller.signal,
          })
          const payload = (await response.json()) as { artists?: LibraryArtist[]; error?: string }
          if (!response.ok || controller.signal.aborted) {
            if (!controller.signal.aborted) setArtistFilterOptions([])
            return
          }

          const options = (payload.artists ?? []).map((artist) => ({
            id: artist.id,
            label: personName(artist) || `Artist ${artist.id}`,
          }))
          artistLookupCacheRef.current[cacheKey] = options
          setArtistFilterOptions(options)
        } catch {
          if (!controller.signal.aborted) {
            setArtistFilterOptions([])
          }
        }
      })()
    }, 60)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [view, artistLookupQuery])

  useEffect(() => {
    if (view !== 'by-authors') return

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void (async () => {
        const lookupQuery = authorLookupQuery.trim()
        const cacheKey = lookupQuery.length < 2 ? '__default__' : lookupQuery.toLocaleLowerCase()
        const cached = authorLookupCacheRef.current[cacheKey]
        if (cached) {
          setAuthorFilterOptions(cached)
          return
        }

        try {
          const params = new URLSearchParams({
            view: 'authors',
            offset: '0',
            limit: '25',
            sortBy: 'name',
            sortDir: 'asc',
            compact: '1',
          })
          if (lookupQuery.length >= 2) {
            params.set('q', lookupQuery)
          }
          const response = await fetch(`/api/library?${params.toString()}`, {
            signal: controller.signal,
          })
          const payload = (await response.json()) as { authors?: LibraryAuthor[]; error?: string }
          if (!response.ok || controller.signal.aborted) {
            if (!controller.signal.aborted) setAuthorFilterOptions([])
            return
          }

          const options = (payload.authors ?? []).map((author) => ({
            id: author.id,
            label: personName(author) || `Author ${author.id}`,
          }))
          authorLookupCacheRef.current[cacheKey] = options
          setAuthorFilterOptions(options)
        } catch {
          if (!controller.signal.aborted) {
            setAuthorFilterOptions([])
          }
        }
      })()
    }, 60)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [view, authorLookupQuery])

  useEffect(() => {
    if (view !== 'by-publisher') return

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void (async () => {
        const lookupQuery = publisherLookupQuery.trim()
        const cacheKey = lookupQuery.length < 2 ? '__default__' : lookupQuery.toLocaleLowerCase()
        const cached = publisherLookupCacheRef.current[cacheKey]
        if (cached) {
          setPublisherFilterOptions(cached)
          return
        }

        try {
          const params = new URLSearchParams({
            view: 'related-names',
            offset: '0',
            limit: '50',
            sortBy: 'name',
            sortDir: 'asc',
          })
          if (lookupQuery.length >= 2) {
            params.set('q', lookupQuery)
          }
          const response = await fetch(`/api/library?${params.toString()}`, {
            signal: controller.signal,
          })
          const payload = (await response.json()) as { relatedNames?: RelatedName[]; error?: string }
          if (!response.ok || controller.signal.aborted) {
            if (!controller.signal.aborted) setPublisherFilterOptions([])
            return
          }

          const options = (payload.relatedNames ?? []).map((publisher) => ({
            id: String(publisher.legacy_no),
            label: [publisher.name, publisher.location].filter(Boolean).join(' - ') || String(publisher.legacy_no),
          }))
          publisherLookupCacheRef.current[cacheKey] = options
          setPublisherFilterOptions(options)
        } catch {
          if (!controller.signal.aborted) {
            setPublisherFilterOptions([])
          }
        }
      })()
    }, 60)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [view, publisherLookupQuery])

  const menu = [
    ['books', 'Books'],
    ['by-artists', 'Search by artists'],
    ['by-authors', 'Search by authors'],
    ['by-publisher', 'Search by publisher'],
    ['by-types', 'Search by type of books'],
    ['by-status', 'Search by status'],
  ] as const

  const currentResultsCount = view === 'artists'
    ? artists.length
    : view === 'authors'
      ? authors.length
      : view === 'related-names'
        ? relatedNames.length
        : view === 'types'
          ? bookTypes.length
          : view === 'status'
            ? statuses.length
            : view === 'unresolved-artists'
              ? unresolvedArtists.length
              : view === 'unresolved-authors'
                ? unresolvedAuthors.length
                : books.length

  const nextLoadCount = totalCount === null
    ? PAGE_SIZE
    : Math.max(0, Math.min(PAGE_SIZE, totalCount - currentResultsCount))

  const sortedTypeFilterOptions = [...bookTypeFilterOptions].sort((left, right) => {
    const byTypeNumber = compareTypeNumbers(
      typeSortValue(left.type_number, left.description),
      typeSortValue(right.type_number, right.description)
    )
    if (byTypeNumber !== 0) return byTypeNumber
    return left.legacy_no - right.legacy_no
  })
  const typeSearchOptions = sortedTypeFilterOptions.map((item) => ({
    id: String(item.legacy_no),
    label: [item.type_number, item.description].filter(Boolean).join(' - ') || String(item.legacy_no),
  }))
  const typeFilterSearchOptions = [{ id: 'none', label: 'None' }, ...typeSearchOptions]
  const statusFilterSearchOptions = [{ id: 'none', label: 'None' }, ...statusFilterOptions]

  const bookAuthorLabel = (book: LibraryBook) =>
    book.library_book_authors?.map((item) => personName(item.author)).filter(Boolean).join(', ') || ''

  const bookArtistLabel = (book: LibraryBook) =>
    book.library_book_artists?.map((item) => personName(item.artist)).filter(Boolean).join(', ') || book.search_artist || ''

  function toggleBookSort(key: BookSortKey) {
    if (bookSortKey === key) {
      setBookSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      setOffset(0)
      setLoadAllMode(false)
      return
    }
    setBookSortKey(key)
    setBookSortDirection('asc')
    setOffset(0)
    setLoadAllMode(false)
  }

  function headerLabel(label: string, key: BookSortKey) {
    if (bookSortKey !== key) return label
    return `${label} ${bookSortDirection === 'asc' ? '↑' : '↓'}`
  }

  function toggleArtistSort(key: ArtistSortKey) {
    if (artistSortKey === key) {
      setArtistSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      setOffset(0)
      setLoadAllMode(false)
      return
    }
    setArtistSortKey(key)
    setArtistSortDirection('asc')
    setOffset(0)
    setLoadAllMode(false)
  }

  function toggleAuthorSort(key: AuthorSortKey) {
    if (authorSortKey === key) {
      setAuthorSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      setOffset(0)
      setLoadAllMode(false)
      return
    }
    setAuthorSortKey(key)
    setAuthorSortDirection('asc')
    setOffset(0)
    setLoadAllMode(false)
  }

  function toggleRelatedSort(key: RelatedSortKey) {
    if (relatedSortKey === key) {
      setRelatedSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      setOffset(0)
      setLoadAllMode(false)
      return
    }
    setRelatedSortKey(key)
    setRelatedSortDirection('asc')
    setOffset(0)
    setLoadAllMode(false)
  }

  function headerLabelGeneric(label: string, isActive: boolean, direction: SortDirection) {
    if (!isActive) return label
    return `${label} ${direction === 'asc' ? '↑' : '↓'}`
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 pt-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Blondeau & Cie</p>
          <h1 className="text-2xl font-semibold">Library</h1>
          <p className="text-sm text-gray-600">Bibliothèque séparée, avec les artistes partagés avec ArtMuse.</p>
        </div>
      </div>

      <div className="no-print" style={floatingActionBarStyle}>
        <Link className="edit-button" href="/library/books/new">Add book</Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="rounded border bg-gray-50 p-3">
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Interrogation</p>
          <div className="grid gap-1">
            {menu.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`rounded px-3 py-2 text-left text-sm ${view === key ? 'bg-gray-800 font-semibold text-white' : 'hover:bg-gray-200'}`}
                onClick={() => {
                  setView(key)
                  setQuery('')
                  setOffset(0)
                  setLoadAllMode(false)
                  setSelectedArtistId('all')
                  setSelectedAuthorId('all')
                  setSelectedPublisherId('all')
                  setSelectedTypeId('all')
                  setSelectedStatusId('all')

                  if (key === 'books') {
                    setBookSortKey('legacy')
                    setBookSortDirection('desc')
                  }
                  if (key === 'by-authors') {
                    setBookSortKey('author')
                    setBookSortDirection('asc')
                  }
                  if (key === 'by-artists') {
                    setBookSortKey('type')
                    setBookSortDirection('asc')
                  }
                  if (key === 'by-publisher') {
                    setBookSortKey('publisher')
                    setBookSortDirection('asc')
                  }
                  if (key === 'by-types') {
                    setBookSortKey('type')
                    setBookSortDirection('asc')
                  }
                  if (key === 'by-status') {
                    setBookSortKey('legacy')
                    setBookSortDirection('desc')
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {view === 'by-authors' ? (
              <SearchSelect
                label="Author"
                placeholder="Type an author name..."
                valueId={selectedAuthorId}
                onQueryChange={setAuthorLookupQuery}
                onChangeId={(id) => {
                  setSelectedAuthorId(id)
                  setOffset(0)
                  setLoadAllMode(false)
                }}
                options={authorFilterOptions}
                allLabel="All"
                className="min-w-[280px] flex-1"
                inputClassName="rounded border bg-white px-3 py-2"
                menuClassName="max-h-[280px]"
              />
            ) : view === 'by-artists' ? (
              <SearchSelect
                label="Artist"
                placeholder="Type an artist name..."
                valueId={selectedArtistId}
                onQueryChange={setArtistLookupQuery}
                onChangeId={(id) => {
                  setSelectedArtistId(id)
                  setOffset(0)
                  setLoadAllMode(false)
                }}
                options={artistFilterOptions}
                allLabel="All"
                className="min-w-[280px] flex-1"
                inputClassName="rounded border bg-white px-3 py-2"
                menuClassName="max-h-[280px]"
              />
            ) : view === 'by-publisher' ? (
              <SearchSelect
                label="Publisher"
                placeholder="Type a publisher name..."
                valueId={selectedPublisherId}
                onQueryChange={setPublisherLookupQuery}
                onChangeId={(id) => {
                  setSelectedPublisherId(id)
                  setOffset(0)
                  setLoadAllMode(false)
                }}
                options={publisherFilterOptions}
                allLabel="All"
                maxSuggestions={50}
                className="min-w-[280px] flex-1"
                inputClassName="rounded border bg-white px-3 py-2"
                menuClassName="max-h-[280px]"
              />
            ) : view === 'by-types' ? (
              <SearchSelect
                label="Type"
                placeholder="Type a type number or label..."
                valueId={selectedTypeId}
                onChangeId={(id) => {
                  setSelectedTypeId(id)
                  setOffset(0)
                  setLoadAllMode(false)
                }}
                options={typeFilterSearchOptions}
                allLabel="All"
                maxSuggestions={50}
                className="min-w-[280px] flex-1"
                inputClassName="rounded border bg-white px-3 py-2"
                menuClassName="max-h-[280px]"
              />
            ) : view === 'by-status' ? (
              <SearchSelect
                label="Status"
                placeholder="Type a status..."
                valueId={selectedStatusId}
                onChangeId={(id) => {
                  setSelectedStatusId(id)
                  setOffset(0)
                  setLoadAllMode(false)
                }}
                options={statusFilterSearchOptions}
                allLabel="All"
                maxSuggestions={50}
                className="min-w-[280px] flex-1"
                inputClassName="rounded border bg-white px-3 py-2"
                menuClassName="max-h-[280px]"
              />
            ) : (
              <input
                className="min-w-[240px] flex-1 rounded border bg-white px-3 py-2"
                placeholder={view === 'books' ? 'Search all book fields (title, author, artist, publisher, ISBN...)' : view === 'unresolved-artists' ? 'Book title or unresolved artist name' : view === 'unresolved-authors' ? 'Book title or unresolved author name' : 'Search'}
                value={query}
                onChange={(event) => { setQuery(event.target.value); setOffset(0); setLoadAllMode(false) }}
              />
            )}
          </div>

          {view === 'by-artists' && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <select
                className="rounded border bg-white px-3 py-2"
                value={byArtistsTypeFilter}
                onChange={(event) => {
                  setByArtistsTypeFilter(event.target.value)
                  setOffset(0)
                  setLoadAllMode(false)
                }}
              >
                <option value="all">All types</option>
                {sortedTypeFilterOptions.map((typeOption) => (
                  <option key={typeOption.legacy_no} value={String(typeOption.legacy_no)}>
                    {[typeOption.type_number, typeOption.description].filter(Boolean).join(' - ') || String(typeOption.legacy_no)}
                  </option>
                ))}
              </select>
              <input
                className="rounded border bg-white px-3 py-2"
                placeholder="Year from"
                value={byArtistsYearFrom}
                onChange={(event) => {
                  setByArtistsYearFrom(event.target.value)
                  setOffset(0)
                  setLoadAllMode(false)
                }}
              />
              <input
                className="rounded border bg-white px-3 py-2"
                placeholder="Year to"
                value={byArtistsYearTo}
                onChange={(event) => {
                  setByArtistsYearTo(event.target.value)
                  setOffset(0)
                  setLoadAllMode(false)
                }}
              />
              <input
                className="rounded border bg-white px-3 py-2"
                placeholder="Filter by author"
                value={byArtistsAuthorFilter}
                onChange={(event) => {
                  setByArtistsAuthorFilter(event.target.value)
                  setOffset(0)
                  setLoadAllMode(false)
                }}
              />
            </div>
          )}

      {error && <p className="rounded border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>}
          {loading ? <p>Chargement...</p> : <p className="text-sm text-gray-600">{view === 'artists' ? artists.length : view === 'authors' ? authors.length : view === 'related-names' ? relatedNames.length : view === 'types' ? bookTypes.length : view === 'status' ? statuses.length : view === 'unresolved-artists' ? unresolvedArtists.length : view === 'unresolved-authors' ? unresolvedAuthors.length : books.length} résultat(s)</p>}

      {view === 'artists' ? (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="p-3">
                  <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold hover:underline" onClick={() => toggleArtistSort('name')}>
                    {headerLabelGeneric('Artist', artistSortKey === 'name', artistSortDirection)}
                  </button>
                </th>
                <th className="p-3">
                  <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold hover:underline" onClick={() => toggleArtistSort('birth')}>
                    {headerLabelGeneric('Birth year', artistSortKey === 'birth', artistSortDirection)}
                  </button>
                </th>
                <th className="p-3">
                  <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold hover:underline" onClick={() => toggleArtistSort('death')}>
                    {headerLabelGeneric('Death year', artistSortKey === 'death', artistSortDirection)}
                  </button>
                </th>
                <th className="p-3">
                  <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold hover:underline" onClick={() => toggleArtistSort('legacy')}>
                    {headerLabelGeneric('Legacy no.', artistSortKey === 'legacy', artistSortDirection)}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>{artists.map((artist) => <tr key={artist.id} className="border-b"><td className="p-3 font-medium"><Link className="underline" href={`/artists/${artist.id}`}>{personName(artist) || '—'}</Link></td><td className="p-3">{artist.year_of_birth ?? '—'}</td><td className="p-3">{artist.year_of_death ?? '—'}</td><td className="p-3">{artist.legacy_no ?? '—'}</td></tr>)}</tbody>
          </table>
        </div>
      ) : view === 'authors' ? (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50"><tr><th className="p-3"><button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold hover:underline" onClick={() => toggleAuthorSort('name')}>{headerLabelGeneric('Author', authorSortKey === 'name', authorSortDirection)}</button></th><th className="p-3"><button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold hover:underline" onClick={() => toggleAuthorSort('legacy')}>{headerLabelGeneric('Legacy no.', authorSortKey === 'legacy', authorSortDirection)}</button></th></tr></thead>
            <tbody>{authors.map((author) => <tr key={author.id} className="border-b"><td className="p-3 font-medium"><Link className="underline" href={`/authors/${author.id}/edit`}>{personName(author) || '—'}</Link></td><td className="p-3">{author.legacy_no}</td></tr>)}</tbody>
          </table>
        </div>
      ) : view === 'related-names' ? (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50"><tr><th className="p-3"><button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold hover:underline" onClick={() => toggleRelatedSort('name')}>{headerLabelGeneric('Name', relatedSortKey === 'name', relatedSortDirection)}</button></th><th className="p-3"><button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold hover:underline" onClick={() => toggleRelatedSort('location')}>{headerLabelGeneric('Location', relatedSortKey === 'location', relatedSortDirection)}</button></th><th className="p-3"><button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold hover:underline" onClick={() => toggleRelatedSort('legacy')}>{headerLabelGeneric('Legacy', relatedSortKey === 'legacy', relatedSortDirection)}</button></th></tr></thead>
            <tbody>{relatedNames.map((relatedName) => <tr key={relatedName.legacy_no} className="border-b"><td className="p-3 font-medium"><Link className="underline" href={`/related-names/${relatedName.legacy_no}/edit`}>{relatedName.name || '—'}</Link></td><td className="p-3">{relatedName.location || '—'}</td><td className="p-3">{relatedName.legacy_no}</td></tr>)}</tbody>
          </table>
        </div>
      ) : view === 'types' || view === 'status' ? (
        <div className="rounded border bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold">{view === 'types' ? 'Type of books' : 'Status'}</h2>
          <div className="grid gap-2">{(view === 'types' ? bookTypes : statuses).map((value) => <span key={value.legacy_no} className="rounded bg-gray-100 px-3 py-2 text-sm">{'full_name' in value ? value.full_name || value.description || value.legacy_no : value.label}</span>)}</div>
        </div>
      ) : view === 'unresolved-artists' ? (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="p-3">Book</th>
                <th className="p-3">Title</th>
                <th className="p-3">Unresolved artist</th>
                <th className="p-3">Legacy artist no.</th>
                <th className="p-3">Default</th>
              </tr>
            </thead>
            <tbody>
              {unresolvedArtists.map((item) => (
                <tr key={`${item.book_id}-${item.legacy_artist_no}`} className="border-b align-top">
                  <td className="p-3 font-medium"><Link className="underline" href={`/library/books/${item.book_id}`}>{item.book_legacy_no}</Link></td>
                  <td className="p-3">{item.book_title ? <Link className="underline" href={`/library/books/${item.book_id}`}>{item.book_title}</Link> : '—'}</td>
                  <td className="p-3">{item.search_artist || '—'}</td>
                  <td className="p-3">{item.legacy_artist_no}</td>
                  <td className="p-3">{item.is_default ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : view === 'unresolved-authors' ? (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="p-3">Book</th>
                <th className="p-3">Title</th>
                <th className="p-3">Unresolved author</th>
                <th className="p-3">Candidates</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {unresolvedAuthors.map((item) => (
                <tr key={`${item.book_id}-${item.token_pos}-${item.legacy_author_name}`} className="border-b align-top">
                  <td className="p-3 font-medium"><Link className="underline" href={`/library/books/${item.book_id}`}>{item.book_legacy_no}</Link></td>
                  <td className="p-3">{item.book_title ? <Link className="underline" href={`/library/books/${item.book_id}`}>{item.book_title}</Link> : '—'}</td>
                  <td className="p-3">{item.legacy_author_name}</td>
                  <td className="p-3">
                    {item.candidate_count > 0
                      ? `${item.candidate_count}${item.candidate_names ? ` (${item.candidate_names})` : ''}`
                      : '0'}
                  </td>
                  <td className="p-3">{item.resolution_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="w-[72px] p-3">Cover</th>
              <th className="p-3">
                <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold hover:underline" onClick={() => toggleBookSort('title')}>
                  {headerLabel('Titre', 'title')}
                </button>
              </th>
              <th className="p-3">
                <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold hover:underline" onClick={() => toggleBookSort('artist')}>
                  {headerLabel('Artiste(s)', 'artist')}
                </button>
              </th>
              <th className="p-3">
                <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold hover:underline" onClick={() => toggleBookSort('author')}>
                  {headerLabel('Auteur(s)', 'author')}
                </button>
              </th>
              <th className="p-3">
                <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold hover:underline" onClick={() => toggleBookSort('year')}>
                  {headerLabel('Année', 'year')}
                </button>
              </th>
              <th className="p-3">
                <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold hover:underline" onClick={() => toggleBookSort('type')}>
                  {headerLabel('Type', 'type')}
                </button>
              </th>
              <th className="p-3">
                <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold hover:underline" onClick={() => toggleBookSort('publisher')}>
                  {headerLabel('Publisher', 'publisher')}
                </button>
              </th>
              <th className="p-3">
                <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold hover:underline" onClick={() => toggleBookSort('isbn')}>
                  {headerLabel('ISBN', 'isbn')}
                </button>
              </th>
              <th className="p-3">
                <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold hover:underline" onClick={() => toggleBookSort('legacy')}>
                  {headerLabel('Legacy', 'legacy')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {books.map((book) => (
              <tr key={book.id} className="border-b align-top">
                  <td className="p-3"><BookCoverThumb bookId={book.id} coverImageUrl={book.cover_image_url} isbn={book.isbn} title={book.title} /></td>
                <td className="p-3 font-medium"><Link className="underline" href={`/library/books/${book.id}`}>{book.title || '—'}</Link></td>
                <td className="p-3">{bookArtistLabel(book) || '—'}</td>
                <td className="p-3">{bookAuthorLabel(book) || '—'}</td>
                <td className="p-3">{book.publication_year ?? '—'}</td>
                <td className="p-3">{book.type_no ? <Link className="underline" href={`/types/${book.type_no}/edit`}>{book.type_description || book.type_abbrev || String(book.type_no)}</Link> : '—'}</td>
                <td className="p-3">{book.publisher_no ? <Link className="underline" href={`/related-names/${book.publisher_no}/edit`}>{book.publisher_label || String(book.publisher_no)}</Link> : (book.publisher_label || '—')}</td>
                <td className="p-3">{book.isbn || '—'}</td>
                <td className="p-3">{book.legacy_no}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {hasMore && (view === 'books' || view === 'by-artists' || view === 'by-authors' || view === 'by-publisher' || view === 'by-types' || view === 'by-status' || view === 'artists' || view === 'authors' || view === 'related-names' || view === 'unresolved-artists' || view === 'unresolved-authors') && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="edit-button" onClick={() => { setLoadAllMode(false); setOffset((current) => current + PAGE_SIZE) }}>
            {`Load more results (+${nextLoadCount})`}
          </button>
          {isCountedBookView(view) && (
            <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => { setOffset(0); setLoadAllMode(true) }}>
              {typeof totalCount === 'number' ? `Load all (${totalCount})` : 'Load all'}
            </button>
          )}
        </div>
      )}
        </section>
      </div>
    </div>
  )
}