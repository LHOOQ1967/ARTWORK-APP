
'use client'

import {useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import ArtworkList from '@/components/artwork/ArtworkList'
import { supabase } from '@/lib/supabaseBrowser'
import type { ArtworkListItem } from '@/app/(protected)/types/artwork'
import { useSessionProfile } from '@/contexts/SessionContext'

export default function AuctionArtworksPage() {
  /* ======================
     STATE
     ====================== */
  const [artworks, setArtworks] = useState<ArtworkListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)


 const { role } = useSessionProfile()
const roleReady = role !== undefined && role !== null
  /* ======================
     LOAD ARTWORKS (AUCTIONS)
     ====================== */


useEffect(() => {
  if (!roleReady) return

  const isAdmin = role === 'Administrator' || role === 'Editor'

  const source = isAdmin
    ? 'auction_artworks_base'
    : 'viewer_auction_artworks_secure'

  const loadArtworks = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from(source)
      .select('*')

    if (error) {
      console.error(error)
      setArtworks([])
    } else {
      setArtworks(data ?? [])
    }

    setLoading(false)
  }

  loadArtworks()
}, [roleReady, role])

 

  /* ======================
     SORTING
     ====================== */
  const sortedAuctions = useMemo(() => {
    return [...artworks].sort((a, b) => {
      const da = a.sale_date ? new Date(a.sale_date).getTime() : 0
      const db = b.sale_date ? new Date(b.sale_date).getTime() : 0
      return db - da
    })
  }, [artworks])

  /* ======================
     SPLITS
     ====================== */
  const activeArtworks = sortedAuctions.filter(
    (a) => !['bought', 'archived'].includes(a.status ?? '')
  )

  const boughtArtworks = sortedAuctions.filter(
    (a) => a.status === 'bought'
  )

  const archivedArtworks = sortedAuctions.filter(
    (a) => a.status === 'archived'
  )


  /* ======================
     EARLY RETURNS
     ====================== */

if (!roleReady) {
  return <p style={{ padding: 40 }}>Loading user role…</p>
}


  if (loading) {
    return <p style={{ padding: 40 }}>Loading auction artworks…</p>
  }

  if (error) {
    return <p style={{ padding: 40, color: 'red' }}>{error}</p>
  }

  if (artworks.length === 0) {
    return (
      <main
        style={{
          padding: 40,
          minHeight: '100vh',
          backgroundColor: '#006039',
          color: 'white',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 20,
          }}
        >
          <h1>Auctions</h1>

          <Link href="/artworks/new">
            <button className="edit-button">+ New artwork</button>
          </Link>
        </div>

        <p>No auction artworks yet.</p>
      </main>
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
        <h2
          style={{
            color: 'white',
            fontSize: '1.8rem',
            fontWeight: 700,
            margin: 0,
          }}
        >
          Auctions ({activeArtworks.length})
        </h2>

        <Link href="/artworks/new">
          <button className="edit-button">+ New artwork</button>
        </Link>
      </div>

      <ArtworkList artworks={activeArtworks} mode="auction" />

      {boughtArtworks.length > 0 && (
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
            Bought artworks ({boughtArtworks.length})
          </h2>

          <ArtworkList artworks={boughtArtworks} mode="auction" />
        </section>
      )}

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

          <ArtworkList artworks={archivedArtworks} mode="auction" />
        </section>
      )}
    </main>
  )
}
