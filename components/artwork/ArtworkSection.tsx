
'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { supabase } from '@/lib/supabaseBrowser'
import type {
  ArtworkForm,
  ArtworkWithRelations,
  ArtworkProposal,
  Contact,
} from '@/app/(protected)/types/artwork'

/* ======================
 * Types locaux
 * ====================== */

type Artist = {
  id: string
  first_name: string | null
  last_name: string | null
}

type ArtworkBase = ArtworkForm | ArtworkWithRelations

type Props<T extends ArtworkBase> = {
  artwork: T
  isEditing: boolean
  setArtwork: React.Dispatch<React.SetStateAction<T>>
  addProposal?: (contactId: string, date?: string | null) => Promise<void>
  removeProposal?: (proposalId: string) => Promise<void>
}

function hasPersistentId(artwork: ArtworkBase): artwork is ArtworkWithRelations {
  return typeof (artwork as any).id === 'string'
}

function isContactLike(value: unknown): value is Contact {
  if (!value || typeof value !== 'object') return false
  return 'id' in value
}

/* ======================
 * Helpers texte / recherche
 * ====================== */

function isArtistLike(value: unknown): value is Artist {
  if (!value || typeof value !== 'object') return false
  return 'id' in value
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function scoreArtistMatch(artist: Artist, query: string) {
  const first = normalizeText(artist.first_name ?? '')
  const last = normalizeText(artist.last_name ?? '')
  const full = `${first} ${last}`.trim()
  const reversed = `${last} ${first}`.trim()
  const q = normalizeText(query)
  const terms = q.split(' ').filter(Boolean)

  if (!terms.length) return -1

  if (full === q || reversed === q) return 100
  if (full.startsWith(q) || reversed.startsWith(q)) return 85

  const allTermsMatch = terms.every(
    (term) =>
      first.includes(term) ||
      last.includes(term) ||
      full.includes(term) ||
      reversed.includes(term)
  )

  if (!allTermsMatch) return -1

  let score = 50

  for (const term of terms) {
    if (first === term || last === term) score += 10
    else if (first.startsWith(term) || last.startsWith(term)) score += 6
    else if (first.includes(term) || last.includes(term)) score += 3
  }

  return score
}

function scoreContactMatch(contact: Contact, query: string) {
  const company = normalizeText(contact.company_name ?? '')
  const first = normalizeText(contact.first_name ?? '')
  const last = normalizeText(contact.last_name ?? '')
  const full = `${first} ${last}`.trim()
  const reversed = `${last} ${first}`.trim()
  const companyFull = `${company} ${first} ${last}`.trim()
  const q = normalizeText(query)
  const terms = q.split(' ').filter(Boolean)

  if (!terms.length) return -1

  if (
    company === q ||
    full === q ||
    reversed === q ||
    companyFull === q
  ) {
    return 100
  }

  if (
    company.startsWith(q) ||
    full.startsWith(q) ||
    reversed.startsWith(q) ||
    companyFull.startsWith(q)
  ) {
    return 85
  }

  const allTermsMatch = terms.every(
    (term) =>
      company.includes(term) ||
      first.includes(term) ||
      last.includes(term) ||
      full.includes(term) ||
      reversed.includes(term) ||
      companyFull.includes(term)
  )

  if (!allTermsMatch) return -1

  let score = 50

  for (const term of terms) {
    if (company === term || first === term || last === term) score += 10
    else if (
      company.startsWith(term) ||
      first.startsWith(term) ||
      last.startsWith(term)
    ) {
      score += 6
    } else if (
      company.includes(term) ||
      first.includes(term) ||
      last.includes(term)
    ) {
      score += 3
    }
  }

  return score
}

function mergeUniqueArtists(existing: Artist[], incoming: Artist[]) {
  const map = new Map<string, Artist>()

  for (const item of existing) {
    map.set(item.id, item)
  }

  for (const item of incoming) {
    map.set(item.id, item)
  }

  return Array.from(map.values())
}

function mergeUniqueContacts(existing: Contact[], incoming: Contact[]) {
  const map = new Map<string, Contact>()

  for (const item of existing) {
    map.set(item.id, item)
  }

  for (const item of incoming) {
    map.set(item.id, item)
  }

  return Array.from(map.values())
}

function useDebouncedArtistSearch(query: string) {
  const [results, setResults] = useState<Artist[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const q = query.trim()

    if (!q || q.length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    let active = true

    const timeout = setTimeout(async () => {
      setLoading(true)

      const terms = normalizeText(q).split(' ').filter(Boolean)
      const orFilters = terms.flatMap((term) => [
        `first_name.ilike.%${term}%`,
        `last_name.ilike.%${term}%`,
      ])

      const { data, error } = await supabase
        .from('artists')
        .select('id, first_name, last_name')
        .or(orFilters.join(','))
        .limit(60)

      if (!active) return

      if (error) {
        console.error('SEARCH ARTISTS FAILED:', error)
        setResults([])
        setLoading(false)
        return
      }

      const ranked = ((data as Artist[]) ?? [])
        .map((artist) => ({
          artist,
          score: scoreArtistMatch(artist, q),
        }))
        .filter((item) => item.score >= 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score

          const aLast = normalizeText(a.artist.last_name ?? '')
          const bLast = normalizeText(b.artist.last_name ?? '')
          return aLast.localeCompare(bLast)
        })
        .map((item) => item.artist)
        .slice(0, 20)

      setResults(ranked)
      setLoading(false)
    }, 250)

    return () => {
      active = false
      clearTimeout(timeout)
    }
  }, [query])

  return { results, loading }
}

function useDebouncedContactSearch(query: string) {
  const [results, setResults] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const q = query.trim()

    if (!q || q.length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    let active = true

    const timeout = setTimeout(async () => {
      setLoading(true)

      const terms = normalizeText(q).split(' ').filter(Boolean)
      const orFilters = terms.flatMap((term) => [
        `company_name.ilike.%${term}%`,
        `first_name.ilike.%${term}%`,
        `last_name.ilike.%${term}%`,
      ])

      const { data, error } = await supabase
        .from('contacts')
        .select('id, company_name, first_name, last_name')
        .or(orFilters.join(','))
        .limit(60)

      if (!active) return

      if (error) {
        console.error('SEARCH CONTACTS FAILED:', error)
        setResults([])
        setLoading(false)
        return
      }

      const ranked = ((data as Contact[]) ?? [])
        .map((contact) => ({
          contact,
          score: scoreContactMatch(contact, q),
        }))
        .filter((item) => item.score >= 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score

          const aCompany = normalizeText(a.contact.company_name ?? '')
          const bCompany = normalizeText(b.contact.company_name ?? '')
          const aLast = normalizeText(a.contact.last_name ?? '')
          const bLast = normalizeText(b.contact.last_name ?? '')

          return (aCompany || aLast).localeCompare(bCompany || bLast)
        })
        .map((item) => item.contact)
        .slice(0, 20)

      setResults(ranked)
      setLoading(false)
    }, 250)

    return () => {
      active = false
      clearTimeout(timeout)
    }
  }, [query])

  return { results, loading }
}

/* ======================
 * UI helpers
 * ====================== */

const editInputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #ccc',
  borderRadius: 6,
  fontSize: '0.95rem',
  backgroundColor: '#ffffff',
  boxSizing: 'border-box',
}

const CURRENCY_OPTIONS = ['CHF', 'EUR', 'USD', 'GBP', 'HKD'] as const

function Spinner({
  size = 16,
  color = '#006039',
}: {
  size?: number
  color?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 50 50"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        stroke="#d8d8d8"
        strokeWidth="5"
      />
      <path
        d="M25 5a20 20 0 0 1 20 20"
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 25 25"
          to="360 25 25"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  )
}

function SectionBlock({ children }: { children: React.ReactNode }) {
  return (
    <section
      style={{
        backgroundColor: '#e6e5e5',
        borderRadius: 8,
        padding: 24,
        border: '1px solid #e0e0e0',
      }}
    >
      {children}
    </section>
  )
}

function Divider() {
  return (
    <div
      style={{
        borderTop: '2px solid #8a8a8a',
        margin: '10px 0',
      }}
    />
  )
}

function EditRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

function InfoRow({
  label,
  value,
  contact,
}: {
  label: string
  value?: string
  contact?: Contact | null
}) {
  const content = contact
    ? contact.company_name ||
      [contact.first_name, contact.last_name].filter(Boolean).join(' ')
    : value ?? '—'

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '160px 1fr',
        gap: 12,
        marginBottom: 6,
      }}
    >
      <div style={{ color: '#777', fontSize: '0.9rem' }}>{label}</div>
      <div>{content}</div>
    </div>
  )
}

function DimensionInput({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string
  value: number | null | undefined
  onChange: (v: number | null) => void
}) {
  return (
    <input
      type="number"
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) =>
        onChange(e.target.value ? Number(e.target.value) : null)
      }
      style={{ ...editInputStyle, width: 90 }}
    />
  )
}

function contactLabel(c?: Contact | Artist | null): string {
  if (!c) return '—'

  if ('company_name' in c && c.company_name) {
    return c.company_name
  }

  return [c.first_name, c.last_name].filter(Boolean).join(' ') || '—'
}

function artistLabel(a?: Artist | null): string {
  if (!a) return '—'
  return [a.first_name, a.last_name].filter(Boolean).join(' ') || '—'
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>()
  for (const item of items) {
    if (!map.has(item.id)) {
      map.set(item.id, item)
    }
  }
  return Array.from(map.values())
}

function highlightMatch(label: string, query: string) {
  const q = query.trim()
  if (!q) return label

  const lowerLabel = label.toLowerCase()
  const lowerQuery = q.toLowerCase()
  const index = lowerLabel.indexOf(lowerQuery)

  if (index === -1) return label

  const before = label.slice(0, index)
  const match = label.slice(index, index + q.length)
  const after = label.slice(index + q.length)

  return (
    <>
      {before}
      <mark
        style={{
          backgroundColor: '#fff2a8',
          padding: 0,
        }}
      >
        {match}
      </mark>
      {after}
    </>
  )
}

function safeHostname(url?: string | null) {
  if (!url) return ''
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function AutocompleteSelect<T extends { id: string }>({
  value,
  onChange,
  query,
  setQuery,
  results,
  options,
  getLabel,
  placeholder = 'Search',
  disabled = false,
  isEditing = true,
  noResultsText = 'No results',
  searchingText = 'Searching...',
  minCharsText = 'Type at least 2 characters',
  loading = false,
  minChars = 2,
}: {
  value: string
  onChange: (value: string) => void
  query?: string
  setQuery?: React.Dispatch<React.SetStateAction<string>>
  results?: T[]
  options?: T[]
  getLabel: (item: T) => string
  placeholder?: string
  disabled?: boolean
  isEditing?: boolean
  noResultsText?: string
  searchingText?: string
  minCharsText?: string
  loading?: boolean
  minChars?: number
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [persistedSelectedItem, setPersistedSelectedItem] = useState<T | null>(null)

  const safeOptions = options ?? []
  const safeResults = results ?? []
  const safeQuery = query ?? ''
  const trimmedQuery = safeQuery.trim()

  const selectedItem = useMemo(() => {
    const all = dedupeById([...(safeResults || []), ...(safeOptions || [])])
    return all.find((item) => item.id === value) ?? persistedSelectedItem
  }, [safeOptions, safeResults, value, persistedSelectedItem])

  const selectedLabel = selectedItem ? getLabel(selectedItem) : ''

  const hasEnoughChars = trimmedQuery.length >= minChars
  const isSearching = loading && hasEnoughChars
  const shouldUseSearchMode = trimmedQuery.length > 0

  const displayedItems = useMemo(() => {
    if (!trimmedQuery) {
      return safeOptions.slice(0, 8)
    }

    if (!hasEnoughChars) {
      return []
    }

    let list: T[] = []

    if (results !== undefined) {
      list = safeResults
    } else {
      const lower = trimmedQuery.toLowerCase()
      list = safeOptions.filter((item) =>
        getLabel(item).toLowerCase().includes(lower)
      )
    }

    return dedupeById(list).slice(0, 12)
  }, [trimmedQuery, hasEnoughChars, results, safeResults, safeOptions, getLabel])

  useEffect(() => {
    setHighlightedIndex(0)
  }, [safeQuery, isOpen])

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [])

  useEffect(() => {
    if (!value) {
      setPersistedSelectedItem(null)
    }
  }, [value])

  function handleSelect(item: T) {
    setPersistedSelectedItem(item)
    onChange(item.id)
    setQuery?.('')
    setIsOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsOpen(true)
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) =>
        Math.min(prev + 1, Math.max(displayedItems.length - 1, 0))
      )
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => Math.max(prev - 1, 0))
    }

    if (e.key === 'Enter') {
      if (isOpen && displayedItems[highlightedIndex]) {
        e.preventDefault()
        handleSelect(displayedItems[highlightedIndex])
      }
    }

    if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  if (!isEditing || disabled) {
    return (
      <input
        type="text"
        value={selectedLabel || '—'}
        readOnly
        disabled
        style={{
          ...editInputStyle,
          color: '#333',
          backgroundColor: '#f5f5f5',
        }}
      />
    )
  }

  let dropdownContent: React.ReactNode = null

  if (isSearching) {
    dropdownContent = (
      <div
        style={{
          padding: '10px 12px',
          color: '#666',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Spinner size={16} />
        <span>{searchingText}</span>
      </div>
    )
  } else if (trimmedQuery && !hasEnoughChars) {
    dropdownContent = (
      <div style={{ padding: '10px 12px', color: '#666', fontSize: '0.9rem' }}>
        {minCharsText}
      </div>
    )
  } else if (displayedItems.length > 0) {
    dropdownContent = displayedItems.map((item, index) => {
      const label = getLabel(item)
      const isSelected = item.id === value
      const isHighlighted = index === highlightedIndex

      return (
        <button
          key={item.id}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleSelect(item)}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            textAlign: 'left',
            padding: '10px 12px',
            border: 'none',
            backgroundColor: isHighlighted ? '#eaf3ff' : '#fff',
            cursor: 'pointer',
            borderBottom:
              index < displayedItems.length - 1
                ? '1px solid #f0f0f0'
                : 'none',
            fontSize: '0.94rem',
            minHeight: 42,
          }}
        >
          <span>
            {shouldUseSearchMode ? highlightMatch(label, trimmedQuery) : label}
          </span>
          {isSelected ? (
            <span style={{ color: '#006039', fontWeight: 700 }}>✓</span>
          ) : null}
        </button>
      )
    })
  } else {
    dropdownContent = (
      <div style={{ padding: '10px 12px', color: '#666', fontSize: '0.9rem' }}>
        {noResultsText}
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            ref={inputRef}
            type="text"
            value={safeQuery}
            onChange={(e) => {
              setQuery?.(e.target.value)
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={selectedLabel || placeholder}
            style={{
              ...editInputStyle,
              paddingRight: 60,
              backgroundColor:
                !safeQuery && selectedLabel ? '#f7fff9' : '#ffffff',
              borderColor: !safeQuery && selectedLabel ? '#7ab893' : '#ccc',
            }}
          />

          <div
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {isSearching ? <Spinner size={14} /> : null}

            {!!safeQuery && (
              <button
                type="button"
                onClick={() => {
                  setQuery?.('')
                  inputRef.current?.focus()
                  setIsOpen(true)
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: '#666',
                  fontSize: 16,
                  lineHeight: 1,
                  padding: 0,
                }}
                title="Clear search"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid #b9b9b9',
              backgroundColor: '#fff',
              cursor: 'pointer',
              fontSize: '0.9rem',
              whiteSpace: 'nowrap',
              minHeight: 40,
            }}
            title="Clear selection"
          >
            Clear
          </button>
        ) : null}
      </div>

      {value && selectedLabel ? (
        <div
          style={{
            marginTop: 4,
            fontSize: 11,
            color: '#555',
          }}
        >
          Selected: {selectedLabel}
        </div>
      ) : null}

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 40,
            backgroundColor: '#fff',
            border: '1px solid #cfcfcf',
            borderRadius: 6,
            boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {dropdownContent}
        </div>
      )}
    </div>
  )
}

/* ======================
 * Composant racine
 * ====================== */

export function ArtworkSection<T extends ArtworkBase>({
  artwork,
  isEditing,
  setArtwork,
  addProposal,
  removeProposal,
}: Props<T>) {
  const setArtworkWithRelations: React.Dispatch<
    React.SetStateAction<ArtworkWithRelations>
  > | null = hasPersistentId(artwork)
    ? (updater) => {
        setArtwork(updater as React.SetStateAction<T>)
      }
    : null

  return (
    <section
      style={{
        marginBottom: 30,
        padding: 0,
        borderRadius: 6,
        color: 'black',
      }}
    >
      {isEditing && hasPersistentId(artwork) && setArtworkWithRelations ? (
        <ArtworkEdit
          artwork={artwork}
          setArtwork={setArtworkWithRelations}
          isEditing={isEditing}
          addProposal={addProposal}
          removeProposal={removeProposal}
        />
      ) : hasPersistentId(artwork) ? (
        <ArtworkView artwork={artwork} />
      ) : null}
    </section>
  )
}

/* =========================================================
 * VIEW
 * ========================================================= */

function ArtworkView({ artwork }: { artwork: ArtworkWithRelations }) {
  const artistName = artwork.artist
    ? [artwork.artist.first_name, artwork.artist.last_name]
        .filter(Boolean)
        .join(' ')
    : '—'

  return (
    <>
      <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{artistName}</div>

      <div style={{ fontStyle: 'italic', marginTop: 2 }}>
        {artwork.title || '—'}
        {artwork.year_execution && `, ${artwork.year_execution}`}
      </div>

      <div style={{ marginTop: 6 }}>{artwork.medium || '—'}</div>

      <div style={{ marginTop: 6 }}>{artwork.signature || '—'}</div>

      <div style={{ marginTop: 4 }}>
        {artwork.height_cm && artwork.width_cm
          ? `${artwork.height_cm} × ${artwork.width_cm}${
              artwork.depth_cm ? ` × ${artwork.depth_cm}` : ''
            } cm`
          : '—'}
      </div>

      <Divider />

      <InfoRow label="Location" contact={artwork.location} />

      <InfoRow
        label="Viewed on"
        value={
          artwork.view_date
            ? new Date(artwork.view_date).toLocaleDateString('fr-CH')
            : '—'
        }
      />

      <InfoRow label="Condition" value={artwork.condition || '—'} />

      <InfoRow label="Certificate" value={artwork.certificate ? 'Yes' : 'No'} />

      {artwork.certificate && (
        <InfoRow
          label="Certificate location"
          contact={artwork.certificateLocation}
        />
      )}
    </>
  )
}

/* =========================================================
 * EDIT
 * ========================================================= */

function ArtworkEdit({
  artwork,
  setArtwork,
  isEditing,
  addProposal,
  removeProposal,
}: {
  artwork: ArtworkWithRelations
  setArtwork: React.Dispatch<React.SetStateAction<ArtworkWithRelations>>
  isEditing: boolean
  addProposal?: (contactId: string, date?: string | null) => Promise<void>
  removeProposal?: (proposalId: string) => Promise<void>
}) {
  const [contactOptions, setContactOptions] = useState<Contact[]>([])
  const [artistOptions, setArtistOptions] = useState<Artist[]>([])

  // Queries
  const [artistQuery, setArtistQuery] = useState('')

  const [proposedByQuery, setProposedByQuery] = useState('')
  const [locationQuery, setLocationQuery] = useState('')
  const [certificateLocationQuery, setCertificateLocationQuery] = useState('')
  const [auctionHouseQuery, setAuctionHouseQuery] = useState('')
  const [buyerQuery, setBuyerQuery] = useState('')
  const [destinationQuery, setDestinationQuery] = useState('')

  const [proposalQuery, setProposalQuery] = useState('')
  
const [newProposedAt, setNewProposedAt] = useState(
  new Date().toISOString().slice(0, 10)
)

  const [newProposalContactId, setNewProposalContactId] = useState('')

  // Search hooks
  const { results: artistResults, loading: artistLoading } =
    useDebouncedArtistSearch(artistQuery)

  const { results: proposedByResults, loading: proposedByLoading } =
    useDebouncedContactSearch(proposedByQuery)

  const { results: locationResults, loading: locationLoading } =
    useDebouncedContactSearch(locationQuery)

  const {
    results: certificateLocationResults,
    loading: certificateLocationLoading,
  } = useDebouncedContactSearch(certificateLocationQuery)

  const { results: auctionHouseResults, loading: auctionHouseLoading } =
    useDebouncedContactSearch(auctionHouseQuery)

  const { results: buyerResults, loading: buyerLoading } =
    useDebouncedContactSearch(buyerQuery)

  const { results: destinationResults, loading: destinationLoading } =
    useDebouncedContactSearch(destinationQuery)

  const { results: proposalResults, loading: proposalLoading } =
    useDebouncedContactSearch(proposalQuery)

  useEffect(() => {
    const loadContacts = async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, company_name, first_name, last_name')
        .order('company_name', { ascending: true })
        .limit(200)

      if (!error) {
        setContactOptions((data as Contact[]) ?? [])
      }
    }

    loadContacts()
  }, [])

  useEffect(() => {
    const loadArtists = async () => {
      const { data, error } = await supabase
        .from('artists')
        .select('id, first_name, last_name')
        .order('last_name', { ascending: true })
        .limit(200)

      if (!error) {
        setArtistOptions((data as Artist[]) ?? [])
      }
    }

    loadArtists()
  }, [])

  useEffect(() => {
    if (artistResults.length > 0) {
      setArtistOptions((current) => mergeUniqueArtists(current, artistResults))
    }
  }, [artistResults])

  useEffect(() => {
    const merged = [
      ...proposedByResults,
      ...locationResults,
      ...certificateLocationResults,
      ...auctionHouseResults,
      ...buyerResults,
      ...destinationResults,
      ...proposalResults,
    ]

    if (merged.length > 0) {
      setContactOptions((current) => mergeUniqueContacts(current, merged))
    }
  }, [
    proposedByResults,
    locationResults,
    certificateLocationResults,
    auctionHouseResults,
    buyerResults,
    destinationResults,
    proposalResults,
  ])


useEffect(() => {
  // ✅ injecter systématiquement l’artiste courant
  const currentArtist =
    isArtistLike(artwork.artist)
      ? {
          id: artwork.artist.id,
          first_name: artwork.artist.first_name ?? '',
          last_name: artwork.artist.last_name ?? '',
        }
      : artwork.artist_id
      ? {
          id: artwork.artist_id,
          first_name: '',
          last_name: '',
        }
      : null

  if (currentArtist?.id) {
    setArtistOptions((current) =>
      mergeUniqueArtists(current, [currentArtist])
    )
  }

  // ✅ injecter les contacts déjà liés
  const currentContacts: Contact[] = [
    artwork.proposedBy,
    artwork.location,
    artwork.certificateLocation,
    artwork.buyer,
    artwork.destination,
    artwork.auction_house ?? null,
  ].filter(isContactLike)

  if (currentContacts.length > 0) {
    setContactOptions((current) =>
      mergeUniqueContacts(current, currentContacts)
    )
  }
}, [
  artwork.artist,
  artwork.artist_id,
  artwork.proposedBy,
  artwork.location,
  artwork.certificateLocation,
  artwork.buyer,
  artwork.destination,
  artwork.auction_house,
])


useEffect(() => {
  if (
    artwork.auctions &&
    !artwork.auction_contact_id &&
    artwork.proposed_by_id &&
    artwork.proposedBy
  ) {
    setArtwork((prev) => ({
      ...prev,
      auction_contact_id: prev.auction_contact_id ?? artwork.proposed_by_id,
      auction_house: prev.auction_house ?? artwork.proposedBy,
    }))
  }
}, [
  artwork.auctions,
  artwork.auction_contact_id,
  artwork.proposed_by_id,
  artwork.proposedBy,
  setArtwork,
])


async function handleAddProposal() {
  if (!newProposalContactId) return

  const proposedAt = newProposedAt || new Date().toISOString().slice(0, 10)

  await addProposal?.(newProposalContactId, proposedAt)

  setNewProposalContactId('')
  setProposalQuery('')
  setNewProposedAt(new Date().toISOString().slice(0, 10))
}


  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 30,
      }}
    >
      {/* ===================== */}
      {/* Proposal */}
      {/* ===================== */}
      <SectionBlock>
        <h3
          style={{
            textAlign: 'center',
            fontSize: '1.3rem',
          }}
        >
          Proposal
        </h3>

        <EditRow label="Date proposed">
          <input
            type="date"
            value={artwork.date_proposition ?? ''}
            onChange={(e) =>
              setArtwork({
                ...artwork,
                date_proposition: e.target.value || null,
              })
            }
            style={{ ...editInputStyle, width: 160 }}
            disabled={!isEditing}
          />
        </EditRow>

        <EditRow label="Proposed by">
          <AutocompleteSelect<Contact>
            value={artwork.proposed_by_id ?? ''}
            onChange={(value) => {
              const selected =
                proposedByResults.find((c) => c.id === value) ||
                contactOptions.find((c) => c.id === value) ||
                null

              setArtwork({
                ...artwork,
                proposed_by_id: value || null,
                proposedBy: selected,
              })
            }}
            query={proposedByQuery}
            setQuery={setProposedByQuery}
            results={proposedByResults}
            options={contactOptions}
            getLabel={contactLabel}
            placeholder="Search contact"
            disabled={!isEditing}
            isEditing={isEditing}
            loading={proposedByLoading}
            noResultsText="No contact found"
          />
        </EditRow>

        <EditRow label="Proposed to">
          <div>
            {isEditing && !artwork.id && (
              <span
                style={{
                  color: '#777',
                  fontStyle: 'italic',
                  display: 'block',
                  marginBottom: 8,
                }}
              >
                Save the artwork before adding proposals
              </span>
            )}

            {isEditing && artwork.id && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="date"
                    value={newProposedAt}
                    onChange={(e) => setNewProposedAt(e.target.value)}
                    style={{
                      ...editInputStyle,
                      width: 160,
                    }}
                  />

                  <div style={{ flex: 1 }}>
                    <AutocompleteSelect<Contact>
                      value={newProposalContactId}
                      onChange={(value) => setNewProposalContactId(value)}
                      query={proposalQuery}
                      setQuery={setProposalQuery}
                      results={proposalResults}
                      options={contactOptions}
                      getLabel={contactLabel}
                      placeholder="Search contact to add"
                      disabled={!isEditing}
                      isEditing={isEditing}
                      loading={proposalLoading}
                      noResultsText="No contact found"
                    />
                  </div>

                  <button
                    type="button"
                    className="edit-button"
                    onClick={handleAddProposal}
                    disabled={!newProposalContactId}
                  >
                    Add
                  </button>
                </div>
              </div>
            )}

            {Array.isArray(artwork.artwork_proposals) &&
            artwork.artwork_proposals.length > 0 ? (
              artwork.artwork_proposals.map((p: ArtworkProposal) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'baseline',
                    marginBottom: 6,
                    border: '1px solid #3a3939',
                    borderRadius: 4,
                    padding: '6px 8px',
                    backgroundColor: '#f8f8f8',
                  }}
                >
                  <span>{contactLabel(p.contact)}</span>

                  {p.proposed_at && (
                    <span style={{ fontSize: 12 }}>
                      ({new Date(p.proposed_at).toLocaleDateString('fr-CH')})
                    </span>
                  )}

                  {isEditing && (
                    <button
                      type="button"
                      onClick={() => removeProposal?.(p.id)}
                      style={{
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        color: '#e21111',
                      }}
                    >
                      [delete]
                    </button>
                  )}
                </div>
              ))
            ) : (
              <span style={{ color: '#777', fontStyle: 'italic' }}>
                Not proposed yet
              </span>
            )}
          </div>
        </EditRow>
      </SectionBlock>

      {/* ===================== */}
      {/* Artwork detail */}
      {/* ===================== */}
      <SectionBlock>
        <h3
          style={{
            textAlign: 'center',
            fontSize: '1.3rem',
          }}
        >
          Artwork detail
        </h3>


<EditRow label="Artist">
  <AutocompleteSelect<Artist>
    value={artwork.artist_id ?? ''}
    onChange={(value) => {
      const selected =
        artistResults.find((a) => a.id === value) ||
        artistOptions.find((a) => a.id === value) ||
        null

      setArtwork({
        ...artwork,
        artist_id: value || null,
        artist: selected
          ? {
              id: selected.id,
              first_name: selected.first_name ?? '',
              last_name: selected.last_name ?? '',
            }
          : null,
      })
    }}
    query={artistQuery}
    setQuery={setArtistQuery}
    results={artistResults}
    options={
      artwork.artist_id &&
      artwork.artist &&
      !artistOptions.some((a) => a.id === artwork.artist_id)
        ? [
            {
              id: artwork.artist.id,
              first_name: artwork.artist.first_name ?? '',
              last_name: artwork.artist.last_name ?? '',
            },
            ...artistOptions,
          ]
        : artistOptions
    }
    getLabel={artistLabel}
    placeholder={
      artwork.artist
        ? artistLabel({
            id: artwork.artist.id,
            first_name: artwork.artist.first_name ?? '',
            last_name: artwork.artist.last_name ?? '',
          })
        : 'Search artist'
    }
    disabled={!isEditing}
    isEditing={isEditing}
    loading={artistLoading}
    noResultsText="No artist found"
  />
</EditRow>


        <EditRow label="Title">
          <input
            type="text"
            value={artwork.title ?? ''}
            onChange={(e) =>
              setArtwork({ ...artwork, title: e.target.value })
            }
            style={editInputStyle}
            disabled={!isEditing}
          />
        </EditRow>

        <EditRow label="Year">
          <input
            type="number"
            value={artwork.year_execution ?? ''}
            onChange={(e) =>
              setArtwork({
                ...artwork,
                year_execution:
                  e.target.value === '' ? null : Number(e.target.value),
              })
            }
            style={{ ...editInputStyle, width: 120 }}
            disabled={!isEditing}
          />
        </EditRow>

        <EditRow label="Medium">
          <input
            type="text"
            value={artwork.medium ?? ''}
            onChange={(e) =>
              setArtwork({
                ...artwork,
                medium: e.target.value || null,
              })
            }
            style={editInputStyle}
            disabled={!isEditing}
          />
        </EditRow>

        <EditRow label="Signature">
          <input
            type="text"
            value={artwork.signature ?? ''}
            onChange={(e) =>
              setArtwork({
                ...artwork,
                signature: e.target.value || null,
              })
            }
            style={editInputStyle}
            disabled={!isEditing}
          />
        </EditRow>

        <EditRow label="Dimensions (cm)">
          <div style={{ display: 'flex', gap: 8 }}>
            <DimensionInput
              placeholder="H"
              value={artwork.height_cm}
              onChange={(v) => setArtwork({ ...artwork, height_cm: v })}
            />
            <DimensionInput
              placeholder="W"
              value={artwork.width_cm}
              onChange={(v) => setArtwork({ ...artwork, width_cm: v })}
            />
            <DimensionInput
              placeholder="D"
              value={artwork.depth_cm}
              onChange={(v) => setArtwork({ ...artwork, depth_cm: v })}
            />
          </div>
        </EditRow>

        <Divider />

        <EditRow label="Location">
          <AutocompleteSelect<Contact>
            value={artwork.location_contact_id ?? ''}
            onChange={(value) => {
              const selected =
                locationResults.find((c) => c.id === value) ||
                contactOptions.find((c) => c.id === value) ||
                null

              setArtwork({
                ...artwork,
                location_contact_id: value || null,
                location: selected,
              })
            }}
            query={locationQuery}
            setQuery={setLocationQuery}
            results={locationResults}
            options={contactOptions}
            getLabel={contactLabel}
            placeholder="Search location"
            disabled={!isEditing}
            isEditing={isEditing}
            loading={locationLoading}
            noResultsText="No location found"
          />
        </EditRow>

        <EditRow label="View date">
          <input
            type="date"
            value={artwork.view_date ?? ''}
            onChange={(e) =>
              setArtwork({
                ...artwork,
                view_date: e.target.value || null,
              })
            }
            style={{ ...editInputStyle, width: 160 }}
            disabled={!isEditing}
          />
        </EditRow>

        <EditRow label="Condition">
          <input
            value={artwork.condition ?? ''}
            onChange={(e) =>
              setArtwork({
                ...artwork,
                condition: e.target.value || null,
              })
            }
            style={editInputStyle}
            disabled={!isEditing}
          />
        </EditRow>

        <EditRow label="Certificate">
          <select
            value={artwork.certificate ? 'yes' : 'no'}
            onChange={(e) =>
              setArtwork({
                ...artwork,
                certificate: e.target.value === 'yes',
              })
            }
            style={{ ...editInputStyle, width: 90 }}
            disabled={!isEditing}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </EditRow>

        {artwork.certificate && (
          <EditRow label="Certificate location">
            <AutocompleteSelect<Contact>
              value={artwork.certificate_location_contact_id ?? ''}
              onChange={(value) => {
                const selected =
                  certificateLocationResults.find((c) => c.id === value) ||
                  contactOptions.find((c) => c.id === value) ||
                  null

                setArtwork({
                  ...artwork,
                  certificate_location_contact_id: value || null,
                  certificateLocation: selected,
                })
              }}
              query={certificateLocationQuery}
              setQuery={setCertificateLocationQuery}
              results={certificateLocationResults}
              options={contactOptions}
              getLabel={contactLabel}
              placeholder="Search certificate location"
              disabled={!isEditing}
              isEditing={isEditing}
              loading={certificateLocationLoading}
              noResultsText="No certificate location found"
            />
          </EditRow>
        )}

        <EditRow label="Priority">
          <select
            value={artwork.priority ?? ''}
            onChange={(e) =>
              setArtwork({
                ...artwork,
                priority: e.target.value as 'Information' | 'Medium' | 'High',
              })
            }
            style={{ ...editInputStyle, width: 120 }}
            disabled={!isEditing}
          >
            <option value="">—</option>
            <option value="Information">Information</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>
        </EditRow>

        <EditRow label="Status">
          <select
            value={artwork.status ?? ''}
            onChange={(e) =>
              setArtwork({
                ...artwork,
                status: e.target.value as
                  | 'Draft'
                  | 'Viewed'
                  | 'Negotiation'
                  | 'Bought'
                  | 'Archived',
              })
            }
            style={{ ...editInputStyle, width: 160 }}
            disabled={!isEditing}
          >
            <option value="">—</option>
            <option value="Draft">Draft</option>
            <option value="Viewed">Viewed</option>
            <option value="Negotiation">Negotiation</option>
            <option value="Bought">Bought</option>
            <option value="Archived">Archived</option>
          </select>
        </EditRow>
      </SectionBlock>

      {/* ===================== */}
      {/* Auction */}
      {/* ===================== */}
      <SectionBlock>
        <h3
          style={{
            textAlign: 'center',
            fontSize: '1.3rem',
          }}
        >
          Auction
        </h3>

        <EditRow label="Auction">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <select
              value={artwork.auctions ? 'yes' : 'no'}
              onChange={(e) =>
                setArtwork({
                  ...artwork,
                  auctions: e.target.value === 'yes',
                  auction_link:
                    e.target.value === 'yes' ? artwork.auction_link : null,
                })
              }
              style={{ ...editInputStyle, width: 90 }}
              disabled={!isEditing}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>

            {artwork.auctions &&
              (isEditing ? (
                <input
                  type="url"
                  placeholder="Auction link"
                  value={artwork.auction_link ?? ''}
                  onChange={(e) =>
                    setArtwork({
                      ...artwork,
                      auction_link: e.target.value || null,
                    })
                  }
                  style={{
                    ...editInputStyle,
                    flex: 1,
                  }}
                />
              ) : artwork.auction_link ? (
                <a
                  href={artwork.auction_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#007a5e',
                    textDecoration: 'underline',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 400,
                  }}
                  title={artwork.auction_link}
                >
                  {safeHostname(artwork.auction_link)}
                </a>
              ) : (
                <span style={{ color: '#999', fontStyle: 'italic' }}>
                  No link
                </span>
              ))}
          </div>
        </EditRow>

        {artwork.auctions && (
          <>

<EditRow label="Auction house">
  <AutocompleteSelect<Contact>
    value={artwork.auction_contact_id ?? artwork.proposed_by_id ?? ''}
    onChange={(value) => {
      const selected =
        auctionHouseResults.find((c) => c.id === value) ||
        contactOptions.find((c) => c.id === value) ||
        null

      setArtwork({
        ...artwork,
        auction_contact_id: value || null,
        auction_house: selected,
      })
    }}
    query={auctionHouseQuery}
    setQuery={setAuctionHouseQuery}
    results={auctionHouseResults}
    options={
      artwork.proposedBy &&
      !contactOptions.some((c) => c.id === artwork.proposedBy?.id)
        ? [artwork.proposedBy, ...contactOptions]
        : contactOptions
    }
    getLabel={contactLabel}
    placeholder={
      artwork.auction_house
        ? contactLabel(artwork.auction_house)
        : artwork.proposedBy
        ? contactLabel(artwork.proposedBy)
        : 'Search auction house'
    }
    disabled={!isEditing}
    isEditing={isEditing}
    loading={auctionHouseLoading}
    noResultsText="No auction house found"
  />
</EditRow>


            <EditRow label="Sale date">
              <input
                type="date"
                value={artwork.sale_date ?? ''}
                onChange={(e) =>
                  setArtwork({
                    ...artwork,
                    sale_date: e.target.value || null,
                  })
                }
                style={editInputStyle}
                disabled={!isEditing}
              />
            </EditRow>

            <EditRow label="Sale time">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="time"
                  value={artwork.sale_time ?? ''}
                  onChange={(e) =>
                    setArtwork({
                      ...artwork,
                      sale_time: e.target.value || null,
                    })
                  }
                  style={editInputStyle}
                  disabled={!isEditing}
                />
                <a
                  href="https://buyerspremium.blondeau.ch/auction_time.php"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#006039',
                    textDecoration: 'underline',
                    fontSize: '0.9rem',
                  }}
                >
                  Auction Time calculator
                </a>
              </div>
            </EditRow>

            <EditRow label="Lot#">
              <input
                type="text"
                value={artwork.lot ?? ''}
                onChange={(e) =>
                  setArtwork({
                    ...artwork,
                    lot: e.target.value || null,
                  })
                }
                style={editInputStyle}
                disabled={!isEditing}
              />
            </EditRow>

            <EditRow label="Auction currency">
              <select
                value={artwork.auction_currency ?? ''}
                onChange={(e) =>
                  setArtwork({
                    ...artwork,
                    auction_currency: e.target.value || null,
                  })
                }
                style={{ ...editInputStyle, width: 110 }}
                disabled={!isEditing}
              >
                <option value="">—</option>
                <option value="CHF">CHF</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="HKD">HKD</option>
              </select>
            </EditRow>

            <EditRow label="Estimate">
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="number"
                  placeholder="Low"
                  value={artwork.estimate_low ?? ''}
                  onChange={(e) =>
                    setArtwork({
                      ...artwork,
                      estimate_low:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  style={{ ...editInputStyle, width: 120 }}
                  disabled={!isEditing}
                />
                <input
                  type="number"
                  placeholder="High"
                  value={artwork.estimate_high ?? ''}
                  onChange={(e) =>
                    setArtwork({
                      ...artwork,
                      estimate_high:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  style={{ ...editInputStyle, width: 120 }}
                  disabled={!isEditing}
                />
              </div>
            </EditRow>

            <EditRow label="Suggestion Blondeau">
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="number"
                  placeholder="Hammer"
                  value={artwork.auction_max_hammer ?? ''}
                  onChange={(e) =>
                    setArtwork({
                      ...artwork,
                      auction_max_hammer:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  style={{ ...editInputStyle, width: 120 }}
                  disabled={!isEditing}
                />
                <input
                  type="number"
                  placeholder="Premium"
                  value={artwork.auction_max_premium ?? ''}
                  onChange={(e) =>
                    setArtwork({
                      ...artwork,
                      auction_max_premium:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  style={{ ...editInputStyle, width: 120 }}
                  disabled={!isEditing}
                />
              </div>
            </EditRow>

            <EditRow label="Guarantee">
              <select
                value={artwork.guarantee ? 'yes' : 'no'}
                onChange={(e) =>
                  setArtwork({
                    ...artwork,
                    guarantee: e.target.value === 'yes',
                  })
                }
                style={{ ...editInputStyle, width: 90 }}
                disabled={!isEditing}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </EditRow>

            <EditRow label="Result">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="number"
                  placeholder="Hammer"
                  value={artwork.sold_hammer ?? ''}
                  onChange={(e) =>
                    setArtwork({
                      ...artwork,
                      sold_hammer:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  style={{ ...editInputStyle, width: 120 }}
                  disabled={!isEditing}
                />
                <input
                  type="number"
                  placeholder="Premium"
                  value={artwork.sold_premium ?? ''}
                  onChange={(e) =>
                    setArtwork({
                      ...artwork,
                      sold_premium:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  style={{ ...editInputStyle, width: 120 }}
                  disabled={!isEditing}
                />
                <a
                  href="https://buyerspremium.blondeau.ch/calculate.php"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#006039',
                    textDecoration: 'underline',
                    fontSize: '0.9rem',
                  }}
                >
                  Buyer’s premium calculator
                </a>
              </div>
            </EditRow>

            <EditRow label="Underbidder">
              <select
                value={artwork.underbidder ? 'yes' : 'no'}
                onChange={(e) =>
                  setArtwork({
                    ...artwork,
                    underbidder: e.target.value === 'yes',
                  })
                }
                style={{ ...editInputStyle, width: 90 }}
                disabled={!isEditing}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </EditRow>
          </>
        )}
      </SectionBlock>

      {/* ===================== */}
      {/* Private Market */}
      {/* ===================== */}
      <SectionBlock>
        <h3
          style={{
            textAlign: 'center',
            fontSize: '1.3rem',
          }}
        >
          Private Market
        </h3>

        <EditRow label="Currency">
          <select
            value={artwork.currency || ''}
            onChange={(e) =>
              setArtwork({
                ...artwork,
                currency: e.target.value || null,
              })
            }
            style={{ ...editInputStyle, width: 100 }}
            disabled={!isEditing}
          >
            <option value="">—</option>
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </EditRow>

        <EditRow label="Asking price">
          <input
            type="number"
            value={artwork.asking_price ?? ''}
            onChange={(e) =>
              setArtwork({
                ...artwork,
                asking_price:
                  e.target.value === '' ? null : Number(e.target.value),
              })
            }
            style={{ ...editInputStyle, width: 160 }}
            disabled={!isEditing}
          />
        </EditRow>
      </SectionBlock>

      {/* ===================== */}
      {/* Acquisition */}
      {/* ===================== */}
      <SectionBlock>
        <h3
          style={{
            textAlign: 'center',
            fontSize: '1.3rem',
          }}
        >
          Acquisition
        </h3>

        <EditRow label="Acquired">
          <select
            value={artwork.date_acquisition ? 'yes' : 'no'}
            onChange={(e) =>
              setArtwork({
                ...artwork,
                date_acquisition:
                  e.target.value === 'yes'
                    ? artwork.date_acquisition ??
                      new Date().toISOString().slice(0, 10)
                    : null,
              })
            }
            style={{ ...editInputStyle, width: 90 }}
            disabled={!isEditing}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </EditRow>

        {artwork.date_acquisition && (
          <>
            <EditRow label="Date acquisition">
              <input
                type="date"
                value={artwork.date_acquisition ?? ''}
                onChange={(e) =>
                  setArtwork({
                    ...artwork,
                    date_acquisition: e.target.value || null,
                  })
                }
                style={editInputStyle}
                disabled={!isEditing}
              />
            </EditRow>

            <EditRow label="Buyer">
              <AutocompleteSelect<Contact>
                value={artwork.buyer_contact_id ?? ''}
                onChange={(value) => {
                  const selected =
                    buyerResults.find((c) => c.id === value) ||
                    contactOptions.find((c) => c.id === value) ||
                    null

                  setArtwork({
                    ...artwork,
                    buyer_contact_id: value || null,
                    buyer: selected,
                  })
                }}
                query={buyerQuery}
                setQuery={setBuyerQuery}
                results={buyerResults}
                options={contactOptions}
                getLabel={contactLabel}
                placeholder="Search buyer"
                disabled={!isEditing}
                isEditing={isEditing}
                loading={buyerLoading}
                noResultsText="No buyer found"
              />
            </EditRow>

            <EditRow label="Cost">
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={artwork.cost_currency || ''}
                  onChange={(e) =>
                    setArtwork({
                      ...artwork,
                      cost_currency: e.target.value || null,
                    })
                  }
                  style={{ ...editInputStyle, width: 90 }}
                  disabled={!isEditing}
                >
                  <option value="">—</option>
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Amount"
                  value={artwork.cost_amount ?? ''}
                  onChange={(e) =>
                    setArtwork({
                      ...artwork,
                      cost_amount:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  style={{ ...editInputStyle, width: 140 }}
                  disabled={!isEditing}
                />
              </div>
            </EditRow>

            <EditRow label="Commission Blondeau">
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={artwork.cost_currency || ''}
                  onChange={(e) =>
                    setArtwork({
                      ...artwork,
                      cost_currency: e.target.value || null,
                    })
                  }
                  style={{ ...editInputStyle, width: 90 }}
                  disabled={!isEditing}
                >
                  <option value="">—</option>
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Amount"
                  value={artwork.commission_blondeau ?? ''}
                  onChange={(e) =>
                    setArtwork({
                      ...artwork,
                      commission_blondeau:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  style={{ ...editInputStyle, width: 140 }}
                  disabled={!isEditing}
                />
              </div>
            </EditRow>

            <EditRow label="Insurance">
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={artwork.insurance_currency || ''}
                  onChange={(e) =>
                    setArtwork({
                      ...artwork,
                      insurance_currency: e.target.value || null,
                    })
                  }
                  style={{ ...editInputStyle, width: 90 }}
                  disabled={!isEditing}
                >
                  <option value="">—</option>
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Amount"
                  value={artwork.insurance_value ?? ''}
                  onChange={(e) =>
                    setArtwork({
                      ...artwork,
                      insurance_value:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  style={{ ...editInputStyle, width: 140 }}
                  disabled={!isEditing}
                />
              </div>
            </EditRow>

            <EditRow label="Destination">
              <AutocompleteSelect<Contact>
                value={artwork.destination_contact_id ?? ''}
                onChange={(value) => {
                  const selected =
                    destinationResults.find((c) => c.id === value) ||
                    contactOptions.find((c) => c.id === value) ||
                    null

                  setArtwork({
                    ...artwork,
                    destination_contact_id: value || null,
                    destination: selected,
                  })
                }}
                query={destinationQuery}
                setQuery={setDestinationQuery}
                results={destinationResults}
                options={contactOptions}
                getLabel={contactLabel}
                placeholder="Search destination"
                disabled={!isEditing}
                isEditing={isEditing}
                loading={destinationLoading}
                noResultsText="No destination found"
              />
            </EditRow>
          </>
        )}
      </SectionBlock>

      {/* ===================== */}
      {/* Notes */}
      {/* ===================== */}
      <SectionBlock>
        <h3
          style={{
            fontSize: '1.3rem',
          }}
        >
          Notes
        </h3>

        <EditRow label=" ">
          <textarea
            value={artwork.notes ?? ''}
            onChange={(e) =>
              setArtwork({
                ...artwork,
                notes: e.target.value,
              })
            }
            style={{
              width: '100%',
              minHeight: 120,
              padding: 8,
              fontSize: '0.95rem',
              border: '1px solid #ccc',
              borderRadius: 4,
              resize: 'vertical',
              backgroundColor: 'white',
              marginTop: '10px',
              boxSizing: 'border-box',
            }}
            disabled={!isEditing}
          />
        </EditRow>
      </SectionBlock>
    </div>
  )
}

