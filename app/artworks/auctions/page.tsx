
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ color: 'white' }}>Auctions</h1>
        <Link href="/artworks/new">+ New artwork</Link>
      </div>

      <ArtworkList artworks={activeArtworks} mode="auction" />

      {boughtArtworks.length > 0 && (
        <ArtworkList artworks={boughtArtworks} mode="bought" />
      )}

      {archivedArtworks.length > 0 && (
        <ArtworkList artworks={archivedArtworks} mode="auction" />
      )}
    </main>
  )
}

