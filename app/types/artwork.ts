
// src/types/artwork.ts

export type ArtworkForm = {
  id?: string

  title: string | null
  medium: string | null
  signature: string | null
  year_execution: number | null
  dimensions?: string | null

  status: 'draft' | 'viewed' | 'negotiation' | 'bought' | 'archived'
  priority: 'information' | 'medium' | 'high'
  auctions: boolean

  asking_price: number | null
  currency: string | null

  artist_id: string | null
  location_contact_id: string | null
  auction_contact_id: string | null
  buyer_contact_id: string | null
  destination_contact_id: string | null
  certificate_location_contact_id: string | null
  proposed_by_id: string | null

  date_proposition: string | null
  sale_date: string | null
  sale_time?: string | null
  auction_link: string | null
  auction_currency: string | null

  estimate_low: number | null
  estimate_high: number | null

  sold_hammer: number | null
  sold_premium: number | null
  underbidder: boolean
  guarantee: boolean

  view_date: string | null
  condition: string | null
  notes: string | null
  certificate: boolean

  cost_amount: number | null
  cost_currency: string | null
  insurance_value: number | null
  insurance_currency: string | null

  height_cm: number | null
  width_cm: number | null
  depth_cm: number | null

  acquired?: boolean

  documents: unknown[]
  artwork_proposals?: unknown[]
}

export type Artwork = {
  id: string
}


export type ArtworkDocument = {
  id?: string
  document_type: 'image' | 'onedrive'
  label?: string | null
  url?: string | null
  position?: number
}