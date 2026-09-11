'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { privateImageUrl } from '@/lib/privateImageUrl'
import { LinkedText } from '@/components/ui/LinkedText'

type Book = {
  legacy_no: number
  title: string | null
  entered_at: string | null
  created_by: string | null
  type_no: number | null
  status_no: number | null
  publisher_no: number | null
  publication_year: number | null
  volume: string | null
  series: string | null
  remarks: string | null
  isbn: string | null
  copy: string | null
  search_artist: string | null
  search_publisher: string | null
  cover_image_url: string | null
}
type Person = { first_name: string | null; last_name: string | null }
type AuthorLink = { is_default: boolean; author: (Person & { legacy_no: number }) | null }
type ArtistLink = { is_default: boolean; legacy_artist_no: number; artist: (Person & { id: string; year_of_birth: number | null; year_of_death: number | null }) | null }
type Exhibition = { legacy_no: number; starts_on: string | null; ends_on: string | null; related_name: { name: string | null; location: string | null } | null }
type BookType = { legacy_no: number; type_number: string | null; description: string | null; full_name: string | null }
type LibraryStatus = { legacy_no: number; label: string }
type BookCreator = { id: string; email: string | null }
type OpenLibraryMetadata = {
  subtitle: string | null
  number_of_pages: number | null
  publish_date: string | null
  publishers: string[]
  languages: string[]
  authors: string[]
}

const NEW_BOOK_LEGACY_START = 1000000

function nameOf(person: Person | null) {
  return person ? [person.first_name, person.last_name].filter(Boolean).join(' ') : '—'
}

function normalizeIsbn(value: string | null) {
  if (!value) return ''
  return value.replace(/[^0-9Xx]/g, '').toUpperCase()
}

function openLibraryCoverUrl(isbn: string) {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`
}

function openLibraryBookUrl(isbn: string) {
  return `https://openlibrary.org/isbn/${isbn}`
}

function abebooksSearchUrl(isbn: string) {
  return `https://www.abebooks.com/servlet/SearchResults?isbn=${isbn}`
}

function normalizeOpenLibraryMetadata(payload: unknown): OpenLibraryMetadata {
  if (!payload || typeof payload !== 'object') {
    return { subtitle: null, number_of_pages: null, publish_date: null, publishers: [], languages: [], authors: [] }
  }

  const source = payload as {
    subtitle?: unknown
    number_of_pages?: unknown
    publish_date?: unknown
    publishers?: unknown
    languages?: unknown
  }

  const publishers = Array.isArray(source.publishers)
    ? source.publishers.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean)
    : []

  const languages = Array.isArray(source.languages)
    ? source.languages
      .map((value) => {
        if (!value || typeof value !== 'object') return ''
        const keyValue = (value as { key?: unknown }).key
        if (typeof keyValue !== 'string') return ''
        return keyValue.split('/').pop()?.trim() ?? ''
      })
      .filter(Boolean)
    : []

  return {
    subtitle: typeof source.subtitle === 'string' ? source.subtitle.trim() || null : null,
    number_of_pages: typeof source.number_of_pages === 'number' && Number.isFinite(source.number_of_pages)
      ? source.number_of_pages
      : null,
    publish_date: typeof source.publish_date === 'string' ? source.publish_date.trim() || null : null,
    publishers,
    languages,
    authors: [],
  }
}

async function fetchOpenLibraryAuthorNames(authorKeys: string[]) {
  const names = await Promise.all(authorKeys.map(async (key) => {
    try {
      const response = await fetch(`https://openlibrary.org${key}.json`)
      if (!response.ok) return key.split('/').pop() ?? ''
      const payload = await response.json() as { name?: unknown }
      return typeof payload.name === 'string' ? payload.name.trim() : (key.split('/').pop() ?? '')
    } catch {
      return key.split('/').pop() ?? ''
    }
  }))

  return names.map((value) => value.trim()).filter(Boolean)
}

function normalizeOpenLibraryContributorNames(contributors: unknown) {
  if (!Array.isArray(contributors)) return []

  return contributors
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return ''
      const name = (entry as { name?: unknown }).name
      return typeof name === 'string' ? name.trim() : ''
    })
    .filter(Boolean)
}

function uniqueNonEmpty(values: string[]) {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const value of values) {
    const key = value.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    unique.push(value.trim())
  }
  return unique
}

function Field({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  return <div className="grid gap-1 border-b py-3 sm:grid-cols-[180px_1fr]"><dt className="text-sm text-gray-500">{label}</dt><dd className="text-sm">{value || '—'}</dd></div>
}

function FeaturedField({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  return <div className="grid gap-1 border-b py-3 sm:grid-cols-[180px_1fr]"><dt className="text-sm text-gray-500">{label}</dt><dd className="text-lg font-semibold">{value || '—'}</dd></div>
}

export default function LibraryBookPage() {
  const { id } = useParams<{ id: string }>()
  const [book, setBook] = useState<Book | null>(null)
  const [authors, setAuthors] = useState<AuthorLink[]>([])
  const [artists, setArtists] = useState<ArtistLink[]>([])
  const [exhibitions, setExhibitions] = useState<Exhibition[]>([])
  const [bookTypes, setBookTypes] = useState<BookType[]>([])
  const [statuses, setStatuses] = useState<LibraryStatus[]>([])
  const [creator, setCreator] = useState<BookCreator | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [failedCoverIsbn, setFailedCoverIsbn] = useState<string | null>(null)
  const [openLibraryMetadata, setOpenLibraryMetadata] = useState<OpenLibraryMetadata | null>(null)
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

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/library/books/${id}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { book?: Book; creator?: BookCreator | null; authors?: AuthorLink[]; artists?: ArtistLink[]; exhibitions?: Exhibition[]; types?: BookType[]; statuses?: LibraryStatus[]; error?: string }
        if (!response.ok) throw new Error(payload.error ?? 'Impossible de charger le livre.')
        setBook(payload.book ?? null)
        setCreator(payload.creator ?? null)
        setAuthors(payload.authors ?? [])
        setArtists(payload.artists ?? [])
        setExhibitions(payload.exhibitions ?? [])
        setBookTypes(payload.types ?? [])
        setStatuses(payload.statuses ?? [])
      })
      .catch((loadError) => { if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'Erreur de chargement.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [id])

  const normalizedIsbn = normalizeIsbn(book?.isbn ?? null)

  useEffect(() => {
    let cancelled = false

    if (!normalizedIsbn) {
      return () => {
        cancelled = true
      }
    }

    void (async () => {
      try {
        const response = await fetch(`https://openlibrary.org/isbn/${normalizedIsbn}.json`)
        if (!response.ok) {
          if (!cancelled) setOpenLibraryMetadata(null)
          return
        }
        const payload = await response.json() as { authors?: unknown; contributors?: unknown }
        const metadata = normalizeOpenLibraryMetadata(payload)
        const authorKeys = Array.isArray(payload.authors)
          ? payload.authors
            .map((entry) => {
              if (!entry || typeof entry !== 'object') return ''
              const key = (entry as { key?: unknown }).key
              return typeof key === 'string' && key.startsWith('/authors/') ? key : ''
            })
            .filter(Boolean)
          : []
        const authorNames = authorKeys.length ? await fetchOpenLibraryAuthorNames(authorKeys) : []
        const contributorNames = normalizeOpenLibraryContributorNames(payload.contributors)
        if (!cancelled) setOpenLibraryMetadata({ ...metadata, authors: uniqueNonEmpty([...authorNames, ...contributorNames]) })
      } catch {
        if (!cancelled) setOpenLibraryMetadata(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [normalizedIsbn])

  if (loading) return <div className="p-6 pt-20">Chargement...</div>
  if (error || !book) return <div className="space-y-4 p-6 pt-20"><p className="text-red-700">{error || 'Livre introuvable.'}</p><Link className="underline" href="/library">Retour à la bibliothèque</Link></div>

  const enteredBy = book.legacy_no >= NEW_BOOK_LEGACY_START ? (creator?.email || 'Utilisateur inconnu') : 'Import'
  const artistsDisplay = artists
    .map((item) => (item.artist ? nameOf(item.artist) : ''))
    .filter(Boolean)
    .join(', ') || book.search_artist || '—'
  const manualCoverUrl = privateImageUrl(book.cover_image_url)
  const coverUrl = manualCoverUrl || (normalizedIsbn ? openLibraryCoverUrl(normalizedIsbn) : '')
  const openLibraryUrl = normalizedIsbn ? openLibraryBookUrl(normalizedIsbn) : ''
  const abebooksUrl = normalizedIsbn ? abebooksSearchUrl(normalizedIsbn) : ''
  const coverAvailable = manualCoverUrl ? true : Boolean(normalizedIsbn) && failedCoverIsbn !== normalizedIsbn
  const displayedOpenLibraryMetadata = normalizedIsbn ? openLibraryMetadata : null

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 pt-20">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Library book {book.legacy_no}</p>
          <h1 className="text-2xl font-semibold">Book details</h1>
          <p className="mt-1 text-sm text-gray-600">{book.legacy_no >= NEW_BOOK_LEGACY_START ? 'Source: new book created in this app' : 'Source: imported from Access'}</p>
        </div>
      </div>

      <div className="no-print" style={floatingActionBarStyle}>
        <Link
          className="edit-button"
          href={`/library/books/${id}/edit`}
          onClick={() => {
            // A fresh "Edit" click always starts from the saved data, not a leftover draft.
            try {
              sessionStorage.removeItem(`artmuse_library_book_edit_draft_${id}`)
            } catch {
              // Ignore storage access errors (e.g. private browsing).
            }
          }}
        >
          Edit
        </Link>
        <Link className="edit-button" href="/library">Back to search</Link>
      </div>

      <section className="rounded border bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Bibliographic information</h2>
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div>
            <div className="overflow-hidden rounded border bg-gray-50">
              {coverUrl && coverAvailable ? (
                <Image
                  src={coverUrl}
                  alt={book.title ? `Cover of ${book.title}` : 'Book cover'}
                  width={360}
                  height={540}
                  className="aspect-[2/3] h-auto w-full object-cover"
                  onError={() => {
                    if (!manualCoverUrl) setFailedCoverIsbn(normalizedIsbn)
                  }}
                  unoptimized
                />
              ) : (
                <div className="flex aspect-[2/3] items-center justify-center p-6 text-center text-sm text-gray-500">
                  {normalizedIsbn ? 'No cover found from ISBN.' : 'No ISBN available for cover lookup.'}
                </div>
              )}
            </div>
            {openLibraryUrl && !manualCoverUrl && (
              <p className="mt-3 text-xs text-gray-500">
                Cover source:{' '}
                <a className="underline" href={openLibraryUrl} target="_blank" rel="noreferrer">
                  Open Library
                </a>
              </p>
            )}
            {manualCoverUrl ? <p className="mt-2 text-xs text-gray-500">Manual cover uploaded in ArtMuse.</p> : null}
            {abebooksUrl && (
              <p className="mt-2 text-xs text-gray-500">
                Search this ISBN on{' '}
                <a className="underline" href={abebooksUrl} target="_blank" rel="noreferrer">
                  AbeBooks
                </a>
              </p>
            )}
            {openLibraryUrl && manualCoverUrl && (
              <p className="mt-2 text-xs text-gray-500">
                Open Library:{' '}
                <a className="underline" href={openLibraryUrl} target="_blank" rel="noreferrer">
                  View book page
                </a>
              </p>
            )}
          </div>
          <dl>
            <FeaturedField label="Titre" value={book.title || 'Untitled book'} />
            <Field label="Authors" value={authors.map((item) => nameOf(item.author)).join(', ')} />
            <Field label="Artists" value={artistsDisplay} />
            <Field label="Publication year" value={book.publication_year} />
            <Field label="Publisher" value={book.search_publisher || book.publisher_no} />
            <Field label="ISBN" value={book.isbn} />
            <Field label="Series" value={book.series} />
            <Field label="Volume" value={book.volume} />
            <Field label="Copy" value={book.copy} />
            <Field label="Type" value={bookTypes.find((item) => item.legacy_no === book.type_no)?.full_name || bookTypes.find((item) => item.legacy_no === book.type_no)?.description || book.type_no} />
            <Field label="Status" value={statuses.find((item) => item.legacy_no === book.status_no)?.label || book.status_no} />
            <Field label="Legacy no." value={book.legacy_no} />
            <Field label="Entered at" value={book.entered_at ? `${book.entered_at} (${enteredBy})` : enteredBy} />
          </dl>
        </div>
      </section>

      {book.remarks && <section className="rounded border bg-white p-5"><h2 className="mb-2 text-lg font-semibold">Remarks</h2><p className="whitespace-pre-wrap text-sm"><LinkedText text={book.remarks} /></p></section>}

      <section className="rounded border bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold">Exhibitions</h2>
        {exhibitions.length === 0 ? <p className="text-sm text-gray-500">No exhibition linked.</p> : <div className="space-y-2">{exhibitions.map((exhibition) => <div key={exhibition.legacy_no} className="border-b pb-2 text-sm"><strong>{exhibition.related_name?.name || 'Exhibition'}</strong>{exhibition.related_name?.location && ` · ${exhibition.related_name.location}`}<div className="text-gray-500">{exhibition.starts_on || '—'}{exhibition.ends_on ? ` – ${exhibition.ends_on}` : ''}</div></div>)}</div>}
      </section>

      {normalizedIsbn && (
        <section className="rounded border border-sky-200 bg-sky-50 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-sky-900">Open Library metadata</h2>
            <span className="rounded-full border border-sky-300 bg-white px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-sky-700">External source</span>
          </div>
          <p className="mb-3 text-xs text-sky-800">These fields are not entered in ArtMuse. They are loaded from Open Library via ISBN.</p>
          <dl>
            <Field label="Open Library authors" value={displayedOpenLibraryMetadata?.authors?.join(', ')} />
            <Field label="Open Library subtitle" value={displayedOpenLibraryMetadata?.subtitle} />
            <Field label="Open Library pages" value={displayedOpenLibraryMetadata?.number_of_pages} />
            <Field label="Open Library publish date" value={displayedOpenLibraryMetadata?.publish_date} />
            <Field label="Open Library publishers" value={displayedOpenLibraryMetadata?.publishers?.join(', ')} />
            <Field label="Open Library languages" value={displayedOpenLibraryMetadata?.languages?.join(', ')} />
          </dl>
          {!displayedOpenLibraryMetadata && <p className="mt-3 text-xs text-sky-800">Open Library metadata is not available for this ISBN.</p>}
        </section>
      )}
    </div>
  )
}