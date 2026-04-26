'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import ArtworkList from '@/app/components/artwork/ArtworkList'
import { supabase } from '@/lib/supabaseClient'


type Artwork = {
  id: string
  title: string
  priority: string
  status: string
  sale_date: string | null
  estimate_low: number | null
  estimate_high: number | null
  auction_currency: string | null
  artist?: {
    id: string
    first_name: string
    last_name: string
  } | null
  documents?: {
    id: string
    document_type: string
    url: string
  }[]
}


export default function AuctionArtworksPage() {
  /* ======================
     AUTH (OBLIGATOIRE EN HAUT)
     ====================== */

  /* ======================
     STATE
     ====================== */
  const [artworks, setArtworks] = useState<Artwork[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* ======================
     LOAD ARTWORKS (AUCTIONS)
     ====================== */
useEffect(() => {
    const loadArtworks = async () => {
      try {
        setLoading(true)
        setError(null)

        const { data, error } = await supabase
          .from('artworks')
          .select(`
            *,
            artist:artists (
              id,
              first_name,
              last_name
            ),
            documents:documents (
              id,
              document_type,
              label,
              url
            )
          `)
          .eq('auctions', true)

        if (error) {
          console.error(error)
          setError('Failed to load auction artworks')
          return
        }

        setArtworks(data ?? [])
      } catch (err) {
        console.error(err)
        setError('Network error')
      } finally {
        setLoading(false)
      }
    }

    loadArtworks()
  }, [])


  /* ======================
     SPLITS
     ====================== */
  const activeArtworks = artworks.filter(
    a => !['bought', 'archived'].includes(a.status)
  )
  const boughtArtworks = artworks.filter(a => a.status === 'bought')
  const archivedArtworks = artworks.filter(a => a.status === 'archived')

  /* ======================
     EARLY RETURNS
     ====================== */
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
          backgroundColor: '#007a5e',
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
            + New artwork
          </Link>
        </div>

        <p>No auction artworks yet.</p>
      </main>
    )
  }



console.log('AUCTIONS artworks:', artworks)

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

    <ArtworkList artworks={boughtArtworks} mode="bought"/>
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

          <ArtworkList artworks={archivedArtworks} />
        </section>
      )}

    </main>
  )
}

