
'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import type { ArtworkForm, Artist, Contact } from '@/app/(protected)/types/artwork'

type Props = {
  artwork: ArtworkForm
  setArtwork: Dispatch<SetStateAction<ArtworkForm>>
  isEditing: boolean

  // Artist
  artistQuery?: string
  setArtistQuery?: Dispatch<SetStateAction<string>>
  artistResults?: Artist[]
  artistOptions?: Artist[]
  artistLoading?: boolean

  // Shared contacts base list
  contactOptions?: Contact[]

  // Proposed by
  proposedByQuery?: string
  setProposedByQuery?: Dispatch<SetStateAction<string>>
  proposedByResults?: Contact[]
  proposedByLoading?: boolean

  // Location
  locationQuery?: string
  setLocationQuery?: Dispatch<SetStateAction<string>>
  locationResults?: Contact[]
  locationLoading?: boolean

  // Certificate location
  certificateLocationQuery?: string
  setCertificateLocationQuery?: Dispatch<SetStateAction<string>>
  certificateLocationResults?: Contact[]
  certificateLocationLoading?: boolean

  // Auction house
  auctionHouseQuery?: string
  setAuctionHouseQuery?: Dispatch<SetStateAction<string>>
  auctionHouseResults?: Contact[]
  auctionHouseLoading?: boolean

  // Buyer
  buyerQuery?: string
  setBuyerQuery?: Dispatch<SetStateAction<string>>
  buyerResults?: Contact[]
  buyerLoading?: boolean

  // Destination
  destinationQuery?: string
  setDestinationQuery?: Dispatch<SetStateAction<string>>
  destinationResults?: Contact[]
  destinationLoading?: boolean
}

const CURRENCY_OPTIONS = ['CHF', 'EUR', 'USD', 'GBP', 'HKD'] as const

const editInputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #ccc',
  borderRadius: 6,
  fontSize: '0.95rem',
  backgroundColor: 'white',
  boxSizing: 'border-box',
}

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

function SectionBlock({ children }: { children: ReactNode }) {
  return (
    <section
      style={{
        backgroundColor: '#e6e5e5',
        color: '#000000',
        borderRadius: 8,
        padding: 24,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}
    >
      {children}
    </section>
  )
}

function EditRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

function DimensionInput({
  placeholder,
  value,
  onChange,
  disabled,
}: {
  placeholder: string
  value: number | null | undefined
  onChange: (v: number | null) => void
  disabled?: boolean
}) {
  return (
    <input
      type="number"
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) =>
        onChange(e.target.value ? Number(e.target.value) : null)
      }
      disabled={disabled}
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
  setQuery?: Dispatch<SetStateAction<string>>
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

  let dropdownContent: ReactNode = null

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

export function ArtworkFieldsLayout({
  artwork,
  setArtwork,
  isEditing,

  artistQuery,
  setArtistQuery,
  artistResults,
  artistOptions,
  artistLoading,

  contactOptions,

  proposedByQuery,
  setProposedByQuery,
  proposedByResults,
  proposedByLoading,

  locationQuery,
  setLocationQuery,
  locationResults,
  locationLoading,

  certificateLocationQuery,
  setCertificateLocationQuery,
  certificateLocationResults,
  certificateLocationLoading,

  auctionHouseQuery,
  setAuctionHouseQuery,
  auctionHouseResults,
  auctionHouseLoading,

  buyerQuery,
  setBuyerQuery,
  buyerResults,
  buyerLoading,

  destinationQuery,
  setDestinationQuery,
  destinationResults,
  destinationLoading,
}: Props) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 30,
        color: 'black',
        marginTop: '30px',
      }}
    >
      {/* Proposal */}
      <SectionBlock>
        <h3 style={{ textAlign: 'center', fontSize: '1.3rem' }}>
          Proposition by
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
            onChange={(value) =>
              setArtwork({
                ...artwork,
                proposed_by_id: value || null,
              })
            }
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
      </SectionBlock>

      {/* Artwork */}
      <SectionBlock>
        <h3 style={{ textAlign: 'center', fontSize: '1.3rem' }}>
          Artwork detail
        </h3>

        <EditRow label="Artist">
          <AutocompleteSelect<Artist>
            value={artwork.artist_id ?? ''}
            onChange={(value) =>
              setArtwork({
                ...artwork,
                artist_id: value || null,
              })
            }
            query={artistQuery}
            setQuery={setArtistQuery}
            results={artistResults}
            options={artistOptions}
            getLabel={artistLabel}
            placeholder="Search artist"
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
              disabled={!isEditing}
            />
            <DimensionInput
              placeholder="W"
              value={artwork.width_cm}
              onChange={(v) => setArtwork({ ...artwork, width_cm: v })}
              disabled={!isEditing}
            />
            <DimensionInput
              placeholder="D"
              value={artwork.depth_cm}
              onChange={(v) => setArtwork({ ...artwork, depth_cm: v })}
              disabled={!isEditing}
            />
          </div>
        </EditRow>
      </SectionBlock>

      {/* Location / condition / status */}
      <SectionBlock>
        <EditRow label="Location">
          <AutocompleteSelect<Contact>
            value={artwork.location_contact_id ?? ''}
            onChange={(value) =>
              setArtwork({
                ...artwork,
                location_contact_id: value || null,
              })
            }
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
          <EditRow label="Certificate Location">
            <AutocompleteSelect<Contact>
              value={artwork.certificate_location_contact_id ?? ''}
              onChange={(value) =>
                setArtwork({
                  ...artwork,
                  certificate_location_contact_id: value || null,
                })
              }
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

      {/* Auction */}
      <SectionBlock>
        <h3 style={{ textAlign: 'center', fontSize: '1.3rem' }}>Auction</h3>

        <EditRow label="Auction">
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
        </EditRow>

        {artwork.auctions && (
          <>
            <EditRow label="Auction link">
              <input
                type="url"
                value={artwork.auction_link ?? ''}
                onChange={(e) =>
                  setArtwork({
                    ...artwork,
                    auction_link: e.target.value || null,
                  })
                }
                style={editInputStyle}
                disabled={!isEditing}
              />
            </EditRow>

            <EditRow label="Auction House">
              <AutocompleteSelect<Contact>
                value={artwork.auction_contact_id ?? ''}
                onChange={(value) =>
                  setArtwork({
                    ...artwork,
                    auction_contact_id: value || null,
                  })
                }
                query={auctionHouseQuery}
                setQuery={setAuctionHouseQuery}
                results={auctionHouseResults}
                options={contactOptions}
                getLabel={contactLabel}
                placeholder="Search auction house"
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
            </EditRow>

            <EditRow label="Lot #">
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

            <EditRow label="Result">
              <div style={{ display: 'flex', gap: 8 }}>
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
          </>
        )}
      </SectionBlock>

      {/* Private Market */}
      <SectionBlock>
        <h3 style={{ textAlign: 'center', fontSize: '1.3rem' }}>
          Private Market
        </h3>

        <EditRow label="Currency">
          <select
            value={artwork.currency ?? ''}
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

      {/* Acquisition */}
      <SectionBlock>
        <h3 style={{ textAlign: 'center', fontSize: '1.3rem' }}>
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
            <EditRow label="Buyer">
              <AutocompleteSelect<Contact>
                value={artwork.buyer_contact_id ?? ''}
                onChange={(value) =>
                  setArtwork({
                    ...artwork,
                    buyer_contact_id: value || null,
                  })
                }
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

            <EditRow label="Destination">
              <AutocompleteSelect<Contact>
                value={artwork.destination_contact_id ?? ''}
                onChange={(value) =>
                  setArtwork({
                    ...artwork,
                    destination_contact_id: value || null,
                  })
                }
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

            <EditRow label="Cost">
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="number"
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
                <select
                  value={artwork.cost_currency ?? ''}
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
              </div>
            </EditRow>

            <EditRow label="Commission Blondeau">
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="number"
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
                <select
                  value={artwork.cost_currency ?? ''}
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
              </div>
            </EditRow>
          </>
        )}
      </SectionBlock>

      {/* Notes */}
      <SectionBlock>
        <h3 style={{ textAlign: 'center', fontSize: '1.3rem' }}>Notes</h3>

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
              marginTop: '10px',
              width: '100%',
              minHeight: 120,
              padding: 8,
              fontSize: '0.95rem',
              border: '1px solid #ccc',
              borderRadius: 4,
              resize: 'vertical',
              backgroundColor: 'white',
              boxSizing: 'border-box',
            }}
            disabled={!isEditing}
          />
        </EditRow>
      </SectionBlock>
    </div>
  )
}
