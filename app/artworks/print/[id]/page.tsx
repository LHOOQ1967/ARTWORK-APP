
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import ArtworkSheet from '@/app/components/artwork/ArtworkSheet'

export default function ArtworkPrintPage() {
  const { id } = useParams<{ id: string }>()
  const [artwork, setArtwork] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return

    let isMounted = true

    const loadArtwork = async () => {
      try {
        setLoading(true)

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
              url,
              position
            ),
            auctionContact:contacts!artworks_auction_contact_id_fkey (
              id,
              company_name,
              first_name,
              last_name
            ),
            buyer:contacts!artworks_buyer_contact_id_fkey (
              id,
              company_name,
              first_name,
              last_name
            ),
            destination:contacts!artworks_destination_contact_id_fkey (
              id,
              company_name,
              first_name,
              last_name
            )
          `)
          .eq('id', id)
          .single()

        if (!isMounted) return

        if (error) {
          console.error(error)
          setArtwork(null)
          return
        }

        setArtwork(data)
      } catch (err) {
        if (!isMounted) return
        console.error(err)
        setArtwork(null)
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadArtwork()

    return () => {
      isMounted = false
    }
  }, [id])

  if (loading) {
    return <p style={{ padding: 40 }}>Loading artwork…</p>
  }

  if (!artwork) {
    return <p style={{ padding: 40 }}>Artwork not found</p>
  }

  return <ArtworkSheet artwork={artwork} />
}
