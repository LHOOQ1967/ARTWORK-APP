
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import ArtworkList from '@/app/components/artwork/ArtworkList'
import { supabase } from '@/lib/supabaseClient'

export default function ArtworksPage() {
  /* ======================
     STATE
     ====================== */

    type ArtworkDocument = {
      id: string
      document_type: 'image' | 'onedrive'
      label?: string | null
      url?: string | null
    }


    type Artwork = {
      id: string
      documents: ArtworkDocument[]
      status: 'viewed' | 'draft' | 'negotiation' | 'bought' | 'archived'
      proposed_by_id?: string | null
        proposedBy?: {
        company_name?: string
        first_name?: string
        last_name?: string
      } | null
    }

const [artworks, setArtworks] = useState<Artwork[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)


  /* ======================
     EFFECTS — TOUJOURS EN HAUT
     ====================== */

  // ✅ Artworks

  useEffect(() => {
  const loadArtworks = async () => {


  const checkSession = async () => {
  const { data } = await supabase.auth.getSession()
  console.log('PRINT session:', data.session)
}

checkSession()


      try {
        setLoading(true)
        setError(null)

        const { data, error } = await supabase
          .from('artworks')

  .select(`
    *,
    artist:artists!artworks_artist_id_fkey (
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

          .neq('auctions', true)

        if (error) {
          console.error(error)
          setError('Failed to load artworks')
          return
        }

        
      setArtworks( Array.isArray(data) ? (data as Artwork[]) : [])
      } catch (err) {
        console.error(err)
        setError('Network error')
      } finally {
        setLoading(false)
      }
    }

    loadArtworks()
  }, [])

  // ✅ Artists (liste complète, pas search)


  // ✅ Documents

 

/* ======================
   FILTERING
   ====================== */

// ✅ 1️⃣ Base métier : uniquement Private / Secondary market

// ✅ 2️⃣ Active artworks (hors auction)

  const safeArtworks = Array.isArray(artworks) ? artworks : []

  const activeArtworks = safeArtworks.filter(a =>
    ['viewed', 'draft', 'negotiation'].includes(a.status)
  )
  const boughtArtworks = safeArtworks.filter(a => a.status === 'bought')
  const archivedArtworks = safeArtworks.filter(a => a.status === 'archived')



  /* ======================
     CONDITIONAL RENDER (APRÈS HOOKS)
     ====================== */
  if (loading) {
    return <p style={{ padding: 40 }}>Loading artworks…</p>
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
