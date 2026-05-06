
'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import ArtworkList from '@/components/artwork/ArtworkList'
import { supabase } from '@/lib/supabaseBrowser'
import type { ArtworkListItem } from '@/app/(protected)/types/artwork'
import { useSessionProfile } from '@/contexts/SessionContext'
import { resolveSource } from '@/lib/viewerSources'

export default function ArtworksPage() {
  const [artworks, setArtworks] = useState<ArtworkListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { role } = useSessionProfile()

  // ✅ Toujours calculé (hook-safe)
  const source = role ? resolveSource('artworks', role) : null

  // ✅ Hook toujours appelé
  useEffect(() => {
    if (!source) {
      setLoading(false)
      return
    }

    const loadArtworks = async () => {
      try {
        setLoading(true)
        setError(null)

        const { data, error } = await supabase
          .from(source)
          .select('*')

        if (error) {
          console.error(error)
          setError('Failed to load artworks')
          return
        }

        setArtworks(Array.isArray(data) ? data : [])
      } catch (err) {
        console.error(err)
        setError('Network error')
      } finally {
        setLoading(false)
      }
    }

    loadArtworks()
  }, [source])

  // ✅ Hooks toujours avant les retours
  const sortedArtworks = useMemo(() => {
    return [...artworks].sort((a, b) => {
      const da = a.date_proposition
        ? new Date(a.date_proposition).getTime()
        : 0
      const db = b.date_proposition
        ? new Date(b.date_proposition).getTime()
        : 0
      return db - da
    })
  }, [artworks])

  const activeArtworks = sortedArtworks.filter(
    a => !['bought', 'archived'].includes(a.status ?? '')
  )

  const boughtArtworks = sortedArtworks.filter(
    a => a.status === 'bought'
  )

  const archivedArtworks = sortedArtworks.filter(
    a => a.status === 'archived'
  )

  /* ======================
     RENDER (APRÈS TOUS LES HOOKS)
     ====================== */

  if (loading) {
    return <p style={{ padding: 40 }}>Loading artworks…</p>
  }

  if (error) {
    return <p style={{ padding: 40, color: 'red' }}>{error}</p>
  }



  return (
    <main
      style={{
        padding: 40,
        minHeight: '100vh',
        backgroundColor: '#006039',
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
        <h2 style={{ color: 'white', fontSize: '1.8rem', fontWeight: 700 }}>
          Primary and Secondary Market ({activeArtworks.length})
        </h2>

        <Link href="/artworks/new">
          <button className="edit-button">+ New artwork</button>
        </Link>
      </div>

      <ArtworkList artworks={activeArtworks} />

      {boughtArtworks.length > 0 && (
        <section style={{ marginTop: 40, paddingTop: 24, borderTop: '2px solid #ccc' }}>
          <h2 style={{ color: 'white', fontSize: '1.8rem', fontWeight: 700 }}>
            Bought artworks ({boughtArtworks.length})
          </h2>
          <ArtworkList artworks={boughtArtworks} mode="bought" />
        </section>
      )}

      {archivedArtworks.length > 0 && (
        <section style={{ marginTop: 40, paddingTop: 24, borderTop: '2px solid #ccc' }}>
          <h2 style={{ color: 'white', fontSize: '1.8rem', fontWeight: 700 }}>
            Archived artworks ({archivedArtworks.length})
          </h2>
          <ArtworkList artworks={archivedArtworks} />
        </section>
      )}
    </main>
  )
}
