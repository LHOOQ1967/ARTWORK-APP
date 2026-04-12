
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Artwork = {
  id: string
  date_proposition: string
  title: string
  asking_price: number | null
  currency: string
  priority: string
  status: string
  artist?: {
    last_name: string
  } | null
}

export default function ArtworksPage() {
  const [artworks, setArtworks] = useState<Artwork[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const loadArtworks = async () => {
      try {
        const res = await fetch('/api/artworks')
        const data = await res.json()

        if (!res.ok || !Array.isArray(data)) {
          setError(data?.error || 'Failed to load artworks')
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

  if (loading) return <p style={{ padding: 40 }}>Loading artworks…</p>
  if (error) return <p style={{ padding: 40, color: 'red' }}>{error}</p>

  return (
    <main
      style={{
        padding: 40,
        minHeight: '100vh',
        backgroundColor: '#007a5e',
      }}
    >
      
      <h1 style={{ color: 'white', textAlign: 'center', fontWeight: 600, marginBottom: 20 }}>
        Artworks</h1>

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          backgroundColor: 'white',
        }}
      >
        <thead>
          <tr>
            <th style={th}>Date proposed</th>
            <th style={th}>Artist</th>
            <th style={th}>Title</th>
            <th style={th}>Asking</th>
            <th style={th}>Priority</th>
            <th style={th}>Status</th>
          </tr>
        </thead>

        <tbody>
          {artworks.map((a) => (
            
          <tr
            key={a.id}
            onClick={() => router.push(`/artworks/${a.id}`)}
            style={{
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = '#eeeeee')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = 'white')
            }
          >

              <td style={td}>
                {a.date_proposition
                  ? new Date(a.date_proposition).toLocaleDateString('fr-CH')
                  : '—'}
              </td>

              
<td style={td}>
  {a.artist
    ? `${a.artist.last_name}`.trim()
    : '—'}
</td>


              {/* ✅ LIEN CORRECT */}
              <td style={td}>
                <Link href={`/artworks/${a.id}`}>
                  {a.title}
                </Link>
              </td>

              <td style={td}>
                {a.asking_price
                  ? `${a.asking_price.toLocaleString('fr-CH')} ${a.currency}`
                  : '—'}
              </td>

              <td style={td}><strong>{a.priority}</strong></td>
              <td style={td}>{a.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
 
        <div
          style={{
            marginTop: 30,
            textAlign: 'center',
          }}
        >
          <Link href="/artworks/new">
            <span
              style={{
                display: 'inline-block',
                padding: '12px 24px',
                fontWeight: 700,
                backgroundColor: '#f5f5f5',
                borderBottom: '2px solid #ccc',
                color: 'black',
                borderRadius: 6,
                cursor: 'pointer',
                textDecoration: 'none',
              }}
            >
              + New Artwork
            </span>
          </Link>
        </div>


    </main>
  )
}

/* ---------- styles ---------- */

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '2px solid #ccc',
  background: '#f5f5f5',
}

const td: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid #ddd',
}
