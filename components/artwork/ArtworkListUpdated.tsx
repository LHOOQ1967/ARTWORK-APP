
'use client'

import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ArtworkListItem } from '@/app/(protected)/types/artwork'

type UpdatedArtworkItem = ArtworkListItem & {
  updated_at?: string | null
  last_changed_at?: string | null
  changed_fields?: string[] | null
  changed_diff?: Record<string, { old: unknown; new: unknown }> | null

  proposed_by_id?: string | null
  proposed_by_name?: string | null
  proposed_by_label?: string | null

  title?: string | null
  status?: string | null
  priority?: string | null

  asking_price?: number | string | null
  currency?: string | null

  estimate_low?: number | string | null
  estimate_high?: number | string | null
  auction_currency?: string | null

  sold_premium?: number | string | null
  sold_premium_currency?: string | null

  cost_amount?: number | string | null
  cost_currency?: string | null

  images?: Array<{
    id?: string
    url?: string | null
    position?: number | null
  }> | null

  artist?: {
    id?: string
    first_name?: string | null
    last_name?: string | null
  } | null
}

type Props = {
  artworks: UpdatedArtworkItem[]
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  backgroundColor: '#f5f5f5',
  fontWeight: 600,
  fontSize: '0.85rem',
  borderBottom: '1px solid #ddd',
  verticalAlign: 'bottom',
}

const td: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid #eee',
  fontSize: '0.9rem',
  verticalAlign: 'top',
  overflow: 'hidden',
}

const cell3Lines: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  lineHeight: 1.2,
  minWidth: 0,
}

const mainLine: React.CSSProperties = {
  color: '#111',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const secondLine: React.CSSProperties = {
  color: '#666',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const thirdLine: React.CSSProperties = {
  color: '#006039',
  fontSize: '0.78rem',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const formatNumber = (n: number) =>
  new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 0 }).format(n)

function truncateText(s: string, max = 70) {
  const t = (s ?? '').toString()
  if (!t) return '—'
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

function toNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function formatDateTimeFrCH(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'

  return d.toLocaleString('fr-CH', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}


function getUpdatedMs(item: UpdatedArtworkItem): number {
  const value = item.last_changed_at ?? item.updated_at
  if (!value) return 0
  const d = new Date(value)
  return isNaN(d.getTime()) ? 0 : d.getTime()
}


function priorityRank(p?: string | null): number {
  const key = (p ?? '').toString().trim().toLowerCase()
  const order: Record<string, number> = {
    high: 4,
    medium: 3,
    low: 2,
    information: 1,
  }
  return order[key] ?? 0
}

function getArtistText(a: UpdatedArtworkItem): string {
  if (!a.artist || typeof a.artist !== 'object') return '—'
  return [a.artist.first_name, a.artist.last_name].filter(Boolean).join(' ') || '—'
}

function getProposedByText(a: UpdatedArtworkItem): string {
  const s =
    (a.proposed_by_label ?? '').toString().trim() ||
    (a.proposed_by_name ?? '').toString().trim()
  return s || '—'
}

function getChangedFieldsText(a: UpdatedArtworkItem): string {
  const fields = Array.isArray(a.changed_fields) ? a.changed_fields.filter(Boolean) : []
  if (!fields.length) return 'Changed: —'
  return `Changed: ${fields.join(', ')}`
}

function getPriceNumberForSort(a: UpdatedArtworkItem): number {
  const candidates = [
    toNullableNumber(a.cost_amount),
    toNullableNumber(a.sold_premium),
    toNullableNumber(a.estimate_high),
    toNullableNumber(a.estimate_low),
    toNullableNumber(a.asking_price),
  ]

  const found = candidates.find((n): n is number => n !== null)
  return found ?? 0
}

function getBestPriceText(a: UpdatedArtworkItem): string {
  const cost = toNullableNumber(a.cost_amount)
  if (cost !== null) {
    return `${a.cost_currency ?? ''} ${formatNumber(cost)}`.trim()
  }

  const sold = toNullableNumber(a.sold_premium)
  if (sold !== null) {
    return `${a.sold_premium_currency ?? a.auction_currency ?? a.currency ?? ''} ${formatNumber(sold)}`.trim()
  }

  const low = toNullableNumber(a.estimate_low)
  const high = toNullableNumber(a.estimate_high)

  if (low !== null && high !== null) {
    return `${a.auction_currency ?? a.currency ?? ''} ${formatNumber(low)} – ${formatNumber(high)}`.trim()
  }

  if (low !== null) {
    return `${a.auction_currency ?? a.currency ?? ''} ${formatNumber(low)}`.trim()
  }

  const asking = toNullableNumber(a.asking_price)
  if (asking !== null) {
    return `${a.currency ?? ''} ${formatNumber(asking)}`.trim()
  }

  return '—'
}

export default function ArtworkListUpdated({ artworks }: Props) {
  const router = useRouter()

  const [sortKey, setSortKey] = useState<
    'updated_at' | 'artist' | 'title' | 'price' | 'priority' | 'status'
  >('updated_at')

  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [showAll, setShowAll] = useState(false)

  const PREVIEW_COUNT = 20

  function handleSort(columnKey: typeof sortKey) {
    if (sortKey === columnKey) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(columnKey)

    if (columnKey === 'updated_at') {
      setSortDirection('desc')
      return
    }

    if (columnKey === 'priority') {
      setSortDirection('desc')
      return
    }

    setSortDirection('asc')
  }

  const sortedArtworks = useMemo(() => {
    const compareNumbers = (x: number, y: number, dir: 'asc' | 'desc') => {
      if (x < y) return dir === 'asc' ? -1 : 1
      if (x > y) return dir === 'asc' ? 1 : -1
      return 0
    }

    const compareStrings = (x: unknown, y: unknown, dir: 'asc' | 'desc') => {
      const sx = (x ?? '').toString()
      const sy = (y ?? '').toString()
      const cmp = sx.localeCompare(sy, 'fr-CH', { sensitivity: 'base' })
      return dir === 'asc' ? cmp : -cmp
    }

    return [...artworks].sort((a, b) => {
      let primaryCmp = 0

      switch (sortKey) {
        case 'updated_at':
          primaryCmp = compareNumbers(getUpdatedMs(a), getUpdatedMs(b), sortDirection)
          break

        case 'artist':
          primaryCmp = compareStrings(getArtistText(a), getArtistText(b), sortDirection)
          break

        case 'title':
          primaryCmp = compareStrings(a.title ?? '', b.title ?? '', sortDirection)
          break

        case 'price':
          primaryCmp = compareNumbers(
            getPriceNumberForSort(a),
            getPriceNumberForSort(b),
            sortDirection
          )
          break

        case 'priority':
          primaryCmp = compareNumbers(
            priorityRank(a.priority),
            priorityRank(b.priority),
            sortDirection
          )
          break

        case 'status':
          primaryCmp = compareStrings(a.status ?? '', b.status ?? '', sortDirection)
          break
      }

      if (primaryCmp !== 0) return primaryCmp

      // Tie-breaker stable = updated_at DESC
      const updatedCmp = compareNumbers(getUpdatedMs(a), getUpdatedMs(b), 'desc')
      if (updatedCmp !== 0) return updatedCmp

      return (a.id ?? '').toString().localeCompare((b.id ?? '').toString())
    })
  }, [artworks, sortKey, sortDirection])

  const displayedArtworks = showAll
    ? sortedArtworks
    : sortedArtworks.slice(0, PREVIEW_COUNT)

  function getHeaderArrow(key: typeof sortKey) {
    if (sortKey !== key) return ''
    return sortDirection === 'asc' ? ' ▲' : ' ▼'
  }

  return (
    <div style={{ backgroundColor: 'white', borderRadius: 6, overflow: 'hidden' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          backgroundColor: 'white',
          tableLayout: 'fixed',
        }}
      >
        <thead>
          <tr>
            <th style={{ ...th, width: 80 }}>Image</th>

            <th
              style={{
                ...th,
                cursor: 'pointer',
                userSelect: 'none',
                backgroundColor: sortKey === 'updated_at' ? '#eee' : '#f5f5f5',
                width: 180,
              }}
              onClick={() => handleSort('updated_at')}
              title="Sort by updated date"
            >
              Updated{getHeaderArrow('updated_at')}
              <div style={{ fontWeight: 500, color: '#666', marginTop: 4 }}>
                Proposed by / Changed fields
              </div>
            </th>

            <th style={{ ...th, width: 180 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span
                  style={{
                    cursor: 'pointer',
                    userSelect: 'none',
                    backgroundColor: sortKey === 'artist' ? '#eee' : 'transparent',
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}
                  onClick={() => handleSort('artist')}
                  title="Sort by artist"
                >
                  Artist{getHeaderArrow('artist')}
                </span>

                <span
                  style={{
                    cursor: 'pointer',
                    userSelect: 'none',
                    backgroundColor: sortKey === 'title' ? '#eee' : 'transparent',
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}
                  onClick={() => handleSort('title')}
                  title="Sort by title"
                >
                  Title{getHeaderArrow('title')}
                </span>
              </div>
            </th>

            <th
              style={{
                ...th,
                userSelect: 'none',
                width: 180,
                textAlign: 'right',
              }}
            >
              <div
                style={{
                  cursor: 'pointer',
                  backgroundColor: sortKey === 'price' ? '#eee' : 'transparent',
                  padding: '2px 6px',
                  borderRadius: 4,
                  display: 'inline-block',
                }}
                onClick={() => handleSort('price')}
                title="Sort by price"
              >
                Price{getHeaderArrow('price')}
              </div>

              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: '#666',
                  marginTop: 4,
                  textAlign: 'right',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    cursor: 'pointer',
                    backgroundColor: sortKey === 'priority' ? '#eee' : 'transparent',
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}
                  onClick={e => {
                    e.stopPropagation()
                    handleSort('priority')
                  }}
                  title="Sort by priority"
                >
                  Priority{getHeaderArrow('priority')}
                </span>

                <span style={{ opacity: 0.6 }}>/</span>

                <span
                  style={{
                    cursor: 'pointer',
                    backgroundColor: sortKey === 'status' ? '#eee' : 'transparent',
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}
                  onClick={e => {
                    e.stopPropagation()
                    handleSort('status')
                  }}
                  title="Sort by status"
                >
                  Status{getHeaderArrow('status')}
                </span>
              </div>
            </th>
          </tr>
        </thead>

        <tbody>
          {displayedArtworks.map(a => {
            const updatedText = formatDateTimeFrCH(a.last_changed_at ?? a.updated_at)
            const proposedByText = getProposedByText(a)
            const changedFieldsText = getChangedFieldsText(a)

            const artistText = getArtistText(a)
            const titleRaw =
              typeof a.title === 'string' && a.title.trim() !== '' ? a.title : '—'
            const titleText = truncateText(titleRaw, 60)

            const priceMain = getBestPriceText(a)
            const prStatus = `${a.priority ?? '—'} • ${a.status ?? '—'}`

            return (
              <tr
                key={a.id}
                onClick={() => router.push(`/artworks/print/${a.id}`)}
                style={{ cursor: 'pointer', transition: 'background-color 0.15s' }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = '#f5f5f5'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = 'white'
                }}
              >
                <td style={{ ...td, width: 80 }}>
                  {(() => {
                    const images = Array.isArray(a.images) ? a.images : []
                    return images.length > 0 && images[0]?.url ? (
                      <img
                        src={images[0].url ?? ''}
                        alt=""
                        style={{
                          width: 60,
                          height: 60,
                          objectFit: 'cover',
                          borderRadius: 4,
                          display: 'block',
                        }}
                        loading="lazy"
                      />
                    ) : (
                      <div
                        style={{
                          width: 60,
                          height: 60,
                          backgroundColor: '#eee',
                          borderRadius: 4,
                        }}
                      />
                    )
                  })()}
                </td>

                <td style={{ ...td, width: 180 }}>
                  <div style={cell3Lines}>
                    <div style={mainLine} title={updatedText}>
                      {updatedText}
                    </div>

                    <div style={secondLine} title={proposedByText}>
                      {truncateText(proposedByText, 28)}
                    </div>

                    <div style={thirdLine} title={changedFieldsText}>
                      {truncateText(changedFieldsText, 42)}
                    </div>
                  </div>
                </td>

                <td style={{ ...td, width: 180 }}>
                  <div style={cell3Lines}>
                    <div style={mainLine} title={artistText}>
                      {truncateText(artistText, 28)}
                    </div>

                    <div style={secondLine} title={titleRaw}>
                      {titleText}
                    </div>
                  </div>
                </td>

                <td style={{ ...td, width: 180, textAlign: 'right' }}>
                  <div style={{ ...cell3Lines, alignItems: 'flex-end' }}>
                    <div style={mainLine} title={priceMain}>
                      {priceMain}
                    </div>

                    <div style={secondLine} title={prStatus}>
                      {prStatus}
                    </div>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {artworks.length > PREVIEW_COUNT && (
        <div
          style={{
            padding: '10px 12px',
            borderTop: '1px solid #eee',
            fontSize: '0.85rem',
            textAlign: 'right',
            backgroundColor: '#e6e5e5',
          }}
        >
          <button
            onClick={() => setShowAll(v => !v)}
            style={{
              display: 'block',
              margin: '0 auto',
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'black',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {showAll ? 'Voir moins' : `Voir les ${artworks.length} artworks`}
          </button>
        </div>
      )}
    </div>
  )
}
