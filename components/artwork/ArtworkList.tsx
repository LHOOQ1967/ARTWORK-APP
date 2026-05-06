
'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import type { ArtworkListItem } from '@/app/(protected)/types/artwork'
import { useRouter } from 'next/navigation'


type ArtworkListProps = {
    artworks: ArtworkListItem[]
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



const PREVIEW_COUNT = 5
const [showAll, setShowAll] = useState(false)


useEffect(() => {
  console.log(
    `ArtworkList [mode=${mode}]`,
    artworks.map(a => ({
      id: a.id,
      status: a.status,
      date_acquisition: a.date_acquisition,
    }))
  )
}, [artworks, mode])



const sortedArtworks = sortArtworks(artworks)

const displayedArtworks = showAll
  ? sortedArtworks
  : sortedArtworks.slice(0, PREVIEW_COUNT)


 



 
function sortArtworks(artworks: ArtworkListItem[]) {
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
  if (mode === 'bought') {
    va = a.date_acquisition ? new Date(a.date_acquisition).getTime() : 0
    vb = b.date_acquisition ? new Date(b.date_acquisition).getTime() : 0
  } else if (mode === 'auction') {
    va = a.sale_date ? new Date(a.sale_date).getTime() : 0
    vb = b.sale_date ? new Date(b.sale_date).getTime() : 0
  } else {
    va = a.date_proposition ? new Date(a.date_proposition).getTime() : 0
    vb = b.date_proposition ? new Date(b.date_proposition).getTime() : 0
  }
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

const priorityOrder: Record<'high' | 'medium' | 'low', number> = {
  high: 3,
  medium: 2,
  low: 1,
}

va = a.priority ? priorityOrder[a.priority] : 0
vb = b.priority ? priorityOrder[b.priority] : 0

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


function getDisplayDate(
  artwork: ArtworkListItem,
  mode?: 'market' | 'auction' | 'bought'
) {
  if (mode === 'auction') {
    return artwork.sale_date
  }

  return artwork.date_proposition
}


function SortableTh({
  label,
  columnKey,
}: {
  label: string

columnKey:
  | 'artist'
  | 'title'
  | 'date'
  | 'asking'
  | 'estimate'
  | 'cost'
  | 'priority'
  | 'status'
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


label={
  mode === 'bought'
    ? 'Acquisition date'
    : mode === 'auction'
      ? 'Sale date'
      : 'Date proposed'
}
  columnKey="date"
    />


<SortableTh
  label="Artist"
  columnKey="artist"
/>


    <SortableTh
      label="Title"
      columnKey="title"
    />


{mode === 'market' && (
  <SortableTh
    label="Asking"
    columnKey="asking"
  />
)}

{mode === 'auction' && (
  <SortableTh
    label="Estimate"
    columnKey="estimate"
  />
)}

{mode === 'bought' && (
  <SortableTh
    label="Cost price"
    columnKey="cost"
  />
)}



    <SortableTh
      label="Priority"
      columnKey="priority"
    />

    <SortableTh
      label="Status"
      columnKey="status"
    />
  </tr>
</thead>

        <tbody>
          {displayedArtworks.map((a) => (
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
const images = Array.isArray(a.images) ? a.images : [];

    return images.length > 0 ? (

<img
  src={images[0].url ?? undefined}
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
  {mode === 'bought'
    ? a.date_acquisition
      ? new Date(a.date_acquisition).toLocaleDateString('fr-CH')
      : '—'
    : mode === 'auction'
      ? a.sale_date
        ? new Date(a.sale_date).toLocaleDateString('fr-CH')
        : '—'
      : a.date_proposition
        ? new Date(a.date_proposition).toLocaleDateString('fr-CH')
        : '—'}
</td>



              {/* Artist */}





<td>
  {a.artist &&
  typeof a.artist === 'object' &&
  (a.artist.first_name || a.artist.last_name)
    ? `${a.artist.first_name ?? ''} ${a.artist.last_name ?? ''}`.trim()
    : '—'}
</td>






{/* Title */}
<td style={td}>
  {typeof a.title === 'string' && a.title.trim() !== ''
    ? a.title
    : '—'}
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
                    ? `${a.estimate_currency} ${a.estimate_low.toLocaleString('fr-CH')} – ${a.estimate_high.toLocaleString('fr-CH')}`
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
      
{artworks.length > PREVIEW_COUNT && (
  <div
    style={{
      padding: '10px 12px',
      borderTop: '1px solid #eee',
      fontSize: '0.85rem',
      textAlign: 'right',
      backgroundColor: '#e6e5e5',
      justifyContent: 'center', 
   
    }}
  >
    <button
      onClick={() => setShowAll((v) => !v)}
      style={{
      display: 'block',
        margin: '0 auto',        // ✅ centrage réel
        background: 'none',
        border: 'none',
        padding: 0,
        color: 'black',
        cursor: 'pointer',
        textDecoration: 'underline',

          }}
    >
      {showAll
        ? 'Voir moins'
        : `Voir les ${artworks.length} artworks`}
    </button>
  </div>
)}

    </div>
  )
}

