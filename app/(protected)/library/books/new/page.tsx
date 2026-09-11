'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const LIBRARY_BOOK_NEW_DRAFT_VERSION = 1
const LIBRARY_BOOK_NEW_DRAFT_KEY = 'artmuse_library_book_new_draft'

type BookType = { legacy_no: number; type_number: string | null; description: string | null; full_name: string | null }
type LibraryStatus = { legacy_no: number; label: string }
type LibraryAuthor = { id: string; legacy_no: number; first_name: string | null; last_name: string | null }
type LibraryArtist = { id: string; first_name: string | null; last_name: string | null }
type RelatedName = { legacy_no: number; name: string | null; location: string | null }
type EditableAuthorLink = { author_id: string; label: string; is_default: boolean }
type EditableArtistLink = { artist_id: string; label: string; is_default: boolean }

type BookForm = {
  title: string
  type_no: string
  status_no: string
  publisher_no: string
  publication_year: string
  volume: string
  series: string
  isbn: string
  copy: string
  search_author: string
  search_exhibition: string
  search_publisher: string
  remarks: string
}

type AbeBooksPrefill = {
  source_url: string
  title: string | null
  isbn: string | null
  publication_year: number | null
  search_author: string | null
  search_publisher: string | null
  publisher_search_hint: string | null
  publisher_no: number | null
  author_links: Array<{ author_id: string; label: string; is_default: boolean }>
  artist_links: Array<{ artist_id: string; label: string; is_default: boolean }>
  remarks: string | null
}

const fieldClassName = 'w-full rounded border bg-white px-3 py-2'

function personName(person: { first_name: string | null; last_name: string | null } | null) {
  return person ? [person.first_name, person.last_name].filter(Boolean).join(' ') : ''
}

function relatedNameLabel(value: RelatedName) {
  if (value.name && value.location) return `${value.name} (${value.location})`
  return value.name || value.location || `Publisher #${value.legacy_no}`
}

async function searchOptions<T extends Record<string, unknown>>(view: 'authors' | 'artists', query: string) {
  const response = await fetch(`/api/library?view=${view}&offset=0&limit=100&q=${encodeURIComponent(query)}`)
  const payload = await response.json() as { authors?: T[]; artists?: T[]; error?: string }
  if (!response.ok) throw new Error(payload.error ?? `Impossible de charger ${view}.`)
  return (view === 'authors' ? payload.authors : payload.artists) ?? []
}

async function searchRelatedNames(query: string) {
  const response = await fetch(`/api/library?view=related-names&offset=0&limit=100&q=${encodeURIComponent(query)}`)
  const payload = await response.json() as { relatedNames?: RelatedName[]; error?: string }
  if (!response.ok) throw new Error(payload.error ?? 'Impossible de charger les publishers.')
  return payload.relatedNames ?? []
}

function uniqueById<T extends { id: string }>(rows: T[]) {
  const seen = new Set<string>()
  const uniqueRows: T[] = []
  for (const row of rows) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    uniqueRows.push(row)
  }
  return uniqueRows
}

function uniqueByLegacyNo(rows: RelatedName[]) {
  const seen = new Set<number>()
  const uniqueRows: RelatedName[] = []
  for (const row of rows) {
    if (seen.has(row.legacy_no)) continue
    seen.add(row.legacy_no)
    uniqueRows.push(row)
  }
  return uniqueRows
}

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isInteger(parsed) ? parsed : null
}

function toNullableString(value: string): string | null {
  const trimmed = value.trim()
  return trimmed || null
}

export default function NewLibraryBookPage() {
  const router = useRouter()
  const hasRestoredDraftRef = useRef(false)
  const draftSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [bookTypes, setBookTypes] = useState<BookType[]>([])
  const [statuses, setStatuses] = useState<LibraryStatus[]>([])
  const [authorOptions, setAuthorOptions] = useState<LibraryAuthor[]>([])
  const [artistOptions, setArtistOptions] = useState<LibraryArtist[]>([])
  const [publisherOptions, setPublisherOptions] = useState<RelatedName[]>([])
  const [authorLinks, setAuthorLinks] = useState<EditableAuthorLink[]>([])
  const [artistLinks, setArtistLinks] = useState<EditableArtistLink[]>([])
  const [authorToAdd, setAuthorToAdd] = useState('')
  const [artistToAdd, setArtistToAdd] = useState('')
  const [publisherToLink, setPublisherToLink] = useState('')
  const [authorQuery, setAuthorQuery] = useState('')
  const [artistQuery, setArtistQuery] = useState('')
  const [publisherQuery, setPublisherQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importingAbeBooks, setImportingAbeBooks] = useState(false)
  const [error, setError] = useState('')
  const [importMessage, setImportMessage] = useState('')
  const [abebooksUrl, setAbebooksUrl] = useState('')

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

  const [form, setForm] = useState<BookForm>({
    title: '',
    type_no: '',
    status_no: '',
    publisher_no: '',
    publication_year: '',
    volume: '',
    series: '',
    isbn: '',
    copy: '',
    search_author: '',
    search_exhibition: '',
    search_publisher: '',
    remarks: '',
  })

  // Restore an unsaved draft (e.g. after navigating away and back) before anything else runs.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LIBRARY_BOOK_NEW_DRAFT_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && parsed.version === LIBRARY_BOOK_NEW_DRAFT_VERSION) {
          if (parsed.form) setForm((current) => ({ ...current, ...parsed.form }))
          if (Array.isArray(parsed.authorLinks)) setAuthorLinks(parsed.authorLinks)
          if (Array.isArray(parsed.artistLinks)) setArtistLinks(parsed.artistLinks)
          setAuthorQuery(parsed.authorQuery ?? '')
          setArtistQuery(parsed.artistQuery ?? '')
          setPublisherQuery(parsed.publisherQuery ?? '')
          setAbebooksUrl(parsed.abebooksUrl ?? '')
        }
      }
    } catch (restoreError) {
      console.error('[LIBRARY_BOOK_NEW] impossible de restaurer le brouillon', restoreError)
    } finally {
      hasRestoredDraftRef.current = true
    }
  }, [])

  // Autosave the draft so leaving and returning to this page keeps unsaved input.
  useEffect(() => {
    if (!hasRestoredDraftRef.current) return
    if (saving) return

    const hasContent = Boolean(
      form.title.trim() ||
        form.isbn.trim() ||
        form.search_author.trim() ||
        form.search_publisher.trim() ||
        form.remarks.trim() ||
        authorLinks.length > 0 ||
        artistLinks.length > 0
    )
    if (!hasContent) return

    if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current)
    draftSaveTimeoutRef.current = setTimeout(() => {
      try {
        sessionStorage.setItem(LIBRARY_BOOK_NEW_DRAFT_KEY, JSON.stringify({
          version: LIBRARY_BOOK_NEW_DRAFT_VERSION,
          savedAt: new Date().toISOString(),
          form,
          authorLinks,
          artistLinks,
          authorQuery,
          artistQuery,
          publisherQuery,
          abebooksUrl,
        }))
      } catch (saveError) {
        console.error('[LIBRARY_BOOK_NEW] impossible de sauvegarder le brouillon', saveError)
      }
    }, 500)

    return () => {
      if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current)
    }
  }, [form, authorLinks, artistLinks, authorQuery, artistQuery, publisherQuery, abebooksUrl, saving])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      const [typesResponse, statusesResponse, authorsResponse, artistsResponse, publishersResponse] = await Promise.all([
        fetch('/api/library?view=types'),
        fetch('/api/library?view=status'),
        fetch('/api/library?view=authors&offset=0&limit=100'),
        fetch('/api/library?view=artists&offset=0&limit=100'),
        fetch('/api/library?view=related-names&offset=0&limit=100'),
      ])

      const [typesPayload, statusesPayload, authorsPayload, artistsPayload, publishersPayload] = await Promise.all([
        typesResponse.json() as Promise<{ types?: BookType[]; error?: string }>,
        statusesResponse.json() as Promise<{ statuses?: LibraryStatus[]; error?: string }>,
        authorsResponse.json() as Promise<{ authors?: LibraryAuthor[]; error?: string }>,
        artistsResponse.json() as Promise<{ artists?: LibraryArtist[]; error?: string }>,
        publishersResponse.json() as Promise<{ relatedNames?: RelatedName[]; error?: string }>,
      ])

      if (cancelled) return

      if (!typesResponse.ok || !statusesResponse.ok || !authorsResponse.ok || !artistsResponse.ok || !publishersResponse.ok) {
        setError(typesPayload.error ?? statusesPayload.error ?? authorsPayload.error ?? artistsPayload.error ?? publishersPayload.error ?? 'Impossible de charger les donnees du formulaire.')
      } else {
        setBookTypes(typesPayload.types ?? [])
        setStatuses(statusesPayload.statuses ?? [])
        setAuthorOptions(authorsPayload.authors ?? [])
        setArtistOptions(artistsPayload.artists ?? [])
        setPublisherOptions(publishersPayload.relatedNames ?? [])
      }

      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const rows = await searchOptions<LibraryAuthor>('authors', authorQuery)
          setAuthorOptions(uniqueById(rows))
        } catch (searchError) {
          setError(searchError instanceof Error ? searchError.message : 'Impossible de charger les auteurs.')
        }
      })()
    }, 220)
    return () => window.clearTimeout(timer)
  }, [authorQuery])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const rows = await searchOptions<LibraryArtist>('artists', artistQuery)
          setArtistOptions(uniqueById(rows))
        } catch (searchError) {
          setError(searchError instanceof Error ? searchError.message : 'Impossible de charger les artistes.')
        }
      })()
    }, 220)
    return () => window.clearTimeout(timer)
  }, [artistQuery])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const rows = await searchRelatedNames(publisherQuery)
          setPublisherOptions(uniqueByLegacyNo(rows))
        } catch (searchError) {
          setError(searchError instanceof Error ? searchError.message : 'Impossible de charger les publishers.')
        }
      })()
    }, 220)
    return () => window.clearTimeout(timer)
  }, [publisherQuery])

  const updateField = (field: keyof BookForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const addAuthorLink = () => {
    if (!authorToAdd) return
    const option = authorOptions.find((item) => item.id === authorToAdd)
    if (!option) return
    setAuthorLinks((current) => {
      if (current.some((item) => item.author_id === option.id)) return current
      return [...current, { author_id: option.id, label: personName(option) || `Author #${option.legacy_no}`, is_default: current.length === 0 }]
    })
    setAuthorToAdd('')
  }

  const addArtistLink = () => {
    if (!artistToAdd) return
    const option = artistOptions.find((item) => item.id === artistToAdd)
    if (!option) return
    setArtistLinks((current) => {
      if (current.some((item) => item.artist_id === option.id)) return current
      return [...current, { artist_id: option.id, label: personName(option) || 'Artist', is_default: current.length === 0 }]
    })
    setArtistToAdd('')
  }

  const setDefaultAuthor = (authorId: string) => {
    setAuthorLinks((current) => current.map((item) => ({ ...item, is_default: item.author_id === authorId })))
  }

  const setDefaultArtist = (artistId: string) => {
    setArtistLinks((current) => current.map((item) => ({ ...item, is_default: item.artist_id === artistId })))
  }

  const removeAuthor = (authorId: string) => {
    setAuthorLinks((current) => {
      const next = current.filter((item) => item.author_id !== authorId)
      if (next.length > 0 && !next.some((item) => item.is_default)) next[0] = { ...next[0], is_default: true }
      return next
    })
  }

  const removeArtist = (artistId: string) => {
    setArtistLinks((current) => {
      const next = current.filter((item) => item.artist_id !== artistId)
      if (next.length > 0 && !next.some((item) => item.is_default)) next[0] = { ...next[0], is_default: true }
      return next
    })
  }

  const selectedPublisherLabel = useMemo(() => {
    const selected = publisherOptions.find((item) => String(item.legacy_no) === form.publisher_no)
    return selected ? relatedNameLabel(selected) : (form.search_publisher.trim() || '')
  }, [publisherOptions, form.publisher_no, form.search_publisher])

  const linkPublisher = () => {
    if (!publisherToLink) return
    const selected = publisherOptions.find((item) => String(item.legacy_no) === publisherToLink)
    if (!selected) return
    updateField('publisher_no', String(selected.legacy_no))
    updateField('search_publisher', relatedNameLabel(selected))
  }

  const clearPublisherLink = () => {
    updateField('publisher_no', '')
  }

  const handleAbeBooksImport = async () => {
    setError('')
    setImportMessage('')

    const trimmedUrl = abebooksUrl.trim()
    if (!trimmedUrl) {
      setError('Merci de coller une URL AbeBooks.')
      return
    }

    setImportingAbeBooks(true)
    try {
      const response = await fetch('/api/library/imports/abebooks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: trimmedUrl }),
      })

      const payload = await response.json() as { prefill?: AbeBooksPrefill; error?: string }
      if (!response.ok || !payload.prefill) {
        setError(payload.error ?? 'Import AbeBooks impossible.')
        return
      }

      const prefill = payload.prefill
      setForm((current) => {
        const importedRemarks = [prefill.remarks, current.remarks.trim() || null].filter(Boolean).join('\n')
        return {
          ...current,
          title: prefill.title ?? current.title,
          isbn: prefill.isbn ?? current.isbn,
          publisher_no: prefill.publisher_no ? String(prefill.publisher_no) : current.publisher_no,
          publication_year: prefill.publication_year ? String(prefill.publication_year) : current.publication_year,
          search_author: prefill.search_author ?? current.search_author,
          search_publisher: prefill.search_publisher ?? current.search_publisher,
          remarks: importedRemarks,
        }
      })

      if (prefill.author_links?.length) {
        setAuthorLinks(prefill.author_links)
      }
      if (prefill.artist_links?.length) {
        setArtistLinks(prefill.artist_links)
      }

      setAuthorQuery(prefill.search_author ?? '')
      setPublisherQuery(prefill.publisher_search_hint ?? prefill.search_publisher ?? '')
      setImportMessage('Import AbeBooks termine. Les champs detectes ont ete pre-remplis.')
    } catch {
      setError('Erreur reseau pendant l\'import AbeBooks.')
    } finally {
      setImportingAbeBooks(false)
    }
  }

  const handleSubmit: React.ComponentProps<'form'>['onSubmit'] = (event) => {
    event.preventDefault()
    void (async () => {
      setError('')
      setSaving(true)

      const response = await fetch('/api/library/books', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: toNullableString(form.title),
          type_no: toNullableNumber(form.type_no),
          status_no: toNullableNumber(form.status_no),
          publisher_no: toNullableNumber(form.publisher_no),
          publication_year: toNullableNumber(form.publication_year),
          volume: toNullableString(form.volume),
          series: toNullableString(form.series),
          isbn: toNullableString(form.isbn),
          copy: toNullableString(form.copy),
          search_artist: toNullableString(artistLinks.map((item) => item.label).join(', ')) ?? null,
          search_author: toNullableString(authorLinks.map((item) => item.label).join(', ')) ?? toNullableString(form.search_author),
          search_exhibition: toNullableString(form.search_exhibition),
          search_publisher: toNullableString(selectedPublisherLabel) ?? toNullableString(form.search_publisher),
          remarks: toNullableString(form.remarks),
          author_links: authorLinks.map((item) => ({ author_id: item.author_id, is_default: item.is_default })),
          artist_links: artistLinks.map((item) => ({ artist_id: item.artist_id, is_default: item.is_default })),
        }),
      })

      const payload = await response.json() as { book?: { id: string }; error?: string }
      if (!response.ok || !payload.book?.id) {
        setError(payload.error ?? 'Impossible de creer le livre.')
        setSaving(false)
        return
      }

      try {
        sessionStorage.removeItem(LIBRARY_BOOK_NEW_DRAFT_KEY)
      } catch (clearError) {
        console.error('[LIBRARY_BOOK_NEW] impossible de supprimer le brouillon', clearError)
      }

      router.push(`/library/books/${payload.book.id}`)
    })()
  }

  if (loading) return <div className="p-6 pt-20">Chargement...</div>

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 pt-20">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Library</p>
          <h1 className="text-2xl font-semibold">New book</h1>
        </div>
      </header>

      <div className="no-print" style={floatingActionBarStyle}>
        <button type="button" className="edit-button" onClick={() => router.back()}>Cancel</button>
        <button type="submit" form="library-book-create-form" className="edit-button" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>

      <section className="rounded border bg-white p-5">
        <form id="library-book-create-form" className="space-y-4" onSubmit={handleSubmit}>
          {error && <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          {importMessage && <p className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{importMessage}</p>}

          <div className="rounded border border-sky-200 bg-sky-50 p-4">
            <p className="text-sm font-semibold text-sky-900">Import from AbeBooks</p>
            <p className="mt-1 text-xs text-sky-800">Paste an AbeBooks book URL to prefill title, ISBN, year, author and publisher.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input className="w-full min-w-[260px] flex-1 rounded border bg-white px-3 py-2 text-sm" placeholder="https://www.abebooks.com/..." value={abebooksUrl} onChange={(event) => setAbebooksUrl(event.target.value)} />
              <button type="button" className="edit-button" disabled={importingAbeBooks} onClick={() => { void handleAbeBooksImport() }}>
                {importingAbeBooks ? 'Importing...' : 'Import AbeBooks'}
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span>Title</span>
              <input className={fieldClassName} value={form.title} onChange={(event) => updateField('title', event.target.value)} />
            </label>

            <div className="sm:col-span-2 rounded border border-gray-200 p-3">
              <p className="mb-2 text-sm font-semibold">Linked artists</p>
              <div className="mb-3 flex flex-wrap gap-2">
                <input className={`${fieldClassName} min-w-[280px]`} placeholder="Search artist" value={artistQuery} onChange={(event) => setArtistQuery(event.target.value)} />
                <select className={`${fieldClassName} min-w-[280px]`} value={artistToAdd} onChange={(event) => setArtistToAdd(event.target.value)}>
                  <option value="">Select artist to add</option>
                  {artistOptions.map((artist) => <option key={artist.id} value={artist.id}>{personName(artist) || 'Artist'}</option>)}
                </select>
                <button type="button" className="edit-button" onClick={addArtistLink}>Add artist</button>
              </div>
              {artistLinks.length === 0 ? <p className="text-sm text-gray-500">No artist linked.</p> : (
                <div className="space-y-2">
                  {artistLinks.map((link) => (
                    <div key={link.artist_id} className="flex flex-wrap items-center justify-between gap-2 rounded border bg-gray-50 px-3 py-2 text-sm">
                      <span>{link.label}</span>
                      <div className="flex gap-2">
                        <button type="button" className="rounded border px-2 py-1" onClick={() => setDefaultArtist(link.artist_id)}>{link.is_default ? 'Default' : 'Set default'}</button>
                        <button type="button" className="rounded border px-2 py-1" onClick={() => removeArtist(link.artist_id)}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="sm:col-span-2 rounded border border-gray-200 p-3">
              <p className="mb-2 text-sm font-semibold">Linked publisher</p>
              <div className="mb-3 flex flex-wrap gap-2">
                <input className={`${fieldClassName} min-w-[280px]`} placeholder="Search publisher" value={publisherQuery} onChange={(event) => setPublisherQuery(event.target.value)} />
                <select className={`${fieldClassName} min-w-[280px]`} value={publisherToLink} onChange={(event) => setPublisherToLink(event.target.value)}>
                  <option value="">Select publisher to link</option>
                  {publisherOptions.map((publisher) => <option key={publisher.legacy_no} value={publisher.legacy_no}>{relatedNameLabel(publisher)}</option>)}
                </select>
                <button type="button" className="edit-button" onClick={linkPublisher}>Link publisher</button>
                <button type="button" className="rounded border px-3 py-2 text-sm" onClick={clearPublisherLink}>Clear</button>
              </div>
              <p className="text-sm text-gray-600">Current linked publisher: <strong>{selectedPublisherLabel || 'None'}</strong></p>
            </div>

            <div className="sm:col-span-2 rounded border border-gray-200 p-3">
              <p className="mb-2 text-sm font-semibold">Linked authors</p>
              <div className="mb-3 flex flex-wrap gap-2">
                <input className={`${fieldClassName} min-w-[280px]`} placeholder="Search author" value={authorQuery} onChange={(event) => setAuthorQuery(event.target.value)} />
                <select className={`${fieldClassName} min-w-[280px]`} value={authorToAdd} onChange={(event) => setAuthorToAdd(event.target.value)}>
                  <option value="">Select author to add</option>
                  {authorOptions.map((author) => <option key={author.id} value={author.id}>{personName(author) || `Author #${author.legacy_no}`}</option>)}
                </select>
                <button type="button" className="edit-button" onClick={addAuthorLink}>Add author</button>
              </div>
              {authorLinks.length === 0 ? <p className="text-sm text-gray-500">No author linked.</p> : (
                <div className="space-y-2">
                  {authorLinks.map((link) => (
                    <div key={link.author_id} className="flex flex-wrap items-center justify-between gap-2 rounded border bg-gray-50 px-3 py-2 text-sm">
                      <span>{link.label}</span>
                      <div className="flex gap-2">
                        <button type="button" className="rounded border px-2 py-1" onClick={() => setDefaultAuthor(link.author_id)}>{link.is_default ? 'Default' : 'Set default'}</button>
                        <button type="button" className="rounded border px-2 py-1" onClick={() => removeAuthor(link.author_id)}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <label className="grid gap-1 text-sm">
              <span>Publication year</span>
              <input className={fieldClassName} type="number" value={form.publication_year} onChange={(event) => updateField('publication_year', event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Type</span>
              <select className={fieldClassName} value={form.type_no} onChange={(event) => updateField('type_no', event.target.value)}>
                <option value="">None</option>
                {bookTypes.map((item) => <option key={item.legacy_no} value={item.legacy_no}>{item.full_name || item.description || item.type_number || item.legacy_no}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span>Status</span>
              <select className={fieldClassName} value={form.status_no} onChange={(event) => updateField('status_no', event.target.value)}>
                <option value="">None</option>
                {statuses.map((item) => <option key={item.legacy_no} value={item.legacy_no}>{item.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span>ISBN</span>
              <input className={fieldClassName} value={form.isbn} onChange={(event) => updateField('isbn', event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Volume</span>
              <input className={fieldClassName} value={form.volume} onChange={(event) => updateField('volume', event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Series</span>
              <input className={fieldClassName} value={form.series} onChange={(event) => updateField('series', event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Copy</span>
              <input className={fieldClassName} value={form.copy} onChange={(event) => updateField('copy', event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span>Remarks</span>
              <textarea className={fieldClassName} rows={4} value={form.remarks} onChange={(event) => updateField('remarks', event.target.value)} />
            </label>
          </div>
        </form>
      </section>
    </main>
  )
}
