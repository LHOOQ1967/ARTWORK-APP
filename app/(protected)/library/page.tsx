'use client'

import { useEffect, useState } from 'react'

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

function personName(person: { first_name: string | null; last_name: string | null } | null) {
  return person ? [person.first_name, person.last_name].filter(Boolean).join(' ') : ''
}

export default function LibraryPage() {
  const [query, setQuery] = useState('')
  const [books, setBooks] = useState<LibraryBook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      const response = await fetch(`/api/library?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
      const payload = (await response.json()) as { books?: LibraryBook[]; error?: string }
      if (!controller.signal.aborted) {
        setBooks(payload.books ?? [])
        setError(response.ok ? '' : payload.error ?? 'Impossible de charger la bibliothèque.')
        setLoading(false)
      }
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 pt-20">
      <div>
        <h1 className="text-2xl font-semibold">Library</h1>
        <p className="text-sm text-gray-600">Bibliothèque séparée, avec les artistes partagés avec ArtMuse.</p>
      </div>

      <input
        className="w-full rounded border bg-white px-3 py-2"
        placeholder="Rechercher un titre, ISBN, série ou remarque"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {error && <p className="rounded border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>}
      {loading ? <p>Chargement...</p> : <p className="text-sm text-gray-600">{books.length} résultat(s)</p>}

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
    </div>
  )
}