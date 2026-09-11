'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'
import { privateImageUrl } from '@/lib/privateImageUrl'
import { fetchWithAuth } from '@/lib/fetchWithAuth'
import { useSessionProfile } from '@/contexts/SessionContext'

const LIBRARY_BOOK_EDIT_DRAFT_VERSION = 1

function getLibraryBookEditDraftKey(bookId: string) {
  return `artmuse_library_book_edit_draft_${bookId}`
}

type Book = {
  id: string
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
  cover_image_url: string | null
  copy: string | null
  search_artist: string | null
  search_author: string | null
  search_exhibition: string | null
  search_publisher: string | null
}

type BookType = { legacy_no: number; type_number: string | null; description: string | null; full_name: string | null }
type LibraryStatus = { legacy_no: number; label: string }
type LibraryAuthor = { id: string; legacy_no: number; first_name: string | null; last_name: string | null }
type LibraryArtist = { id: string; first_name: string | null; last_name: string | null }
type AuthorLink = { author_id: string; is_default: boolean; author: (LibraryAuthor & { legacy_no: number }) | null }
type ArtistLink = { is_default: boolean; legacy_artist_no: number; artist: (LibraryArtist & { year_of_birth: number | null; year_of_death: number | null }) | null }

type EditableAuthorLink = { author_id: string; label: string; is_default: boolean }
type EditableArtistLink = { artist_id: string | null; legacy_artist_no: number | null; label: string; is_default: boolean }

type BookForm = {
  title: string
  entered_at: string
  type_no: string
  status_no: string
  publisher_no: string
  publication_year: string
  volume: string
  series: string
  isbn: string
  cover_image_url: string
  copy: string
  search_artist: string
  search_author: string
  search_exhibition: string
  search_publisher: string
  remarks: string
}

type OpenLibraryMetadata = {
  subtitle: string | null
  number_of_pages: number | null
  publish_date: string | null
  publishers: string[]
  languages: string[]
  authors: string[]
}

const fieldClassName = 'w-full rounded border bg-white px-3 py-2'

function personName(person: { first_name: string | null; last_name: string | null } | null) {
  return person ? [person.first_name, person.last_name].filter(Boolean).join(' ') : ''
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

function parseTypeNumber(value: string | null | undefined) {
  if (!value) return Number.NaN
  const numericToken = /\d+/.exec(value.trim())?.[0]
  return numericToken ? Number(numericToken) : Number.NaN
}

function compareTypeRows(left: BookType, right: BookType) {
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

function formatTypeLabel(item: BookType) {
  const label = item.full_name || item.description || ''
  if (item.type_number) return label ? `${item.type_number} - ${label}` : item.type_number
  return label || String(item.legacy_no)
}

function normalizeIsbn(value: string | null) {
  if (!value) return ''
  return value.replace(/[^0-9Xx]/g, '').toUpperCase()
}

function openLibraryCoverUrl(isbn: string) {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`
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

async function searchOptions<T extends Record<string, unknown>>(view: 'authors' | 'artists', query: string) {
  const response = await fetch(`/api/library?view=${view}&offset=0&limit=100&q=${encodeURIComponent(query)}`)
  const payload = await response.json() as { authors?: T[]; artists?: T[]; error?: string }
  if (!response.ok) {
    throw new Error(payload.error ?? `Impossible de charger ${view}.`)
  }
  return (view === 'authors' ? payload.authors : payload.artists) ?? []
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

function dedupeEditableArtistLinks(links: EditableArtistLink[]) {
  const unique: EditableArtistLink[] = []
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

export default function EditLibraryBookPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { role, loading: sessionLoading } = useSessionProfile()
  const canWrite = role === 'Editor' || role === 'Administrator'
  const hasRestoredDraftRef = useRef(false)
  const draftSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [book, setBook] = useState<Book | null>(null)
  const [bookTypes, setBookTypes] = useState<BookType[]>([])
  const [statuses, setStatuses] = useState<LibraryStatus[]>([])
  const [authorOptions, setAuthorOptions] = useState<LibraryAuthor[]>([])
  const [artistOptions, setArtistOptions] = useState<LibraryArtist[]>([])
  const [authorLinks, setAuthorLinks] = useState<EditableAuthorLink[]>([])
  const [artistLinks, setArtistLinks] = useState<EditableArtistLink[]>([])
  const [authorToAdd, setAuthorToAdd] = useState('')
  const [artistToAdd, setArtistToAdd] = useState('')
  const [authorQuery, setAuthorQuery] = useState('')
  const [artistQuery, setArtistQuery] = useState('')
  const [loadingAuthorOptions, setLoadingAuthorOptions] = useState(false)
  const [loadingArtistOptions, setLoadingArtistOptions] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [importingCover, setImportingCover] = useState(false)
  const [openLibraryMetadata, setOpenLibraryMetadata] = useState<OpenLibraryMetadata | null>(null)
  const [error, setError] = useState('')
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
    entered_at: '',
    type_no: '',
    status_no: '',
    publisher_no: '',
    publication_year: '',
    volume: '',
    series: '',
    isbn: '',
    cover_image_url: '',
    copy: '',
    search_artist: '',
    search_author: '',
    search_exhibition: '',
    search_publisher: '',
    remarks: '',
  })

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      const response = await fetch(`/api/library/books/${id}`)
      const payload = await response.json() as {
        book?: Book
        authors?: AuthorLink[]
        artists?: ArtistLink[]
        types?: BookType[]
        statuses?: LibraryStatus[]
        error?: string
      }

      if (cancelled) return

      if (!response.ok || !payload.book) {
        setError(payload.error ?? 'Impossible de charger le livre.')
        setLoading(false)
        return
      }

      const loadedBook = payload.book

      setBook(loadedBook)
      setBookTypes([...(payload.types ?? [])].sort(compareTypeRows))
      setStatuses(payload.statuses ?? [])
      const initialAuthorLinks =
        (payload.authors ?? [])
          .filter((item) => typeof item.author_id === 'string' && item.author_id)
          .map((item, index) => ({
            author_id: item.author_id,
            label: personName(item.author) || loadedBook.search_author || `Legacy author link ${index + 1}`,
            is_default: Boolean(item.is_default),
          }))
      const initialArtistLinks = dedupeEditableArtistLinks(
        (payload.artists ?? [])
          .map((item, index) => ({
            artist_id: item.artist?.id ?? null,
            legacy_artist_no: item.legacy_artist_no,
            label: personName(item.artist) || loadedBook.search_artist || (item.legacy_artist_no ? `Legacy artist #${item.legacy_artist_no}` : `Legacy artist link ${index + 1}`),
            is_default: Boolean(item.is_default),
          }))
      )

      setAuthorLinks(initialAuthorLinks)
      setArtistLinks(initialArtistLinks)
      setForm({
        title: loadedBook.title ?? '',
        entered_at: loadedBook.entered_at ?? '',
        type_no: loadedBook.type_no?.toString() ?? '',
        status_no: loadedBook.status_no?.toString() ?? '',
        publisher_no: loadedBook.publisher_no?.toString() ?? '',
        publication_year: loadedBook.publication_year?.toString() ?? '',
        volume: loadedBook.volume ?? '',
        series: loadedBook.series ?? '',
        isbn: loadedBook.isbn ?? '',
        cover_image_url: loadedBook.cover_image_url ?? '',
        copy: loadedBook.copy ?? '',
        search_artist: loadedBook.search_artist ?? '',
        search_author: loadedBook.search_author ?? '',
        search_exhibition: loadedBook.search_exhibition ?? '',
        search_publisher: loadedBook.search_publisher ?? '',
        remarks: loadedBook.remarks ?? '',
      })

      // Restore an unsaved draft for this book (e.g. after navigating away and back).
      try {
        const raw = sessionStorage.getItem(getLibraryBookEditDraftKey(loadedBook.id))
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed && parsed.version === LIBRARY_BOOK_EDIT_DRAFT_VERSION && parsed.bookId === loadedBook.id) {
            if (parsed.form) setForm((current) => ({ ...current, ...parsed.form }))
            if (Array.isArray(parsed.authorLinks)) setAuthorLinks(parsed.authorLinks)
            if (Array.isArray(parsed.artistLinks)) setArtistLinks(parsed.artistLinks)
            setAuthorQuery(parsed.authorQuery ?? '')
            setArtistQuery(parsed.artistQuery ?? '')
          }
        }
      } catch (restoreError) {
        console.error('[LIBRARY_BOOK_EDIT] impossible de restaurer le brouillon', restoreError)
      } finally {
        hasRestoredDraftRef.current = true
      }

      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [id])

  // Autosave the draft so leaving and returning to this page keeps unsaved edits.
  useEffect(() => {
    if (!hasRestoredDraftRef.current) return
    if (!book) return
    if (saving || deleting) return

    if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current)
    draftSaveTimeoutRef.current = setTimeout(() => {
      try {
        sessionStorage.setItem(getLibraryBookEditDraftKey(book.id), JSON.stringify({
          version: LIBRARY_BOOK_EDIT_DRAFT_VERSION,
          savedAt: new Date().toISOString(),
          bookId: book.id,
          form,
          authorLinks,
          artistLinks,
          authorQuery,
          artistQuery,
        }))
      } catch (saveError) {
        console.error('[LIBRARY_BOOK_EDIT] impossible de sauvegarder le brouillon', saveError)
      }
    }, 500)

    return () => {
      if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current)
    }
  }, [book, form, authorLinks, artistLinks, authorQuery, artistQuery, saving, deleting])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setLoadingAuthorOptions(true)
          const rows = await searchOptions<LibraryAuthor>('authors', authorQuery)
          setAuthorOptions(uniqueById(rows))
        } catch (searchError) {
          setError(searchError instanceof Error ? searchError.message : 'Impossible de charger les auteurs.')
        } finally {
          setLoadingAuthorOptions(false)
        }
      })()
    }, 220)

    return () => window.clearTimeout(timer)
  }, [authorQuery])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setLoadingArtistOptions(true)
          const rows = await searchOptions<LibraryArtist>('artists', artistQuery)
          setArtistOptions(uniqueById(rows))
        } catch (searchError) {
          setError(searchError instanceof Error ? searchError.message : 'Impossible de charger les artistes.')
        } finally {
          setLoadingArtistOptions(false)
        }
      })()
    }, 220)

    return () => window.clearTimeout(timer)
  }, [artistQuery])

  const updateField = (field: keyof BookForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const uploadCoverFile = async (file: File) => {
    if (!book) return

    setUploadingCover(true)
    setError('')

    const extensionFromName = file.name.split('.').pop()?.trim().toLowerCase()
    const extension = extensionFromName || file.type.split('/')[1] || 'png'
    const filePath = `library-books/${book.id}/cover-${crypto.randomUUID()}.${extension}`

    const { error: uploadError } = await supabase.storage
      .from('artwork-images')
      .upload(filePath, file, { upsert: false })

    if (uploadError) {
      setError(uploadError.message)
      setUploadingCover(false)
      return
    }

    const { data } = supabase.storage.from('artwork-images').getPublicUrl(filePath)
    updateField('cover_image_url', data.publicUrl)
    setUploadingCover(false)
  }

  const importCoverFromIsbn = async () => {
    if (!book) return
    const isbn = normalizeIsbn(form.isbn)
    if (!isbn) return

    setImportingCover(true)
    setError('')

    try {
      const response = await fetchWithAuth(`/api/library/books/${book.id}/cover-import`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isbn }),
      })
      const payload = await response.json() as { url?: string; error?: string }
      if (!response.ok || !payload.url) {
        setError(payload.error ?? "Impossible d'importer la couverture.")
        return
      }
      updateField('cover_image_url', payload.url)
    } catch {
      setError('Erreur réseau pendant l\'import de la couverture.')
    } finally {
      setImportingCover(false)
    }
  }

  const handleCoverPaste: React.ClipboardEventHandler<HTMLTextAreaElement> = (event) => {
    const imageItem = Array.from(event.clipboardData.items).find((item) => item.type.startsWith('image/'))
    const file = imageItem?.getAsFile()
    if (!file) return
    event.preventDefault()
    void uploadCoverFile(file)
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
      return [...current, { artist_id: option.id, legacy_artist_no: null, label: personName(option) || 'Artist', is_default: current.length === 0 }]
    })
    setArtistToAdd('')
  }

  const setDefaultAuthor = (authorId: string) => {
    setAuthorLinks((current) => current.map((item) => ({ ...item, is_default: item.author_id === authorId })))
  }

  const setDefaultArtist = (index: number) => {
    setArtistLinks((current) => current.map((item, currentIndex) => ({ ...item, is_default: currentIndex === index })))
  }

  const removeAuthor = (authorId: string) => {
    setAuthorLinks((current) => {
      const next = current.filter((item) => item.author_id !== authorId)
      if (next.length > 0 && !next.some((item) => item.is_default)) {
        next[0] = { ...next[0], is_default: true }
      }
      return next
    })
  }

  const removeArtist = (index: number) => {
    setArtistLinks((current) => {
      const next = current.filter((_, currentIndex) => currentIndex !== index)
      if (next.length > 0 && !next.some((item) => item.is_default)) {
        next[0] = { ...next[0], is_default: true }
      }
      return next
    })
  }

  const handleSubmit: React.ComponentProps<'form'>['onSubmit'] = (event) => {
    event.preventDefault()
    if (!book) return

    void (async () => {
      setSaving(true)
      setError('')

      const response = await fetch(`/api/library/books/${book.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        
        body: JSON.stringify({
          title: toNullableString(form.title),
          entered_at: form.entered_at || null,
          type_no: toNullableNumber(form.type_no),
          status_no: toNullableNumber(form.status_no),
          publisher_no: toNullableNumber(form.publisher_no),
          publication_year: toNullableNumber(form.publication_year),
          volume: toNullableString(form.volume),
          series: toNullableString(form.series),
          isbn: toNullableString(form.isbn),
          cover_image_url: toNullableString(form.cover_image_url),
          copy: toNullableString(form.copy),
          search_artist: toNullableString(form.search_artist),
          search_author: toNullableString(form.search_author),
          search_exhibition: toNullableString(form.search_exhibition),
          search_publisher: toNullableString(form.search_publisher),
          remarks: toNullableString(form.remarks),
          author_links: authorLinks,
          artist_links: dedupeEditableArtistLinks(artistLinks),
        }),
      })

      const payload = await response.json() as { error?: string }
      if (!response.ok) {
        if (response.status === 403) {
          setError('Vous n\'avez pas les droits pour modifier ce livre.')
        } else {
          setError(payload.error ?? 'Impossible de mettre à jour le livre.')
        }
        setSaving(false)
        return
      }

      try {
        sessionStorage.removeItem(getLibraryBookEditDraftKey(book.id))
      } catch (clearError) {
        console.error('[LIBRARY_BOOK_EDIT] impossible de supprimer le brouillon', clearError)
      }

      router.push(`/library/books/${book.id}`)
    })()
  }

  const handleDelete = () => {
    if (!book) return
    if (!confirm('Delete this book? This will also remove linked authors, artists and exhibitions.')) return

    void (async () => {
      setDeleting(true)
      setError('')
      const response = await fetch(`/api/library/books/${book.id}`, { method: 'DELETE' })
      const payload = await response.json() as { error?: string }
      if (!response.ok) {
        if (response.status === 403) {
          setError('Vous n\'avez pas les droits pour supprimer ce livre.')
        } else {
          setError(payload.error ?? 'Impossible de supprimer le livre.')
        }
        setDeleting(false)
        return
      }
      try {
        sessionStorage.removeItem(getLibraryBookEditDraftKey(book.id))
      } catch (clearError) {
        console.error('[LIBRARY_BOOK_EDIT] impossible de supprimer le brouillon', clearError)
      }
      router.push('/library')
    })()
  }

  const normalizedIsbn = normalizeIsbn(form.isbn)
  const manualCoverPreviewUrl = privateImageUrl(form.cover_image_url)
  const isbnCoverPreviewUrl = !manualCoverPreviewUrl && normalizedIsbn ? openLibraryCoverUrl(normalizedIsbn) : ''
  const abebooksUrl = normalizedIsbn ? abebooksSearchUrl(normalizedIsbn) : ''

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

  const displayedOpenLibraryMetadata = normalizedIsbn ? openLibraryMetadata : null

  if (loading) return <div className="p-6 pt-20">Chargement...</div>
  if (error && !book) return <div className="space-y-3 p-6 pt-20"><p className="text-red-700">{error}</p><Link href="/library" className="underline">Back to library</Link></div>

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 pt-20">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Library book {book?.legacy_no}</p>
          <h1 className="text-2xl font-semibold">Edit book</h1>
        </div>
      </header>

      <div className="no-print" style={floatingActionBarStyle}>
        <button type="button" className="edit-button" onClick={() => router.back()}>Cancel</button>
        <button type="button" className="edit-button edit-button-danger" disabled={sessionLoading || !canWrite || saving || deleting} onClick={handleDelete}>{deleting ? 'Deleting…' : 'Delete'}</button>
        <button type="submit" form="library-book-edit-form" className="edit-button" disabled={sessionLoading || !canWrite || saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>

      <section className="rounded border bg-white p-5">
        <form id="library-book-edit-form" className="space-y-4" onSubmit={handleSubmit}>
          {error && <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          {!sessionLoading && !canWrite && <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">Mode lecture seule: votre role actuel ne permet pas de modifier les liens artistes/auteurs ni d&apos;enregistrer des changements.</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span>Legacy no.</span>
              <input className={fieldClassName} value={book?.legacy_no ?? ''} readOnly />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span>Title</span>
              <input className={fieldClassName} value={form.title} onChange={(event) => updateField('title', event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Entered at</span>
              <input className={fieldClassName} type="date" value={form.entered_at} onChange={(event) => updateField('entered_at', event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Publication year</span>
              <input className={fieldClassName} type="number" value={form.publication_year} onChange={(event) => updateField('publication_year', event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Type</span>
              <select className={fieldClassName} value={form.type_no} onChange={(event) => updateField('type_no', event.target.value)}>
                <option value="">None</option>
                {bookTypes.map((item) => (
                  <option key={item.legacy_no} value={item.legacy_no}>
                    {formatTypeLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span>Status</span>
              <select className={fieldClassName} value={form.status_no} onChange={(event) => updateField('status_no', event.target.value)}>
                <option value="">None</option>
                {statuses.map((item) => (
                  <option key={item.legacy_no} value={item.legacy_no}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span>Publisher no.</span>
              <input className={fieldClassName} type="number" value={form.publisher_no} onChange={(event) => updateField('publisher_no', event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span>ISBN</span>
              <input className={fieldClassName} value={form.isbn} onChange={(event) => updateField('isbn', event.target.value)} />
            </label>
            <div className="grid gap-3 text-sm sm:col-span-2">
              <span>Cover</span>
              <div className="grid gap-4 rounded border border-gray-200 p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                <div className="space-y-2">
                  <div className="overflow-hidden rounded border bg-gray-50">
                    {manualCoverPreviewUrl || isbnCoverPreviewUrl ? (
                      <Image
                        src={manualCoverPreviewUrl || isbnCoverPreviewUrl}
                        alt={form.title ? `Cover of ${form.title}` : 'Book cover'}
                        width={220}
                        height={330}
                        className="aspect-[2/3] h-auto w-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex aspect-[2/3] items-center justify-center p-6 text-center text-sm text-gray-500">
                        No cover available yet.
                      </div>
                    )}
                  </div>
                  {abebooksUrl ? <a className="text-xs underline" href={abebooksUrl} target="_blank" rel="noreferrer">Open AbeBooks search for this ISBN</a> : null}
                  <button
                    type="button"
                    className="rounded border px-3 py-2 text-xs"
                    disabled={!normalizedIsbn || importingCover}
                    onClick={() => void importCoverFromIsbn()}
                  >
                    {importingCover ? 'Importing…' : 'Import cover from Open Library'}
                  </button>
                </div>
                <div className="space-y-3">
                  <label className="grid gap-1 text-sm">
                    <span>Saved cover image URL</span>
                    <input className={fieldClassName} value={form.cover_image_url} onChange={(event) => updateField('cover_image_url', event.target.value)} placeholder="https://..." />
                  </label>
                  <div className="rounded border border-dashed border-gray-400 bg-gray-50 p-4 text-sm">
                    <strong>Paste cover image</strong>
                    <p className="mt-1 text-gray-600">Copy an image from AbeBooks, click in the box below, then paste it with Ctrl+V.</p>
                    <textarea
                      className="mt-3 w-full rounded border bg-white px-3 py-2 text-sm"
                      rows={3}
                      readOnly
                      value=""
                      placeholder="Click here, then paste the cover image"
                      onPaste={handleCoverPaste}
                    />
                    <input
                      className="mt-3 block w-full text-sm"
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (!file) return
                        void uploadCoverFile(file)
                        event.currentTarget.value = ''
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => updateField('cover_image_url', '')} disabled={uploadingCover}>Clear manual cover</button>
                    {uploadingCover ? <span className="text-sm text-gray-500">Uploading cover…</span> : null}
                  </div>
                  <p className="text-xs text-gray-500">Manual cover takes priority over the ISBN cover in the book page and books list.</p>
                </div>
              </div>
            </div>
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
            <label className="grid gap-1 text-sm">
              <span>Search artist</span>
              <input className={fieldClassName} value={form.search_artist} onChange={(event) => updateField('search_artist', event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Search author</span>
              <input className={fieldClassName} value={form.search_author} onChange={(event) => updateField('search_author', event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Search exhibition</span>
              <input className={fieldClassName} value={form.search_exhibition} onChange={(event) => updateField('search_exhibition', event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Search publisher</span>
              <input className={fieldClassName} value={form.search_publisher} onChange={(event) => updateField('search_publisher', event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span>Remarks</span>
              <textarea className={fieldClassName} rows={4} value={form.remarks} onChange={(event) => updateField('remarks', event.target.value)} />
            </label>

            <div className="sm:col-span-2 rounded border border-gray-200 p-3">
              <p className="mb-2 text-sm font-semibold">Linked authors</p>
              <div className="mb-3 flex flex-wrap gap-2">
                <input
                  className={`${fieldClassName} min-w-[280px]`}
                  placeholder="Search author"
                  value={authorQuery}
                  onChange={(event) => setAuthorQuery(event.target.value)}
                />
                <select className={`${fieldClassName} min-w-[280px]`} value={authorToAdd} onChange={(event) => setAuthorToAdd(event.target.value)}>
                  <option value="">Select author to add</option>
                  {authorOptions.map((author) => (
                    <option key={author.id} value={author.id}>{personName(author) || `Author #${author.legacy_no}`}</option>
                  ))}
                </select>
                <button type="button" className="edit-button" disabled={sessionLoading || !canWrite} onClick={addAuthorLink}>Add author</button>
              </div>
              {loadingAuthorOptions && <p className="mb-2 text-xs text-gray-500">Searching authors...</p>}
              {authorLinks.length === 0 ? <p className="text-sm text-gray-500">No author linked.</p> : (
                <div className="space-y-2">
                  {authorLinks.map((link) => (
                    <div key={link.author_id} className="flex flex-wrap items-center justify-between gap-2 rounded border bg-gray-50 px-3 py-2 text-sm">
                      <span>{link.label}</span>
                      <div className="flex gap-2">
                        <button type="button" className="rounded border px-2 py-1" disabled={sessionLoading || !canWrite} onClick={() => setDefaultAuthor(link.author_id)}>{link.is_default ? 'Default' : 'Set default'}</button>
                        <button type="button" className="rounded border px-2 py-1" disabled={sessionLoading || !canWrite} onClick={() => removeAuthor(link.author_id)}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="sm:col-span-2 rounded border border-gray-200 p-3">
              <p className="mb-2 text-sm font-semibold">Linked artists</p>
              <div className="mb-3 flex flex-wrap gap-2">
                <input
                  className={`${fieldClassName} min-w-[280px]`}
                  placeholder="Search artist"
                  value={artistQuery}
                  onChange={(event) => setArtistQuery(event.target.value)}
                />
                <select className={`${fieldClassName} min-w-[280px]`} value={artistToAdd} onChange={(event) => setArtistToAdd(event.target.value)}>
                  <option value="">Select artist to add</option>
                  {artistOptions.map((artist) => (
                    <option key={artist.id} value={artist.id}>{personName(artist) || 'Artist'}</option>
                  ))}
                </select>
                <button type="button" className="edit-button" disabled={sessionLoading || !canWrite} onClick={addArtistLink}>Add artist</button>
              </div>
              {loadingArtistOptions && <p className="mb-2 text-xs text-gray-500">Searching artists...</p>}
              {artistLinks.length === 0 ? <p className="text-sm text-gray-500">No artist linked.</p> : (
                <div className="space-y-2">
                  {artistLinks.map((link, index) => (
                    <div key={`${link.artist_id ?? 'legacy'}-${link.legacy_artist_no ?? index}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded border bg-gray-50 px-3 py-2 text-sm">
                      <span>{link.label}</span>
                      <div className="flex gap-2">
                        <button type="button" className="rounded border px-2 py-1" disabled={sessionLoading || !canWrite} onClick={() => setDefaultArtist(index)}>{link.is_default ? 'Default' : 'Set default'}</button>
                        <button type="button" className="rounded border px-2 py-1" disabled={sessionLoading || !canWrite} onClick={() => removeArtist(index)}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded border border-sky-200 bg-sky-50 p-4 text-sm sm:col-span-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-semibold text-sky-900">Open Library metadata (read-only)</p>
                <span className="rounded-full border border-sky-300 bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-sky-700">External source</span>
              </div>
              <p className="text-xs text-sky-800">These fields are not entered in ArtMuse. They come from Open Library via ISBN.</p>
              {normalizedIsbn ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <p className="sm:col-span-2"><strong>Authors:</strong> {displayedOpenLibraryMetadata?.authors?.join(', ') || '—'}</p>
                  <p><strong>Subtitle:</strong> {displayedOpenLibraryMetadata?.subtitle || '—'}</p>
                  <p><strong>Pages:</strong> {displayedOpenLibraryMetadata?.number_of_pages ?? '—'}</p>
                  <p><strong>Publish date:</strong> {displayedOpenLibraryMetadata?.publish_date || '—'}</p>
                  <p><strong>Publishers:</strong> {displayedOpenLibraryMetadata?.publishers?.join(', ') || '—'}</p>
                  <p className="sm:col-span-2"><strong>Languages:</strong> {displayedOpenLibraryMetadata?.languages?.join(', ') || '—'}</p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-sky-800">Enter an ISBN to load Open Library metadata.</p>
              )}
              {normalizedIsbn && !displayedOpenLibraryMetadata && <p className="mt-2 text-xs text-sky-800">Open Library metadata is not available for this ISBN.</p>}
            </div>
          </div>

        </form>
      </section>
    </main>
  )
}
