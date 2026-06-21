
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import type { ArtworkListItem } from '@/app/(protected)/types/artwork'
import { useRouter } from 'next/navigation'
import { useSessionProfile } from '@/contexts/SessionContext'

type ArtworkListProps = {
  artworks: ArtworkListItem[]
  mode?: 'market' | 'auction' | 'bought'
  /** active vs archived (utile surtout pour auctions: sold_premium + tri par défaut) */
  section?: 'active' | 'archived'
 
canEditStatusPriority?: boolean
  statusOptions?: string[]
  savingInlineKey?: string | null
  onUpdateArtworkField?: (
    artworkId: string,
    field: 'status' | 'priority',
    value: string | boolean | null
  ) => void

}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  backgroundColor: '#f5f5f5',
  fontWeight: 600,
  fontSize: '1.05rem',
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

const cell2Lines: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  lineHeight: 1.2,
  minWidth: 0,
}


const mainLine: React.CSSProperties = {
  color: '#111',
  fontSize: '1.1rem',      // ✅ AJOUT ICI
    lineHeight: 1.2,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const secondLine: React.CSSProperties = {
  color: '#111',
  fontSize: '1.05rem',     // ✅ AJOUT ICI
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}


const formatNumber = (n: number) =>
  new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 0 }).format(n)

const formatEstimate = (a: any) => {
  const low = a.estimate_low
  const high = a.estimate_high
  const cur = a.auction_currency || a.currency || ''

  if ((low == null || low === '') && (high == null || high === '')) {
    return cur ? `Estimate (${cur}): on request` : 'Estimate: on request'
  }

  if (low != null && low !== '' && (high == null || high === '')) {
    return cur ? `${cur} ≥ ${formatNumber(Number(low))}` : `Estimate: ≥ ${formatNumber(Number(low))}`
  }

  if (high != null && high !== '' && (low == null || low === '')) {
    return cur ? `${cur} ≤ ${formatNumber(Number(high))}` : `Estimate: ≤ ${formatNumber(Number(high))}`
  }

  return cur
    ? `${cur} ${formatNumber(Number(low))} – ${formatNumber(Number(high))}`
    : `${formatNumber(Number(low))} – ${formatNumber(Number(high))}`
}

const formatAsking = (a: any) => {
  const p = a.asking_price
  const cur = a.currency || ''
  if (p == null || p === '') return cur ? `Asking (${cur}): —` : 'Asking: —'
  return cur ? `${cur} ${formatNumber(Number(p))}` : `Asking: ${formatNumber(Number(p))}`
}

/** ✅ Sold premium (Auctions archived) */
const formatSoldPremium = (a: any) => {
  const p = a.sold_premium
  const cur = a.sold_premium_currency || a.auction_currency || a.currency || ''
  if (p == null || p === '') return cur ? `Sold (${cur}): —` : 'Sold: —'
  return cur ? `${cur} ${formatNumber(Number(p))}` : `Sold: ${formatNumber(Number(p))}`
}

function truncateText(s: string, max = 70) {
  const t = (s ?? '').toString()
  if (!t) return '—'
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

function getSaleDateTimeMs(a: any): number {
  if (!a?.sale_date) return 0
  const d = new Date(a.sale_date)
  if (isNaN(d.getTime())) return 0

  const t = (a?.sale_time ?? '').toString().trim()
  if (!t) return d.getTime()

  const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (m) {
    const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)))
    const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)))
    const ss = m[3] ? Math.min(59, Math.max(0, parseInt(m[3], 10))) : 0
    const dt = new Date(d)
    dt.setHours(hh, mm, ss, 0)
    return dt.getTime()
  }

  return d.getTime()
}

/** ✅ IMPORTANT : pour les auctions, ne pas dépendre de a.auctions (souvent absent des vues) */
function getDisplayDateValue(a: any, mode: 'market' | 'auction' | 'bought') {
  if (mode === 'auction') return a.sale_date
  if (mode === 'bought') return a.date_acquisition
  return a.date_proposition
}

function getDateSortMs(a: any, mode: 'market' | 'auction' | 'bought') {
  if (mode === 'auction') return getSaleDateTimeMs(a)
  if (mode === 'bought') return a?.date_acquisition ? new Date(a.date_acquisition).getTime() : 0
  return a?.date_proposition ? new Date(a.date_proposition).getTime() : 0
}

/** ✅ Priorité: ordre métier stable */
function priorityRank(p?: string | null): number {
  const key = (p ?? '').toString().trim().toLowerCase()
  const order: Record<string, number> = { high: 4, medium: 3, low: 2, information: 1 }
  return order[key] ?? 0
}

function formatDateFr2(d: any): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/** ✅ Proposed by : label calculé (proposed_by_label) ou venant de la view (proposed_by_name) */
function getProposedByText(a: any): string {
  const s =
    (a?.proposed_by_label ?? '').toString().trim() ||
    (a?.proposed_by_name ?? '').toString().trim()
  return s ? s : '—'
}


function getProposedToText(a: any): string {
  const proposals = Array.isArray(a?.proposals) ? a.proposals : []

  const labels = proposals
    .map((p: any) => (p?.contact_label ?? '').toString().trim())
    .filter(Boolean)

  return labels.join(', ')
}


/** ✅ 2e ligne de la colonne "Price/Priority" : "Priority • Status" */
function getPriorityStatusText(a: any): string {
  const pr = ((a?.priority ?? '—') as any).toString()
  const st = ((a?.status ?? '—') as any).toString()
  return `${pr} • ${st}`
}

/** ✅ Tri par défaut (selon tes règles) */
function getDefaultSort(mode: 'market' | 'auction' | 'bought', section: 'active' | 'archived') {
  // 1) Primary market active & archived => date proposed DESC
  if (mode === 'market') return { key: 'date' as const, dir: 'desc' as const }

  // 2) Bought => acquisition date DESC (via getDateSortMs)
  if (mode === 'bought') return { key: 'date' as const, dir: 'desc' as const }

  // 3) Auctions active => sale date ASC
  if (mode === 'auction' && section === 'active') return { key: 'date' as const, dir: 'asc' as const }

  // 4) Auctions archived => sale date DESC
  if (mode === 'auction' && section === 'archived') return { key: 'date' as const, dir: 'desc' as const }

  return { key: 'date' as const, dir: 'desc' as const }
}


function getMainImage(artwork: ArtworkListItem) {
  const images =
    (artwork.images ?? [])
      .filter((d) => d.document_type === 'image')
      .sort((a, b) => {
        const pa = typeof a.position === 'number' ? a.position : 9999
        const pb = typeof b.position === 'number' ? b.position : 9999
        return pa - pb
      })

  return images[0] ?? null
}


export default function ArtworkList({
  artworks,
  mode = 'market',
  section = 'active',
  canEditStatusPriority = false,
  statusOptions = [],
  savingInlineKey = null,
  onUpdateArtworkField,
  
}: ArtworkListProps) {
  const router = useRouter()
  
const { role } = useSessionProfile()

const normalizedRole =
  typeof role === 'string' ? role.toLowerCase() : ''



const [sortKey, setSortKey] = useState<
  | 'artist'
  | 'title'
  | 'date'
  | 'proposed_to'
  | 'asking'
  | 'estimate'
  | 'sold_premium'
  | 'cost'
  | 'priority'
  | 'status'
  | null
>(null)


  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const PREVIEW_COUNT = 5
  const [showAll, setShowAll] = useState(false)

  const defaultSort = useMemo(() => getDefaultSort(mode, section), [mode, section])

  useEffect(() => {}, [artworks, mode, section])


function handleSort(columnKey: NonNullable<typeof sortKey>) {
  // 1) Si on reclique sur la même colonne : toggle asc/desc
  if (sortKey === columnKey) {
    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    return
  }

  // 2) Nouveau tri : choisir une direction "par défaut" selon la colonne
  setSortKey(columnKey)

  // ✅ Priority : High d'abord au premier clic
  if (columnKey === 'priority') {
    setSortDirection('desc')
    return
  }

  // (Optionnel) Status : A→Z par défaut
  // if (columnKey === 'status') { setSortDirection('asc'); return }

  // (Optionnel) Prix : plus petit d'abord par défaut (garde 'asc')
  setSortDirection('asc')
}


  function sortArtworks(list: ArtworkListItem[]) {
    const hasUserSort = !!sortKey
    const effectiveKey = (sortKey ?? defaultSort.key) as NonNullable<typeof sortKey>
    const effectiveDir = (hasUserSort ? sortDirection : defaultSort.dir) as 'asc' | 'desc'

const compareNumbers = (x: number, y: number, dir: 'asc' | 'desc') => {
  if (x < y) return dir === 'asc' ? -1 : 1
  if (x > y) return dir === 'asc' ? 1 : -1
  return 0
}

const compareStrings = (x: any, y: any, dir: 'asc' | 'desc') => {
  const sx = (x ?? '').toString()
  const sy = (y ?? '').toString()
  const cmp = sx.localeCompare(sy, 'fr-CH', { sensitivity: 'base' })
  return dir === 'asc' ? cmp : -cmp
}

    return [...list].sort((a, b) => {
      let va: any
      let vb: any

      switch (effectiveKey) {
        case 'artist':
          va = ((a.artist as any)?.last_name ?? (a.artist as any)?.lastName ?? '').toString()
          vb = ((b.artist as any)?.last_name ?? (b.artist as any)?.lastName ?? '').toString()
          break
        case 'title':
          va = (a.title ?? '').toString()
          vb = (b.title ?? '').toString()
          break
        case 'date':
          va = getDateSortMs(a, mode)
          vb = getDateSortMs(b, mode)
          break
        case 'proposed_to':
          va = getProposedToText(a)
          vb = getProposedToText(b)
          break

        case 'asking':
          va = Number((a as any).asking_price ?? 0)
          vb = Number((b as any).asking_price ?? 0)
          break
        case 'estimate':
          va = Number((a as any).estimate_low ?? (a as any).estimate_high ?? 0)
          vb = Number((b as any).estimate_low ?? (b as any).estimate_high ?? 0)
          break
        case 'sold_premium':
          va = Number((a as any).sold_premium ?? 0)
          vb = Number((b as any).sold_premium ?? 0)
          break
        case 'cost':
          va = Number((a as any).cost_amount ?? 0)
          vb = Number((b as any).cost_amount ?? 0)
          break
        case 'priority':
          va = priorityRank((a as any).priority ?? null)
          vb = priorityRank((b as any).priority ?? null)
          break
        case 'status':
          va = ((a as any).status ?? '').toString()
          vb = ((b as any).status ?? '').toString()
          break
        default:
          return 0
      }


// 1) Comparaison principale
let primaryCmp = 0

const isString = typeof va === 'string' || typeof vb === 'string'
if (isString) {
  primaryCmp = compareStrings(va, vb, effectiveDir)
} else {
  primaryCmp = compareNumbers(Number(va ?? 0), Number(vb ?? 0), effectiveDir)
}

if (primaryCmp !== 0) return primaryCmp

// 2) ✅ Tie-breaker : si égalité, trier aussi par DATE "comme par défaut"
// (sauf si la clé principale EST déjà la date)
if (effectiveKey !== 'date') {
  const da = getDateSortMs(a, mode)
  const db = getDateSortMs(b, mode)

  // IMPORTANT: le sens du tie-break est le sens du tri par défaut de la section
  const dateCmp = compareNumbers(da, db, defaultSort.dir)
  if (dateCmp !== 0) return dateCmp
}

// 3) ✅ Tie-breaker final stable (évite les inversions aléatoires)
const ida = (a as any).id?.toString() ?? ''
const idb = (b as any).id?.toString() ?? ''
return ida.localeCompare(idb)

    })
  }

  const sortedArtworks = sortArtworks(artworks)
  const displayedArtworks = showAll ? sortedArtworks : sortedArtworks.slice(0, PREVIEW_COUNT)

  const dateHeaderLabel =
    mode === 'bought' ? 'Acquisition date' : mode === 'auction' ? 'Sale date' : 'Date proposed'

  const priceHeaderLabel =
    mode === 'market'
      ? 'Asking'
      : mode === 'auction'
      ? section === 'archived'
        ? 'Sold premium'
        : 'Estimate'
      : 'Cost price'


const priceSortKey: 'asking' | 'estimate' | 'sold_premium' | 'cost' =
  mode === 'market'
    ? 'asking'
    : mode === 'auction'
    ? section === 'archived'
      ? 'sold_premium'
      : 'estimate'
    : 'cost'


  // ✅ Afficher l'indicateur ▲▼ même quand on est sur le tri par défaut (sortKey=null)
  function getHeaderArrow(key: NonNullable<typeof sortKey>) {
    const hasUserSort = !!sortKey
    const effectiveKey = (sortKey ?? defaultSort.key) as NonNullable<typeof sortKey>
    const effectiveDir = (hasUserSort ? sortDirection : defaultSort.dir) as 'asc' | 'desc'
    if (effectiveKey !== key) return ''
    return effectiveDir === 'asc' ? ' ▲' : ' ▼'
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
            {/* 1) Image */}
            <th style={{ ...th, width: 80 }}>Image</th>

            {/* 2) Date / Proposed by */}




{/* 2) Date / Proposed by / Proposed to */}
<th
  style={{
    ...th,
    width: dateColumnWidth,
    minWidth: dateColumnWidth,
  }}
>
  <div style={headerStackStyle}>
    {/* ✅ DATE = tri actif */}
    <div
      style={{
        ...headerClickableLineStyle,
        backgroundColor: (sortKey ?? defaultSort.key) === 'date' ? '#eee' : 'transparent',
      }}
      onClick={() => handleSort('date')}
      title="Sort by date"
    >
      {dateHeaderLabel}
      {getHeaderArrow('date')}
    </div>

    {/* ✅ PROPOSED BY = affichage seulement */}
    <div style={headerStaticLineStyle}>
      Proposed by
    </div>

    {/* ✅ PROPOSED TO = tri admin/editor */}
    {(normalizedRole === 'administrator' || normalizedRole === 'editor') && (
      <div
        style={{
          ...headerClickableLineStyle,
          fontWeight: 500,
          color: '#111',
          backgroundColor: sortKey === 'proposed_to' ? '#eee' : 'transparent',
        }}
        onClick={() => handleSort('proposed_to')}
        title="Sort by proposed to"
      >
        Proposed to
        {sortKey === 'proposed_to' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
      </div>
    )}
  </div>
</th>





            {/* 3) Artist / Title */}


<th style={{ ...th, width: 140 }}>

  <div style={{ display: 'flex', flexDirection: 'column' }}>

    {/* ✅ ARTIST */}
    <div
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        backgroundColor: sortKey === 'artist' ? '#eee' : '#f5f5f5',
        padding: '2px 6px',
        borderRadius: 4,
        display: 'inline-block',
        alignSelf: 'flex-start', // ✅ garde la largeur du texte
      }}
      onClick={() => handleSort('artist')}
      title="Sort by artist"
    >
      Artist{sortKey === 'artist' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
    </div>

    {/* ✅ TITLE */}
    <div
      style={{
        marginTop: 4,
        padding: '2px 6px',   // ✅ même padding !
        cursor: 'pointer',
      }}
      onClick={() => handleSort('title')}
      title="Sort by title"
    >
      Title{sortKey === 'title' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
    </div>

  </div>

</th>



            {/* 4) Price / Priority+Status */}

<th
  style={{
    ...th,
    userSelect: 'none',
    width: 140,
    textAlign: 'right',
  }}
>
  {/* ✅ 1) Ligne du haut : tri PRIX */}
  <div
    style={{
      cursor: 'pointer',
      backgroundColor: sortKey === priceSortKey ? '#eee' : 'transparent',
      padding: '2px 6px',
      borderRadius: 4,
      display: 'inline-block',
    }}
    onClick={() => handleSort(priceSortKey)}
    title={`Sort by ${priceHeaderLabel.toLowerCase()}`}
  >
    {priceHeaderLabel}
    {sortKey === priceSortKey && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
  </div>

  {/* ✅ 2) Ligne du bas : tri PRIORITY et STATUS */}
  <div
    style={{
      fontSize: '0.95rem',
      fontWeight: 500,
      color: '#111',
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
      Priority{sortKey === 'priority' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
    </span>

    <span style={{ opacity: 0.6 }}> / </span>

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
      Status{sortKey === 'status' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
    </span>
  </div>
</th>

          </tr>
        </thead>

        <tbody>
          {displayedArtworks.map(a => {
            const dateValue = getDisplayDateValue(a as any, mode)
            const dateText = formatDateFr2(dateValue)

            const proposedByText = getProposedByText(a as any)
const proposedToText = getProposedToText(a as any)
            const artistText =
              a.artist &&
              typeof a.artist === 'object' &&
              ((a.artist as any).first_name || (a.artist as any).last_name)
                ? `${(a.artist as any).first_name ?? ''} ${(a.artist as any).last_name ?? ''}`.trim()
                : '—'

            const titleRaw = typeof a.title === 'string' && a.title.trim() !== '' ? a.title : '—'
            const titleText = truncateText(titleRaw, 60)

            const showSoldPremium = mode === 'auction' && section === 'archived'

            const priceMain =
              mode === 'market'
                ? formatAsking(a as any)
                : mode === 'auction'
                ? showSoldPremium
                  ? formatSoldPremium(a as any)
                  : formatEstimate(a as any)
                : (a as any).cost_amount != null && (a as any).cost_amount !== ''
                ? `${(a as any).cost_currency ?? ''} ${formatNumber(Number((a as any).cost_amount))}`.trim()
                : 'Cost: —'

            const prStatus = getPriorityStatusText(a as any)

            return (
              <tr
                key={a.id}
                onClick={() => router.push(`/artworks/print/${a.id}`)}
                style={{ cursor: 'pointer', transition: 'background-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f5f5f5')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'white')}
              >
                {/* 1) Image */}

<td style={{ ...td, width: 80 }}>
  {(() => {
    const images = Array.isArray((a as any).images)
      ? (a as any).images
      : []

    const sortedImages = images
      .filter((d) => d.document_type === 'image')
      .slice() // évite mutation
      .sort((a, b) => {
        const pa = typeof a.position === 'number' ? a.position : 9999
        const pb = typeof b.position === 'number' ? b.position : 9999
        return pa - pb
      })

    const mainImage = sortedImages[0]

    return mainImage?.url ? (
      <img
        src={mainImage.url}
        alt=""
        style={{
          width: 80,
          height: 70,
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





<td
  style={{
    ...td,
    width: 220,
    minWidth: 220,
  }}
>
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 3,            // ✅ respiration propre
      lineHeight: 1.2,
    }}
  >

    {/* ✅ DATE */}
    <div style={mainLine} title={dateText}>
      {dateText}
    </div>

    {/* ✅ PROPOSED BY */}
    <div style={secondLine} title={proposedByText}>
      {truncateText(proposedByText, 26)}
    </div>

    {/* ✅ PROPOSED TO */}
    {(normalizedRole === 'administrator' || normalizedRole === 'editor') && (
      <div
        style={{
          ...secondLine,
          color: '#006039',     // ✅ vert
          fontStyle: 'italic',  // ✅ italique
          fontSize: '0.98rem',  // ✅ légèrement plus discret
          opacity: 0.9,
        }}
        title={proposedToText}
      >
        {proposedToText ? truncateText(proposedToText, 26) : ''}
      </div>
    )}

  </div>
</td>


                {/* 3) Artist / Title */}
                <td style={{ ...td, width: 140 }}>
                  <div style={cell2Lines}>
                    <div style={mainLine} title={artistText}>
                      {truncateText(artistText, 24)}
                    </div>
                    <div style={secondLine} title={titleRaw}>
                      {titleText}
                    </div>
                    
                  </div>
                </td>



{/* 4) Price / Priority+Status */}
<td style={{ ...td, width: 140, textAlign: 'right' }}>
  <div style={{ ...cell2Lines, alignItems: 'flex-end' }}>

    {/* ✅ PRICE */}
    <div style={mainLine} title={priceMain}>
      {priceMain}
    </div>

    {/* ✅ PRIORITY + STATUS */}
    <div style={secondLine} title={prStatus}>
      {canEditStatusPriority && onUpdateArtworkField ? (
        <div
          style={{
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
          onClick={(e) => {
            e.stopPropagation()
          }}
        >
          {/* ✅ PRIORITY */}

<select
  value={(a.priority ?? '').toString()}
  disabled={savingInlineKey === `${a.id}:priority`}
  onClick={(e) => e.stopPropagation()}
  onChange={(e) => {
    e.stopPropagation()

    onUpdateArtworkField(
      a.id,
      'priority',
      e.target.value || null
    )
  }}
  style={inlineMiniSelect}
>
  <option value="">—</option>

  <option value="High">High</option>
  <option value="Medium">Medium</option>
  <option value="Information">Information</option>
</select>



          {/* séparateur */}
          <span style={{ opacity: 0.5 }}>/</span>

          {/* ✅ STATUS */}
          <select
            value={(a.status ?? '').toString()}
            disabled={savingInlineKey === `${a.id}:status`}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation()

              onUpdateArtworkField(
                a.id,
                'status',
                e.target.value || null
              )
            }}
            style={inlineMiniSelect}
          >
            <option value="">—</option>

            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      ) : (
        // ✅ fallback VIEWER / lecture seule
        prStatus
      )}
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
              fontSize: '1rem',
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



const inlineMiniSelect: React.CSSProperties = {
  fontSize: '1rem',
  padding: '2px 4px',
  borderRadius: 4,
  border: '1px solid rgba(0,0,0,0.25)',
  backgroundColor: '#fff',
  height: 22,
}


const dateColumnWidth = 240

const headerStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 4,
  minWidth: 0,
}

const headerClickableLineStyle: React.CSSProperties = {
  cursor: 'pointer',
  userSelect: 'none',
  padding: '2px 6px',
  borderRadius: 4,
  display: 'inline-block',
  whiteSpace: 'nowrap',
}

const headerStaticLineStyle: React.CSSProperties = {
  fontWeight: 500,
  color: '#111',
  padding: '2px 6px',
  display: 'inline-block',
  whiteSpace: 'nowrap',
  cursor: 'default',
}
