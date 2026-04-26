
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useEditMode } from '@/app/contexts/EditModeContext'
import { ArtworkSection } from './ArtworkSection'
import ImageUploader from '@/app/components/ImageUploader'
import { supabase } from '@/lib/supabaseClient'
import type { ArtworkDocument, Artwork, ArtworkForm } from '@/app/types/artwork'





// ✅ Même structure que celle que tu utilises déjà

const EMPTY_ARTWORK: ArtworkForm = {
  title: '',
  medium: null,
  signature: null,
  year_execution: null,
  dimensions: null,
  
cost_amount: null,
cost_currency: null,

  status: 'draft',
  priority: 'medium',
  auctions: false,

  asking_price: null,
  currency: 'CHF',

  artist_id: null,
  location_contact_id: null,
  auction_contact_id: null,
  buyer_contact_id: null,
  destination_contact_id: null,
  certificate_location_contact_id: null,
  proposed_by_id: null,

  sale_date: null,
  sale_time: null,
  auction_link: null,
  auction_currency: null,

  estimate_low: null,
  estimate_high: null,

  sold_hammer: null,
  sold_premium: null,
  underbidder: false,
  guarantee: false,

  date_proposition: null,
  view_date: null,
  condition: null,
  notes: null,
  certificate: false,
  check_seller: false,

  height_cm: null,
  width_cm: null,
  depth_cm: null,

insurance_value: null,
insurance_currency: null,

  documents: [],
  artwork_proposals: [],
}


export default function ArtworkCreateContent() {

    const router = useRouter()
  const { isEditing, setIsEditing } = useEditMode()

  const [artwork, setArtwork] = useState<ArtworkForm>(EMPTY_ARTWORK)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ✅ En création, on force toujours le mode édition
  useEffect(() => {
    setIsEditing(true)
  }, [setIsEditing])

  async function saveArtwork() {
    try {
      setLoading(true)
      setError(null)

      const payload = {
        title: artwork.title,
        medium: artwork.medium,
        signature: artwork.signature,
        year_execution: artwork.year_execution,
        location_contact_id: artwork.location_contact_id,
        status: artwork.status,
        priority: artwork.priority,
        asking_price: artwork.asking_price,
        currency: artwork.currency,
        auctions: artwork.auctions,
        auction_contact_id: artwork.auction_contact_id,
        sale_date: artwork.sale_date,
        sale_time: artwork.sale_time,
        auction_link: artwork.auction_link,
        estimate_low: artwork.estimate_low,
        estimate_high: artwork.estimate_high,
        auction_currency: artwork.auction_currency,
        sold_hammer: artwork.sold_hammer,
        sold_premium: artwork.sold_premium,
        underbidder: artwork.underbidder,
        guarantee: artwork.guarantee,
        buyer_contact_id: artwork.buyer_contact_id,
        cost_amount: artwork.cost_amount,
        cost_currency: artwork.cost_currency,
        destination_contact_id: artwork.destination_contact_id,
        date_proposition: artwork.date_proposition,
        proposed_by_id: artwork.proposed_by_id,
        view_date: artwork.view_date,
        condition: artwork.condition,
        certificate: artwork.certificate,
        certificate_location_contact_id:
          artwork.certificate_location_contact_id,
        check_seller: artwork.check_seller,
        notes: artwork.notes,
        artist_id: artwork.artist_id,
        insurance_value: artwork.insurance_value,
        insurance_currency: artwork.insurance_currency,
        height_cm: artwork.height_cm || null,
        width_cm: artwork.width_cm || null,
        depth_cm: artwork.depth_cm || null,
      }

      const { data, error } = await supabase
        .from('artworks')
        .insert(payload)
        .select()
        .single()

      if (error || !data?.id) {
        console.error(error)
        setError('Failed to create artwork')
        return
      }

      // ✅ Après création → page détail / print
      router.push(`/artworks/print/${data.id}`)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <p style={{ padding: 40 }}>Creating artwork…</p>
  }

  if (error) {
    return (
      <p style={{ padding: 40, color: 'red' }}>
        {error}
      </p>
    )
  }

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
          justifyContent: 'flex-end',
          gap: 8,
          marginBottom: 20,
        }}
      >
        <button onClick={() => router.push('/artworks')}>
          Cancel
        </button>

        <button onClick={saveArtwork}>
          Save
        </button>
      </div>

      <ArtworkSection
        artwork={artwork}
        isEditing={true}
        setArtwork={setArtwork}
      />

      <ImageUploader
        artworkId={undefined}
        onUploaded={(uploadedDocument) => {
          setArtwork(prev => ({
            ...prev,
            documents: [...(prev.documents ?? []), uploadedDocument],
          }))
        }}
      />
    </main>
  )
}