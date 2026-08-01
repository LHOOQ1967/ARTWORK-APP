
'use client'

import React, { useMemo, useState } from 'react'
import type { ArtworkListItem } from '@/app/(protected)/types/artwork'
import { useRouter } from 'next/navigation'
import { useSessionProfile } from '@/contexts/SessionContext'
import {
  formatAsking,
  formatCost,
  formatDateFr2,
  formatEstimate,
  formatSoldPremium,
  getArtistName,
  getDefaultSort,
  getDisplayDateValue,
  getMainImage,
  getPriorityStatusText,
  getProposedByText,
  getProposedToText,
  getTitleWithYear,
  sortArtworkItems,
  truncateText,
  type ArtworkListMode,
  type ArtworkListSection,
  type ArtworkSortKey,
  type SortDirection,
} from './artworkListHelpers'

type ArtworkListProps = {
  artworks: ArtworkListItem[]
  mode?: ArtworkListMode
  /** active vs archived (utile surtout pour auctions: sold_premium + tri par défaut) */
  section?: ArtworkListSection
 
canEditStatusPriority?: boolean
  statusOptions?: string[]
  savingInlineKey?: string | null
  onUpdateArtworkField?: (
    artworkId: string,
    field: 'status' | 'priority',
    value: string | null
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
  fontSize: '1.1rem',
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const mainLineBold: React.CSSProperties = {
  ...mainLine,
  fontWeight: 700,
}

const secondLine: React.CSSProperties = {
  color: '#111',
  fontSize: '1.05rem',     // ✅ AJOUT ICI
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
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



const [sortKey, setSortKey] = useState<ArtworkSortKey | null>(null)


  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const PREVIEW_COUNT = 5
  const [showAll, setShowAll] = useState(false)

  const defaultSort = useMemo(() => getDefaultSort(mode, section), [mode, section])

function handleSort(columnKey: ArtworkSortKey) {
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


  const sortedArtworks = sortArtworkItems(artworks, mode, defaultSort, sortKey, sortDirection)
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
  function getHeaderArrow(key: ArtworkSortKey) {
    const hasUserSort = !!sortKey
    const effectiveKey = sortKey ?? defaultSort.key
    const effectiveDir = hasUserSort ? sortDirection : defaultSort.dir
    if (effectiveKey !== key) return ''
    return effectiveDir === 'asc' ? ' ▲' : ' ▼'
  }

return (
  <div
    style={{
      backgroundColor: 'white',
      borderRadius: 6,
      overflowX: 'auto',
      overflowY: 'hidden',
      width: '100%',
    }}
  >
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

{/* ✅ 2) Lignes du bas : STATUS puis PRIORITY */}
<div
  style={{
    fontSize: '0.95rem',
    fontWeight: 500,
    color: '#111',
    marginTop: 4,
    textAlign: 'right',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 2,
  }}
>
  <span
    style={{
      cursor: 'pointer',
      backgroundColor: sortKey === 'status' ? '#eee' : 'transparent',
      padding: '2px 6px',
      borderRadius: 4,
    }}
    onClick={(e) => {
      e.stopPropagation()
      handleSort('status')
    }}
    title="Sort by status"
  >
    Status
    {sortKey === 'status' &&
      (sortDirection === 'asc' ? ' ▲' : ' ▼')}
  </span>

  <span
    style={{
      cursor: 'pointer',
      backgroundColor: sortKey === 'priority' ? '#eee' : 'transparent',
      padding: '2px 6px',
      borderRadius: 4,
    }}
    onClick={(e) => {
      e.stopPropagation()
      handleSort('priority')
    }}
    title="Sort by priority"
  >
    Priority
    {sortKey === 'priority' &&
      (sortDirection === 'asc' ? ' ▲' : ' ▼')}
  </span>
</div>
</th>

          </tr>
        </thead>

        <tbody>
          {displayedArtworks.map(a => {
            const dateValue = getDisplayDateValue(a, mode)
            const dateText = formatDateFr2(dateValue)

            const proposedByText = getProposedByText(a)
const proposedToText = getProposedToText(a)
            const artistText = getArtistName(a)

            const titleWithYear = getTitleWithYear(a)

            const showSoldPremium = mode === 'auction' && section === 'archived'

            const priceMain =
              mode === 'market'
                ? formatAsking(a)
                : mode === 'auction'
                ? showSoldPremium
                  ? formatSoldPremium(a)
                  : formatEstimate(a)
                : formatCost(a)

            const prStatus = getPriorityStatusText(a)
            const mainImage = getMainImage(a)

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
  {mainImage?.url ? (
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
    )}
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
<td style={{ ...td, width: 180 }}>
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
      lineHeight: 1.2,
      minWidth: 0,
    }}
  >
    {/* Artiste */}
    <div style={mainLineBold} title={artistText}>
      {truncateText(artistText, 24)}
    </div>

    {/* Titre + année */}
    <div
      style={secondLine}
      title={titleWithYear}
    >
      {truncateText(titleWithYear, 40)}
    </div>

    {/* Medium */}
    <div
      style={{
        ...secondLine,
        fontSize: '0.95rem',
        color: '#666',
      }}
      title={a.medium ?? ''}
    >
      {truncateText(a.medium ?? '', 40)}
    </div>
  </div>
</td>



{/* 4) Price / Priority+Status */}
<td style={{ ...td, width: 140, textAlign: 'right' }}>
  <div style={{ ...cell2Lines, alignItems: 'flex-end' }}>

    {/* ✅ PRICE */}
    <div style={mainLineBold} title={priceMain}>
      {priceMain}
    </div>

    {/* ✅ PRIORITY + STATUS */}
<div style={secondLine} title={prStatus}>
  {canEditStatusPriority && onUpdateArtworkField ? (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        alignItems: 'flex-end',
      }}
      onClick={(e) => {
        e.stopPropagation()
      }}
    >
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

  textAlign: 'right',
  textAlignLast: 'right',
}


const dateColumnWidth = 100

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
