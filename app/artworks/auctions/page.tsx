
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { fetchWithAuth } from '@/lib/fetchWithAuth'

type Artwork = {
  id: string
  title: string
  priority: string
  status: string
  sale_date: string | null
  estimate_low: number | null
  estimate_high: number | null
  auction_currency: string | null
  artist?: { last_name: string } | null
  documents?: {
    id: string
    document_type: string
    url: string
  }[]
}

type SortKey =
  | 'sale_date'
  | 'artist'
  | 'title'
  | 'priority'
  | 'status'
  | null

export default function AuctionArtworksPage() {
  /* ======================
     Hooks – TOUS en haut
     ====================== */
  const [artworks, setArtworks] = useState<Artwork[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sortKey, setSortKey] = useState<SortKey>(null)
  const [sortDirection, setSortDirection] =
    useState<'asc' | 'desc'>('asc')

  const router = useRouter()

  /* ======================
     Data loading
     ====================== */
  useEffect(() => {
    async function loadArtworks() {
      try {
        const res = await fetchWithAuth('/api/artworks?view=auctions')
        const data = await res.json()

        if (!res.ok || !Array.isArray(data)) {
          setError(data?.error || 'Failed to load auction artworks')
          return
        }

        setArtworks(data)
      } catch {
        setError('Network error')
      } finally {
        setLoading(false)
      }
    }

    loadArtworks()
  }, [])

  /* ======================
     Sorting helper
     ====================== */
  function toggleSort(key: Exclude<SortKey, null>) {
    if (sortKey === null) {
      setSortKey(key)
      setSortDirection('asc')
      return
    }

    if (sortKey === key) {
      setSortDirection(prev =>
        prev === 'asc' ? 'desc' : 'asc'
      )
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }


function sortArtworks(
  artworks: Artwork[],
  key: SortKey,
  direction: 'asc' | 'desc'
) {
  if (!key) return artworks

  const sorted = [...artworks].sort((a, b) => {
    let va: any
    let vb: any

    switch (key) {
      case 'sale_date':
        va = a.sale_date ? new Date(a.sale_date).getTime() : 0
        vb = b.sale_date ? new Date(b.sale_date).getTime() : 0
        break

      case 'artist':
        va = a.artist?.last_name || ''
        vb = b.artist?.last_name || ''
        break

      case 'title':
        va = a.title || ''
        vb = b.title || ''
        break

      case 'priority':
        const order: Record<string, number> = {
          high: 3,
          medium: 2,
          low: 1,
        }
        va = order[a.priority] || 0
        vb = order[b.priority] || 0
        break

      case 'status':
        va = a.status || ''
        vb = b.status || ''
        break

      default:
        return 0
    }

    if (va < vb) return direction === 'asc' ? -1 : 1
    if (va > vb) return direction === 'asc' ? 1 : -1
    return 0
  })

  return sorted
}



function SortableTh({
  label,
  columnKey,
  sortKey,
  sortDirection,
  onSort,
}: {
  label: string
  columnKey: Exclude<SortKey, null>
  sortKey: SortKey
  sortDirection: 'asc' | 'desc'
  onSort: (key: Exclude<SortKey, null>) => void
}) {
  const active = sortKey === columnKey

  return (
    <th
      style={{
        ...th,
        cursor: 'pointer',
        userSelect: 'none',
        backgroundColor: active ? '#eee' : '#f3f3f3',
      }}
      onClick={() => onSort(columnKey)}
    >
      {label}
      {active && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
    </th>
  )
}



  /* ======================
     Early returns (APRÈS hooks)
     ====================== */
  if (loading) {
    return <p style={{ padding: 40 }}>Loading auction artworks…</p>
  }

  if (error) {
    return <p style={{ padding: 40, color: 'red' }}>{error}</p>
  }



const sortedArtworks = sortArtworks(
  artworks,
  sortKey,
  sortDirection
)


  /* ======================
     Split active / archived
     ====================== */

const activeArtworks = sortedArtworks.filter(
  a => a.status !== 'archived'
)

const archivedArtworks = sortedArtworks.filter(
  a => a.status === 'archived'
)



  /* ======================
     Render
     ====================== */
  return (
    <main
      style={{
        padding: 40,
        minHeight: '100vh',
        backgroundColor: '#007a5e',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >

<h1
  style={{
    color: 'white',
    fontSize: '1.8rem',
    fontWeight: 700,
    margin: 0,
    cursor: 'pointer',
    userSelect: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  }}
  >
  Auctions
</h1>
        <Link href="/artworks/new">
          <span
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              fontWeight: 700,
              backgroundColor: '#f5f5f5',
              color: 'black',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            + New artwork
          </span>
        </Link>
      </div>

      {/* Active auctions */}

      <div style={{ backgroundColor: 'white', borderRadius: 6 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
         
<thead>
  <tr>
    <th style={th}>Image</th>

    <SortableTh
      label="Auction date"
      columnKey="sale_date"
      sortKey={sortKey}
      sortDirection={sortDirection}
      onSort={toggleSort}
    />

    <SortableTh
      label="Artist"
      columnKey="artist"
      sortKey={sortKey}
      sortDirection={sortDirection}
      onSort={toggleSort}
    />

    <SortableTh
      label="Title"
      columnKey="title"
      sortKey={sortKey}
      sortDirection={sortDirection}
      onSort={toggleSort}
    />

    <SortableTh
      label="Estimate"
      columnKey="priority"
      sortKey={sortKey}
      sortDirection={sortDirection}
      onSort={toggleSort}
    />

    <SortableTh
      label="Priority"
      columnKey="priority"
      sortKey={sortKey}
      sortDirection={sortDirection}
      onSort={toggleSort}
    />

    <SortableTh
      label="Status"
      columnKey="status"
      sortKey={sortKey}
      sortDirection={sortDirection}
      onSort={toggleSort}
    />
  </tr>
</thead>

          <tbody>
            {activeArtworks.map(a => {
              const images =
                a.documents?.filter(d => d.document_type === 'image') || []

              return (
                <tr
                  key={a.id}
                  onClick={() => router.push(`/artworks/${a.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={td}>
                    {images[0] ? (
                      <img
                        src={images[0].url}
                        alt=""
                        style={{
                          width: 60,
                          height: 60,
                          objectFit: 'cover',
                          borderRadius: 4,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 60,
                          height: 60,
                          background: '#eee',
                          borderRadius: 4,
                        }}
                      />
                    )}
                  </td>

                  <td style={td}>
                    {a.sale_date
                      ? new Date(a.sale_date).toLocaleDateString('fr-CH')
                      : '—'}
                  </td>

                  <td style={td}>{a.artist?.last_name ?? '—'}</td>
                  <td style={td}>{a.title}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {a.estimate_low && a.estimate_high
                      ? `${a.auction_currency} ${a.estimate_low.toLocaleString('fr-CH')} – ${a.estimate_high.toLocaleString('fr-CH')}`
                      : '—'}
                  </td>
                  <td style={td}>{a.priority}</td>
                  <td style={td}>{a.status}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Archived auctions */}
      {archivedArtworks.length > 0 && (
        <section
          style={{
            marginTop: 40,
            paddingTop: 24,
            borderTop: '2px solid #ccc',
          }}
        >
          
<h2
  style={{
    color: 'white',
    fontSize: '1.5rem',
    fontWeight: 700,
    marginBottom: 20,
    cursor: 'pointer',
    userSelect: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  }}
 >
  Archived auctions ({archivedArtworks.length})
 
</h2>

      <div style={{ backgroundColor: 'white', borderRadius: 6 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Image</th>
              <th style={th}>Auction date</th>
              <th style={th}>Artist</th>
              <th style={th}>Title</th>
              <th style={th}>Estimate</th>
              <th style={th}>Priority</th>
              <th style={th}>Status</th>
            </tr>
          </thead>

          <tbody>
            {archivedArtworks.map(a => {
              const images =
                a.documents?.filter(d => d.document_type === 'image') || []

              return (
                <tr
                  key={a.id}
                  onClick={() => router.push(`/artworks/${a.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={td}>
                    {images[0] ? (
                      <img
                        src={images[0].url}
                        alt=""
                        style={{
                          width: 60,
                          height: 60,
                          objectFit: 'cover',
                          borderRadius: 4,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 60,
                          height: 60,
                          background: '#eee',
                          borderRadius: 4,
                        }}
                      />
                    )}
                  </td>

                  <td style={td}>
                    {a.sale_date
                      ? new Date(a.sale_date).toLocaleDateString('fr-CH')
                      : '—'}
                  </td>

                  <td style={td}>{a.artist?.last_name ?? '—'}</td>
                  <td style={td}>{a.title}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {a.estimate_low && a.estimate_high
                      ? `${a.auction_currency} ${a.estimate_low.toLocaleString('fr-CH')} – ${a.estimate_high.toLocaleString('fr-CH')}`
                      : '—'}
                  </td>
                  <td style={td}>{a.priority}</td>
                  <td style={td}>{a.status}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>



          {/* même table structure si souhaité */}
        </section>
      )}
    </main>
  )
}

/* ---------- styles ---------- */

const th: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  borderBottom: '2px solid #ccc',
  backgroundColor: '#f3f3f3',
}

const td: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid #ddd',
}
