'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type LibraryView = 'books' | 'by-artists' | 'by-authors' | 'artists' | 'authors' | 'related-names' | 'types' | 'status'

type LibraryBook = {
  id: string
  legacy_no: number
  title: string | null
  publication_year: number | null
  volume: string | null
  series: string | null
  isbn: string | null
  copy: string | null
  remarks: string | null
  library_book_authors?: Array<{ author: { last_name: string | null; first_name: string | null } | null }>
  library_book_artists?: Array<{ artist: { first_name: string | null; last_name: string | null } | null }>
}

type LibraryArtist = { id: string; first_name: string | null; last_name: string | null; year_of_birth: number | null; year_of_death: number | null }
type LibraryAuthor = { id: string; legacy_no: number; first_name: string | null; last_name: string | null }
type RelatedName = { legacy_no: number; name: string | null; location: string | null }

function personName(person: { first_name: string | null; last_name: string | null } | null) {
  return person ? [person.first_name, person.last_name].filter(Boolean).join(' ') : ''
}

export default function LibraryPage() {
  const [view, setView] = useState<LibraryView>('books')
  const [order, setOrder] = useState<'title' | 'artist'>('title')
  const [query, setQuery] = useState('')
  const [books, setBooks] = useState<LibraryBook[]>([])
  const [artists, setArtists] = useState<LibraryArtist[]>([])
  const [authors, setAuthors] = useState<LibraryAuthor[]>([])
  const [relatedNames, setRelatedNames] = useState<RelatedName[]>([])
  const [referenceValues, setReferenceValues] = useState<number[]>([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      const response = await fetch(`/api/library?view=${view}&order=${order}&offset=${offset}&q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
      const payload = (await response.json()) as { books?: LibraryBook[]; artists?: LibraryArtist[]; authors?: LibraryAuthor[]; relatedNames?: RelatedName[]; values?: number[]; hasMore?: boolean; error?: string }
      if (!controller.signal.aborted) {
        setBooks((current) => offset === 0 ? payload.books ?? [] : [...current, ...(payload.books ?? [])])
        setArtists((current) => offset === 0 ? payload.artists ?? [] : [...current, ...(payload.artists ?? [])])
        setAuthors((current) => offset === 0 ? payload.authors ?? [] : [...current, ...(payload.authors ?? [])])
        setRelatedNames((current) => offset === 0 ? payload.relatedNames ?? [] : [...current, ...(payload.relatedNames ?? [])])
        setReferenceValues(payload.values ?? [])
        setHasMore(payload.hasMore ?? false)
        setError(response.ok ? '' : payload.error ?? 'Impossible de charger la bibliothèque.')
        setLoading(false)
      }
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, view, order, offset])

  const menu = [
    ['books', 'Books'],
    ['artists', 'Artists'],
    ['authors', 'Authors'],
    ['related-names', 'Related names'],
    ['types', 'Type of books'],
    ['status', 'Status'],
    ['by-artists', 'Search by artists'],
    ['by-authors', 'Search by authors'],
  ] as const

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 pt-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Blondeau & Cie</p>
          <h1 className="text-2xl font-semibold">Library</h1>
          <p className="text-sm text-gray-600">Bibliothèque séparée, avec les artistes partagés avec ArtMuse.</p>
        </div>
        <Link className="edit-button no-print" href="/">Back to ArtMuse</Link>
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
                onClick={() => { setView(key); setQuery(''); setOffset(0) }}
              >
                {label}
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="min-w-[240px] flex-1 rounded border bg-white px-3 py-2"
              placeholder={view === 'books' ? 'Title, ISBN, series or remarks' : 'Search'}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setOffset(0) }}
            />
            {(view === 'books' || view === 'by-artists' || view === 'by-authors') && (
              <>
                <button type="button" className={order === 'title' ? 'edit-button' : 'rounded border px-3 py-2 text-sm'} onClick={() => { setOrder('title'); setOffset(0) }}>Order by title</button>
                <button type="button" className={order === 'artist' ? 'edit-button' : 'rounded border px-3 py-2 text-sm'} onClick={() => { setOrder('artist'); setOffset(0) }}>Order by artist</button>
              </>
            )}
          </div>

      {error && <p className="rounded border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>}
          {loading ? <p>Chargement...</p> : <p className="text-sm text-gray-600">{view === 'artists' ? artists.length : view === 'authors' ? authors.length : view === 'related-names' || view === 'types' || view === 'status' ? (view === 'related-names' ? relatedNames.length : referenceValues.length) : books.length} résultat(s)</p>}

      {view === 'artists' ? (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50"><tr><th className="p-3">Artist</th><th className="p-3">Dates</th></tr></thead>
            <tbody>{artists.map((artist) => <tr key={artist.id} className="border-b"><td className="p-3 font-medium">{personName(artist)}</td><td className="p-3">{artist.year_of_birth ?? '—'} – {artist.year_of_death ?? '—'}</td></tr>)}</tbody>
          </table>
        </div>
      ) : view === 'authors' ? (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50"><tr><th className="p-3">Author</th><th className="p-3">Legacy no.</th></tr></thead>
            <tbody>{authors.map((author) => <tr key={author.id} className="border-b"><td className="p-3 font-medium">{personName(author)}</td><td className="p-3">{author.legacy_no}</td></tr>)}</tbody>
          </table>
        </div>
      ) : view === 'related-names' ? (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50"><tr><th className="p-3">Name</th><th className="p-3">Location</th></tr></thead>
            <tbody>{relatedNames.map((relatedName) => <tr key={relatedName.legacy_no} className="border-b"><td className="p-3 font-medium">{relatedName.name || '—'}</td><td className="p-3">{relatedName.location || '—'}</td></tr>)}</tbody>
          </table>
        </div>
      ) : view === 'types' || view === 'status' ? (
        <div className="rounded border bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold">{view === 'types' ? 'Type of books' : 'Status'}</h2>
          <div className="flex flex-wrap gap-2">{referenceValues.map((value) => <span key={value} className="rounded bg-gray-100 px-3 py-2 text-sm">{value}</span>)}</div>
        </div>
      ) : (
      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="p-3">Titre</th>
              <th className="p-3">Auteur(s)</th>
              <th className="p-3">Artiste(s)</th>
              <th className="p-3">Année</th>
              <th className="p-3">ISBN</th>
            </tr>
          </thead>
          <tbody>
            {books.map((book) => (
              <tr key={book.id} className="border-b align-top">
                <td className="p-3 font-medium">{book.title || '—'}</td>
                <td className="p-3">{book.library_book_authors?.map((item) => personName(item.author)).filter(Boolean).join(', ') || '—'}</td>
                <td className="p-3">{book.library_book_artists?.map((item) => personName(item.artist)).filter(Boolean).join(', ') || '—'}</td>
                <td className="p-3">{book.publication_year ?? '—'}</td>
                <td className="p-3">{book.isbn || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {hasMore && (view === 'books' || view === 'by-artists' || view === 'by-authors') && (
        <button type="button" className="edit-button" onClick={() => setOffset((current) => current + 50)}>
          Load more results
        </button>
      )}
        </section>
      </div>
    </div>
  )
}