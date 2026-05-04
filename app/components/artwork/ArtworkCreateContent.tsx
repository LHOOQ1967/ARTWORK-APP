
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ArtworkForm, Artist, Contact, ArtworkWithRelations } from '@/app/types/artwork'
import { ArtworkFieldsLayout } from './ArtworkFieldsLayout'
import { supabase } from '@/lib/supabaseClient'



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

   date_proposition: new Date().toISOString().slice(0, 10),
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

  const today = new Date().toISOString().slice(0, 10)
 
// ✅ Contacts (locations, certificates, buyers, etc.)
const [contactOptions, setContactOptions] = useState<any[]>([])

useEffect(() => {
  const loadContacts = async () => {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, company_name, first_name, last_name')
      .order('company_name', { ascending: true })


    console.log('CONTACTS (loadContacts) DATA:', data)
    console.log('CONTACTS (loadContacts) ERROR:', error)



    if (!error && data) {
      setContactOptions(data)
    }
  }


  loadContacts()
}, [])
 





const [artistQuery, setArtistQuery] = useState('')
const [artistResults, setArtistResults] = useState<Artist[]>([])
const [artistOptions, setArtistOptions] = useState<Artist[]>([])




useEffect(() => {
  if (!artistQuery.trim()) {
    setArtistResults([])
    return
  }

  const timeout = setTimeout(async () => {
    const { data, error } = await supabase
      .from('artists')
      .select('id, first_name, last_name')
      .or([
        `first_name.ilike.%${artistQuery}%`,
        `last_name.ilike.%${artistQuery}%`,
      ].join(','))
      .order('last_name')
      .limit(10)

    if (!error) {
      setArtistResults(data ?? [])
    }
  }, 300)

  return () => clearTimeout(timeout)
}, [artistQuery])


// 🔍 Proposed by (contacts)
const [contactQuery, setContactQuery] = useState('')
const [contactResults, setContactResults] = useState<Contact[]>([])


useEffect(() => {
  if (!contactQuery.trim()) {
    setContactResults([])
    return
  }

  const timeout = setTimeout(async () => {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, company_name, first_name, last_name')
      .or([
        `company_name.ilike.%${contactQuery}%`,
        `first_name.ilike.%${contactQuery}%`,
        `last_name.ilike.%${contactQuery}%`,
      ].join(','))
      .limit(10)

    if (!error) {
      setContactResults(data ?? [])
    }
  }, 300)

  return () => clearTimeout(timeout)
}, [contactQuery])

// 👤 Buyer
const [buyerResults, setBuyerResults] = useState<Contact[]>([])


// 📍 Destination
const [destinationResults, setDestinationResults] = useState<Contact[]>([])


// 🔨 Auction house
const [auctionQuery, setAuctionQuery] = useState('')
const [auctionResults, setAuctionResults] = useState<Contact[]>([])

useEffect(() => {
  if (!auctionQuery.trim()) {
    setAuctionResults([])
    return
  }

  const timeout = setTimeout(async () => {
    const { data } = await supabase
      .from('contacts')
      .select('id, company_name, first_name, last_name')

     

.or([
  `company_name.ilike.%${contactQuery}%`,
  `first_name.ilike.%${contactQuery}%`,
  `last_name.ilike.%${contactQuery}%`,
].join(','))

      .limit(10)

    setAuctionResults(data ?? [])
  }, 300)

  return () => clearTimeout(timeout)
}, [auctionQuery])





async function saveArtwork() {

if (!artwork || !artwork.title || !artwork.title.trim()) {
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


if (!artwork) {
  return null // ou un loader, ou un message
}


 





useEffect(() => {
  const checkSession = async () => {
    const { data } = await supabase.auth.getSession()
    console.log('SESSION', data)
  }

  checkSession()
}, [])



console.log('CONTACT OPTIONS STATE:', contactOptions)

return (
  <main style={{ padding: 40, backgroundColor: '#006039', color: 'white' }}>
  <h3
  style={{
    textAlign: 'center',   // ✅ centre uniquement cette ligne
    fontSize: '1.3rem',    // ✅ légèrement plus grand (optionnel)
    }}
>
  Create Artwork
</h3>


<div
  style={{
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 1,
  }}
>
  {/* Cancel */}
  <button className="edit-button"
    type="button"
    onClick={() => router.back()}
  >
    Cancel
  </button>

  {/* Save */}
  <button className="edit-button"
    type="button"
    onClick={saveArtwork}
    disabled={loading}
      >
    {loading ? 'Saving…' : 'Save'}
  </button>
</div>



<ArtworkFieldsLayout
  artwork={artwork}
  setArtwork={setArtwork}
  isEditing={true}

  // ✅ ARTIST
  artistQuery={artistQuery}
  setArtistQuery={setArtistQuery}
  artistResults={artistResults}
  artistOptions={artistOptions}

  // ✅ CONTACT
  contactQuery={contactQuery}
  setContactQuery={setContactQuery}
  contactResults={contactResults}
  contactOptions={contactOptions}

  // ✅ AUCTION
  auctionQuery={auctionQuery}
  setAuctionQuery={setAuctionQuery}
  auctionResults={auctionResults}

  // ✅ BUYER / DESTINATION
  buyerResults={buyerResults}
  destinationResults={destinationResults}
/>





  </main>
)



}
