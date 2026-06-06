
/* =========================================
   BASE TYPES
========================================= */

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

export type ArtworkDocument = {
  id: string
  artwork_id: string
  document_type: 'image' | 'onedrive' | 'link'
  label?: string | null
  url: string
  position?: number | null
  created_at?: string | null
}

export type ArtworkProposal = {
  id: string
  contact_id?: string | null
  proposed_at?: string | null

  contact_label?: string

  contact?: Contact | null
  proposedTo?: Contact | null
}


/* =========================================
   CORE TYPE (SOURCE OF TRUTH FRONTEND)
========================================= */


export type ArtworkFull = {
  id: string

  /* ---------- identité ---------- */
  title?: string | null
  medium?: string | null
  signature?: string | null
  year_execution?: number | null

  height_cm?: number | null
  width_cm?: number | null
  depth_cm?: number | null

  /* ---------- statut ---------- */
  status?: 'Draft' | 'Viewed' | 'Negotiation' | 'Bought' | 'Archived'
  priority?: 'Information' | 'Medium' | 'High'
  acquired?: boolean | null

  /* ---------- dates ---------- */
  date_proposition?: string | null
  view_date?: string | null
  date_acquisition?: string | null

  /* ---------- informations ---------- */
  condition?: string | null
  notes?: string | null

  /* ---------- pricing ---------- */
  currency?: string | null
  asking_price?: number | null

  cost_amount?: number | null
  cost_currency?: string | null
  commission_blondeau?: number | null

  insurance_value?: number | null
  insurance_currency?: string | null

  /* ---------- auction ---------- */
  auctions?: boolean | null

  sale_date?: string | null
  sale_time?: string | null
  auction_link?: string | null
  lot?: string | null

  estimate_low?: number | null
  estimate_high?: number | null
  auction_currency?: string | null

  guarantee?: boolean | null

  auction_max_hammer?: number | null
  auction_max_premium?: number | null

  sold_hammer?: number | null
  sold_premium?: number | null
  underbidder?: boolean | null

  /* ---------- ✅ NEW : rapport héritier ---------- */
  rapport_heritier?: boolean | null
  rapport_heritier_document_id?: string | null
  rapport_heritier_document?: ArtworkDocument | null

  /* ---------- relations ---------- */
  artist?: Artist | null

  proposedBy?: Contact | null
  buyer?: Contact | null
  location?: Contact | null
  destination?: Contact | null
  certificateLocation?: Contact | null
  auctionContact?: Contact | null

  /* ---------- arrays ---------- */
  proposals?: ArtworkProposal[] | null
  documents?: ArtworkDocument[] | null
  images?: ArtworkDocument[] | null

  /* ---------- computed / logs ---------- */
  proposed_by_name?: string | null
  buyer_id?: string | null

  last_changed_at?: string | null
  changed_fields?: string[] | null
  changed_diff?: any

  /* ---------- legacy ---------- */
  certificate?: boolean | null
  certificate_location?: string | null
  location_of_work?: string | null
  check_seller?: boolean | null

  updated_at?: string | null
}



/* =========================================
   DERIVED TYPES (UTILISATION UI)
========================================= */

/* ✅ PRINT = FULL */
export type ArtworkPrint = ArtworkFull


/* ✅ LIST (léger, performant) */
export type ArtworkListItem = Pick<
  ArtworkFull,
  | 'id'
  | 'title'
  | 'artist'
  | 'status'
  | 'priority'
  | 'date_proposition'
  | 'asking_price'
  | 'currency'
  | 'sale_date'
  | 'estimate_low'
  | 'estimate_high'
  | 'auction_currency'
  | 'auction_max_hammer'
  | 'auction_max_premium'
  | 'lot'
  | 'date_acquisition'
  | 'cost_amount'
  | 'cost_currency'
  | 'commission_blondeau'
  | 'updated_at'
  | 'images'
>


/* =========================================
   FORM TYPE (INPUT / EDIT)
========================================= */

export type ArtworkForm = {
  id?: string

  title: string | null
  medium: string | null
  signature: string | null
  year_execution: number | null

  status: 'Draft' | 'Viewed' | 'Negotiation' | 'Bought' | 'Archived'
  priority: 'Information' | 'Medium' | 'High'
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
  auction_max_hammer?: number | null
  auction_max_premium?: number | null

  sold_hammer: number | null
  sold_premium: number | null
  underbidder: boolean
  guarantee: boolean

  view_date: string | null
  condition: string | null
  notes: string | null
  certificate: boolean

  date_acquisition: string | null
  cost_amount: number | null
  cost_currency: string | null
  commission_blondeau?: number | null
  insurance_value: number | null
  insurance_currency: string | null

  height_cm: number | null
  width_cm: number | null
  depth_cm: number | null

rapport_heritier: boolean
rapport_heritier_document_id: string | null

  acquired?: boolean
}
