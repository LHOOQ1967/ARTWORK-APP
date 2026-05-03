
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
  lot?: string | null

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
  check_seller?: boolean | null

  date_acquisition: string | null
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

  // Identité
  title: string | null
  artist_id: string | null

  // Statut & canal
  status: 'draft' | 'viewed' | 'negotiation' | 'bought' | 'archived'
  auctions: boolean

  priority: 'information' | 'medium' | 'high' | null

  // Dates CLÉS
  date_proposition: string | null
  sale_date: string | null
  sale_time?: string | null
  view_date: string | null

  // Market
  asking_price: number | null
  currency: string | null

  // Auction
  auction_link: string | null
  auction_currency: string | null
  estimate_low: number | null
  estimate_high: number | null
  lot?: string | null

  // Result
  sold_hammer: number | null
  sold_premium: number | null

  // Cost
  date_acquisition: string | null
  cost_amount: number | null
  cost_currency: string | null

  // Meta
  notes: string | null
  condition: string | null
  certificate: boolean

  // Relations (optionnelles selon le SELECT)
  artist?: {
    id: string
    first_name: string
    last_name: string
  } | null

  documents?: {
    id: string
    document_type: 'image' | 'onedrive'
    url: string
    position?: number
  }[]

  artwork_proposals?: unknown[]
}


export type ArtworkBase = ArtworkForm | ArtworkWithRelations
// app/types/artwork.ts



export type ArtworkListItem = {
  id: string

  title?: string | null

  artist?: {
    first_name?: string | null
    last_name?: string | null
  } | null

  status?: 'draft' | 'viewed' | 'negotiation' | 'bought' | 'archived' | null
  priority?: 'high' | 'medium' | 'low' | null

  // ✅ MARKET
  date_proposition?: string | null
  asking_price?: number | null
  currency?: string | null

  // ✅ AUCTION (pour les vues mixed si besoin)
  sale_date?: string | null
  estimate_low?: number | null
  estimate_high?: number | null
  auction_currency?: string | null
  lot?: string | null

  date_acquisition: string | null
  cost_amount?: number | null
  cost_currency?: string | null

  documents?: {
    id: string
    document_type: 'image' | 'onedrive'
    url?: string | null
  }[]
  
  // ✅ Champs artiste au niveau racine
  first_name?: string | null
  last_name?: string | null

  // ✅ Images JSON
  images?: {
    id?: string
    url: string
    position?: number
  }[] | null
}

  




export type ArtworkDocument = {
  id: string
  artwork_id: string
  document_type: 'image' | 'onedrive'
  label?: string | null
  url: string                // ✅ obligatoire
  position: number
}



export type ArtworkProposal = {
  id: string
  proposed_at: string | null
  contact: Contact
}


export type Contact = {
  id: string

  company_name?: string | null
  first_name?: string | null
  last_name?: string | null

  email?: string | null
  telephone?: string | null
  city?: string | null
  role?: string | null

  notes?: string | null
}


export type Artist = {
  id: string
  first_name?: string | null
  last_name?: string | null

  year_of_birth?: number | null
  year_of_death?: number | null

  place_of_birth?: string | null
  place_of_death?: string | null

  notes?: string | null
}


export type ArtworkWithRelations = Artwork & {
  
id: string

  title?: string | null
  medium?: string | null        // ✅ AJOUTER
  signature?: string | null
  year_execution?: number | null

  // relations
  documents: ArtworkDocument[]
  artwork_proposals?: ArtworkProposal[]

  status?: 'draft' | 'viewed' | 'negotiation' | 'bought' | 'archived'
  priority?: 'information' | 'medium' | 'high'

  asking_price?: number | null
  currency?: string | null

  auction_contact_id?: string | null
  location_contact_id?: string | null
  buyer_contact_id?: string | null
  destination_contact_id?: string | null


  auction_currency?: string | null
  sale_date?: string | null
  sale_time?: string | null

  estimate_low?: number | null
  estimate_high?: number | null
  lot?: string | null

  sold_hammer?: number | null
  sold_premium?: number | null
  underbidder?: boolean | null
  guarantee?: boolean | null
  date_acquisition: string | null
  cost_amount?: number | null
  cost_currency?: string | null

  insurance_value?: number | null
  insurance_currency?: string | null

  height_cm?: number | null
  width_cm?: number | null
  depth_cm?: number | null

  certificate?: boolean | null
  certificate_location_contact_id?: string | null
  check_seller?: boolean | null

  notes?: string | null

  artist?: Artist | null
  auction_house?: Contact | null
  proposedBy?: Contact | null
  proposed_by_id?: string | null 
  location?: Contact | null
  destination?: Contact | null
  destination_contact?: Contact | null
  certificateLocation?: Contact | null
  buyer?: Contact | null
  auctionContact?: Contact | null

}
 

export type ArtworkPrint = {
  id: string

  title?: string | null
  medium?: string | null
  signature?: string | null
  year_execution?: number | null

  height_cm?: number | null
  width_cm?: number | null
  depth_cm?: number | null

  status?: 'draft' | 'viewed' | 'negotiation' | 'bought' | 'archived'
  priority?: 'information' | 'medium' | 'high'

  date_proposition?: string | null
  view_date?: string | null
  condition?: string | null
  notes?: string | null

  currency?: string | null
  asking_price?: number | null

  auctions?: boolean | null
  auction_link?: string | null
  sale_date?: string | null
  sale_time?: string | null
  estimate_low?: number | null
  estimate_high?: number | null
  auction_currency?: string | null
  lot?: string | null

  sold_hammer?: number | null
  sold_premium?: number | null
  underbidder?: boolean | null
  guarantee?: boolean | null

  date_acquisition: string | null
  cost_amount?: number | null
  cost_currency?: string | null
  insurance_value?: number | null
  insurance_currency?: string | null

  artist?: Artist | null
  proposedBy?: Contact | null
  buyer?: Contact | null
  location?: Contact | null
  destination?: Contact | null
  certificate?: boolean | null
  certificateLocation?: Contact | null

  documents?: ArtworkDocument[]
  
  proposals?: {
    contact_id: string
    contact_label?: string
  }[] | null


}




