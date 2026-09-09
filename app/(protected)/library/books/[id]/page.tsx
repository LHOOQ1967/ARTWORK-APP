'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type Book = {
  legacy_no: number
  title: string | null
  entered_at: string | null
  type_no: number | null
  status_no: number | null
  publisher_no: number | null
  publication_year: number | null
  volume: string | null
  series: string | null
  remarks: string | null
  isbn: string | null
  copy: string | null
  search_publisher: string | null
}
type Person = { first_name: string | null; last_name: string | null }
type AuthorLink = { is_default: boolean; author: (Person & { legacy_no: number }) | null }
type ArtistLink = { is_default: boolean; legacy_artist_no: number; artist: (Person & { id: string; year_of_birth: number | null; year_of_death: number | null }) | null }
type Exhibition = { legacy_no: number; starts_on: string | null; ends_on: string | null; related_name: { name: string | null; location: string | null } | null }
type BookType = { legacy_no: number; type_number: string | null; description: string | null; full_name: string | null }
type LibraryStatus = { legacy_no: number; label: string }

function nameOf(person: Person | null) {
  return person ? [person.first_name, person.last_name].filter(Boolean).join(' ') : '—'
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="grid gap-1 border-b py-3 sm:grid-cols-[180px_1fr]"><dt className="text-sm text-gray-500">{label}</dt><dd className="text-sm">{value || '—'}</dd></div>
}

export default function LibraryBookPage() {
  const { id } = useParams<{ id: string }>()
  const [book, setBook] = useState<Book | null>(null)
  const [authors, setAuthors] = useState<AuthorLink[]>([])
  const [artists, setArtists] = useState<ArtistLink[]>([])
  const [exhibitions, setExhibitions] = useState<Exhibition[]>([])
  const [bookTypes, setBookTypes] = useState<BookType[]>([])
  const [statuses, setStatuses] = useState<LibraryStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/library/books/${id}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { book?: Book; authors?: AuthorLink[]; artists?: ArtistLink[]; exhibitions?: Exhibition[]; types?: BookType[]; statuses?: LibraryStatus[]; error?: string }
        if (!response.ok) throw new Error(payload.error ?? 'Impossible de charger le livre.')
        setBook(payload.book ?? null)
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

  if (loading) return <div className="p-6 pt-20">Chargement...</div>
  if (error || !book) return <div className="space-y-4 p-6 pt-20"><p className="text-red-700">{error || 'Livre introuvable.'}</p><Link className="underline" href="/library">Retour à la bibliothèque</Link></div>

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 pt-20">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Library book {book.legacy_no}</p><h1 className="text-2xl font-semibold">{book.title || 'Untitled book'}</h1></div>
        <Link className="edit-button" href="/library">Back to search</Link>
      </div>

      <section className="rounded border bg-white p-5">
        <h2 className="mb-2 text-lg font-semibold">Bibliographic information</h2>
        <dl>
          <Field label="Authors" value={authors.map((item) => nameOf(item.author)).join(', ')} />
          <Field label="Artists" value={artists.map((item) => nameOf(item.artist)).join(', ')} />
          <Field label="Publication year" value={book.publication_year} />
          <Field label="Publisher" value={book.search_publisher || book.publisher_no} />
          <Field label="ISBN" value={book.isbn} />
          <Field label="Series" value={book.series} />
          <Field label="Volume" value={book.volume} />
          <Field label="Copy" value={book.copy} />
          <Field label="Entered at" value={book.entered_at} />
          <Field label="Type" value={bookTypes.find((item) => item.legacy_no === book.type_no)?.full_name || bookTypes.find((item) => item.legacy_no === book.type_no)?.description || book.type_no} />
          <Field label="Status" value={statuses.find((item) => item.legacy_no === book.status_no)?.label || book.status_no} />
        </dl>
      </section>

      {book.remarks && <section className="rounded border bg-white p-5"><h2 className="mb-2 text-lg font-semibold">Remarks</h2><p className="whitespace-pre-wrap text-sm">{book.remarks}</p></section>}

      <section className="rounded border bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold">Exhibitions</h2>
        {exhibitions.length === 0 ? <p className="text-sm text-gray-500">No exhibition linked.</p> : <div className="space-y-2">{exhibitions.map((exhibition) => <div key={exhibition.legacy_no} className="border-b pb-2 text-sm"><strong>{exhibition.related_name?.name || 'Exhibition'}</strong>{exhibition.related_name?.location && ` · ${exhibition.related_name.location}`}<div className="text-gray-500">{exhibition.starts_on || '—'}{exhibition.ends_on ? ` – ${exhibition.ends_on}` : ''}</div></div>)}</div>}
      </section>
    </div>
  )
}