
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Props = {
  artworks: any[]
}

type ArtworkListProps = {
    artworks: Artwork[]
    mode?: 'market' | 'auction' | 'bought' }

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  backgroundColor: '#f5f5f5',
  fontWeight: 600,
  fontSize: '0.85rem',
  borderBottom: '1px solid #ddd',
}

const td: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid #eee',
  fontSize: '0.9rem',
}


export default function ArtworkList({
  artworks,
  mode = 'market',
}: ArtworkListProps) {

  const router = useRouter()
  
  const [sortKey, setSortKey] = useState<
    'artist' | 'title' | 'date' | 'asking' | 'estimate'| 'cost' | 'priority' | 'status' | null
  >(null)

  const [sortDirection, setSortDirection] =
    useState<'asc' | 'desc'>('asc')


 const sortedArtworks = sortArtworks(artworks) 
  
function sortArtworks(artworks: any[]) {
  if (!sortKey) return artworks

  const sorted = [...artworks].sort((a, b) => {
    let va: any
    let vb: any

    switch (sortKey) {
      case 'artist':
        va = a.artist?.last_name || ''
        vb = b.artist?.last_name || ''
        break

      case 'title':
        va = a.title || ''
        vb = b.title || ''
        break

      case 'date':
        va = a.date_proposition ? new Date(a.date_proposition).getTime() : 0
        vb = b.date_proposition ? new Date(b.date_proposition).getTime() : 0
        break

      case 'asking':
        va = a.asking_price ?? 0
        vb = b.asking_price ?? 0
        break
        
      case 'estimate':
        va = a.estimate_low ?? 0
        vb = b.estimate_low ?? 0
        break

      case 'priority':
        // ordre métier explicite
        const priorityOrder = { high: 3, medium: 2, low: 1 }
        va = priorityOrder[a.priority] || 0
        vb = priorityOrder[b.priority] || 0
        break

      case 'status':
        va = a.status || ''
        vb = b.status || ''
        break

      default:
        return 0
    }

    if (va < vb) return sortDirection === 'asc' ? -1 : 1
    if (va > vb) return sortDirection === 'asc' ? 1 : -1
    return 0
  })

  return sorted
}


function SortableTh({
  label,
  columnKey,
}: {
  label: string
  columnKey: any
}) {
  const active = sortKey === columnKey

  return (
    <th
      style={{
        ...th,
        cursor: 'pointer',
        userSelect: 'none',
        backgroundColor: active ? '#eee' : '#f5f5f5',
      }}
      onClick={() => {
        if (sortKey === columnKey) {
          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
        } else {
          setSortKey(columnKey)
          setSortDirection('asc')
        }
      }}
    >
      {label}
      {active && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
    </th>
  )
}



  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          backgroundColor: 'white',
        }}
      >

<thead>
  <tr>
    <th style={{ ...th, width: 80 }}>Image</th>

    <SortableTh
      label="Date proposed"
      columnKey="date"
      sortKey={sortKey}
      sortDirection={sortDirection}
      setSortKey={setSortKey}
      setSortDirection={setSortDirection}
    />

    <SortableTh
      label="Artist"
      columnKey="artist"
      sortKey={sortKey}
      sortDirection={sortDirection}
      setSortKey={setSortKey}
      setSortDirection={setSortDirection}
    />

    <SortableTh
      label="Title"
      columnKey="title"
      sortKey={sortKey}
      sortDirection={sortDirection}
      setSortKey={setSortKey}
      setSortDirection={setSortDirection}
    />


{mode === 'market' && (
  <SortableTh
    label="Asking"
    columnKey="asking"
    sortKey={sortKey}
      sortDirection={sortDirection}
      setSortKey={setSortKey}
      setSortDirection={setSortDirection}
  />
)}

{mode === 'auction' && (
  <SortableTh
    label="Estimate"
    columnKey="estimate"
    sortKey={sortKey}
      sortDirection={sortDirection}
      setSortKey={setSortKey}
      setSortDirection={setSortDirection}
  />
)}

{mode === 'bought' && (
  <SortableTh
    label="Cost price"
    columnKey="cost"
    sortKey={sortKey}
      sortDirection={sortDirection}
      setSortKey={setSortKey}
      setSortDirection={setSortDirection}
  />
)}



    <SortableTh
      label="Priority"
      columnKey="priority"
      sortKey={sortKey}
      sortDirection={sortDirection}
      setSortKey={setSortKey}
      setSortDirection={setSortDirection}
    />

    <SortableTh
      label="Status"
      columnKey="status"
      sortKey={sortKey}
      sortDirection={sortDirection}
      setSortKey={setSortKey}
      setSortDirection={setSortDirection}
    />
  </tr>
</thead>

        <tbody>
          {sortedArtworks.map((a) => (
            <tr key={a.id}
              onClick={() => router.push(`/artworks/print/${a.id}`)}
              style={{
                cursor: 'pointer',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = '#f5f5f5')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = 'white')
              }
            >

{/* Image */}
<td style={{ ...td, width: 80 }}>
  {(() => {
    const images =
      a.documents?.filter(
        (d: any) => d.document_type === 'image'
      ) || []

    return images.length > 0 ? (
      <img
        src={images[0].url}
        alt=""
        style={{
          width: 60,
          height: 60,
          objectFit: 'cover',
          borderRadius: 4,
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


              {/* Date proposed */}
              <td style={td}>
                {a.date_proposition
                  ? new Date(a.date_proposition).toLocaleDateString('fr-CH')
                  : '—'}
              </td>

              {/* Artist */}
              <td style={td}>
                {a.artist
                  ? `${a.artist.last_name}`.trim()
                  : '—'}
              </td>

              {/* Title */}
              <td style={td}>
                {a.title}
                 </td>

              {/* Asking */}
              {mode === 'market' && (
                <td style={{ ...td, textAlign: 'right' }}>
                  {a.asking_price
                    ? `${a.currency} ${a.asking_price.toLocaleString('fr-CH')}`
                    : '—'}
                </td>
              )}

              {mode === 'auction' && (
                <td style={{ ...td, textAlign: 'right' }}>
                  {a.estimate_low && a.estimate_high
                    ? `${a.auction_currency} ${a.estimate_low.toLocaleString('fr-CH')} – ${a.estimate_high.toLocaleString('fr-CH')}`
                    : '—'}
                </td>
              )}

                {mode === 'bought' && (
                <td style={{ ...td, textAlign: 'right' }}>
                  {a.cost_amount
                    ? `${a.cost_currency} ${a.cost_amount.toLocaleString('fr-CH')}`
                    : '—'}
                </td>
              )}

              {/* Priority */}
              <td style={td}>{a.priority}</td>

              {/* Status */}
              <td style={td}>{a.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
