
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import type { ArtworkForm } from '@/app/types/artwork'
import ArtworkFormFields from './ArtworkFormFields'
import { ArtworkSection } from './ArtworkSection'

const EMPTY_ARTWORK: ArtworkForm = {
  title: '',
  medium: null,
  signature: null,
  year_execution: null,
  dimensions: null,

  date_acquisition: null,
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
  lot: null,

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
  

  const [artwork, setArtwork] = useState<ArtworkForm>(EMPTY_ARTWORK)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)





async function saveArtwork() {
  if (!artwork.title.trim()) {
    setError('Title is required')
    return
  }

  try {
    setLoading(true)
    setError(null)


     
const payload = {
  title: artwork.title,
  medium: artwork.medium,
  signature: artwork.signature,
  year_execution: artwork.year_execution,

  date_acquisition: artwork.date_acquisition,
  cost_amount: artwork.cost_amount,
  cost_currency: artwork.cost_currency,

  status: artwork.status,
  priority: artwork.priority,
  auctions: artwork.auctions,

  asking_price: artwork.asking_price,
  currency: artwork.currency,

  artist_id: artwork.artist_id,
  location_contact_id: artwork.location_contact_id,
  auction_contact_id: artwork.auction_contact_id,
  buyer_contact_id: artwork.buyer_contact_id,
  destination_contact_id: artwork.destination_contact_id,
  certificate_location_contact_id: artwork.certificate_location_contact_id,
  proposed_by_id: artwork.proposed_by_id,

  sale_date: artwork.sale_date,
  sale_time: artwork.sale_time,
  auction_link: artwork.auction_link,
  auction_currency: artwork.auction_currency,
  lot: artwork.lot,

  estimate_low: artwork.estimate_low,
  estimate_high: artwork.estimate_high,

  sold_hammer: artwork.sold_hammer,
  sold_premium: artwork.sold_premium,
  underbidder: artwork.underbidder,
  guarantee: artwork.guarantee,

  date_proposition: artwork.date_proposition,
  view_date: artwork.view_date,
  condition: artwork.condition,
  notes: artwork.notes,
  certificate: artwork.certificate,
  check_seller: artwork.check_seller,

  height_cm: artwork.height_cm,
  width_cm: artwork.width_cm,
  depth_cm: artwork.depth_cm,

  insurance_value: artwork.insurance_value,
  insurance_currency: artwork.insurance_currency,
}


const { data, error } = await supabase
  .from('artworks')
  .insert(payload)
  .select()
  .single()


if (error) {
  console.error('CREATE ARTWORK FAILED:', error)
  setError(error.message)
  return
}

if (!data?.id) {
  console.error('NO DATA RETURNED:', data)
  setError('Artwork not created (no id)')
  return
}


    router.push(`/artworks/print/${data.id}`)
  } finally {
    setLoading(false)
  }
}


  if (loading) {
    return <p style={{ padding: 40 }}>Creating artwork…</p>
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


<button onClick={saveArtwork} disabled={loading}>
  Save
</button>

      </div>


<ArtworkSection
  artwork={artwork}
  isEditing={true}
  setArtwork={setArtwork}
  addProposal={undefined}
  removeProposal={undefined}
/>

    </main>
  )
}
