
'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ArtworkList from '@/app/components/artwork/ArtworkList'
import { fetchWithAuth } from '@/lib/fetchWithAuth'

export default function ArtworksPage() {
  /* ======================
     STATE
     ====================== */
  const [artworks, setArtworks] = useState<any[]>([])
  const [artists, setArtists] = useState<any[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()

  /* ======================
     EFFECTS — TOUJOURS EN HAUT
     ====================== */

  // ✅ Artworks
  useEffect(() => {
    async function loadArtworks() {
      try {
        const res = await fetchWithAuth('/api/artworks')
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

  // ✅ Artists (liste complète, pas search)
  useEffect(() => {
    fetchWithAuth('/api/artists')
      .then(res => res.json())
      .then(data => {
        setArtists(Array.isArray(data) ? data : data.data || [])
      })
  }, [])

  // ✅ Documents
  useEffect(() => {
    fetchWithAuth('/api/documents')
      .then(res => res.json())
      .then(data => {
        setDocuments(Array.isArray(data) ? data : data.data || [])
      })
  }, [])

  /* ======================
     ENRICHED ARTWORKS
     ====================== */
  const enrichedArtworks = useMemo(() => {
    return artworks.map(a => ({
      ...a,
      artist: artists.find(ar => ar.id === a.artist_id) || null,
      documents: documents.filter(d => d.artwork_id === a.id),
    }))
  }, [artworks, artists, documents])

  /* ======================
     FILTERING
     ====================== */
  const activeArtworks = enrichedArtworks.filter(a =>
    ['viewed', 'draft', 'negotiation', 'bought'].includes(a.status)
  )

  const archivedArtworks = enrichedArtworks.filter(
    a => a.status === 'archived'
  )

  /* ======================
     CONDITIONAL RENDER (APRÈS HOOKS)
     ====================== */
  if (loading) {
    return <p style={{ padding: 40 }}>Loading artworks…</p>
  }

  if (error) {
    return (
      <p style={{ padding: 40, color: 'red' }}>
        {error}
      </p>
    )
  }

  /* ======================
     RENDER
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
        <h2
          style={{
            color: 'white',
            fontSize: '1.8rem',
            fontWeight: 700,
            margin: 0,
          }}
        >
          Primary and Secondary Market ({activeArtworks.length})
        </h2>

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
            + New artwork
          </span>
        </Link>
      </div>

      <ArtworkList artworks={activeArtworks} />

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
              fontSize: '1.8rem',
              fontWeight: 700,
              marginBottom: 20,
            }}
          >
            Archived artworks ({archivedArtworks.length})
          </h2>

          <ArtworkList artworks={archivedArtworks} />
        </section>
      )}
    </main>
  )
}
