
'use client'

import { useEffect, useMemo, useState } from 'react'
import ArtworkSheet from '@/app/components/artwork/ArtworkSheet'
import { supabase } from '@/lib/supabaseClient'


type SortKey = 'artist' | 'date' | 'asking' | 'priority' | 'status'
type SortDirection = 'asc' | 'desc'
type StatusFilter = 'active' | 'bought' | 'archived' | 'all'


/* ======================
   Sort orders (métier)
   ====================== */
const STATUS_ORDER: Record<string, number> = {
  draft: 1,
  viewed: 2,
  negotiation: 3,
  bought: 4,
  archived: 99,
}

const PRIORITY_ORDER: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
}



/* ======================
   Sorting helper
   ====================== */

function getSortValue(artwork: any, sortKey: SortKey) {
  switch (sortKey) {
    case 'artist':
      return artwork.artist?.last_name?.toLowerCase() ?? ''

    case 'date':
      return artwork.date_proposition
        ? new Date(artwork.date_proposition).getTime()
        : 0

    case 'asking':
      return artwork.asking_price ?? 0

    case 'priority':
      return PRIORITY_ORDER[artwork.priority] ?? 0

    case 'status':
      return STATUS_ORDER[artwork.status] ?? 99
  }
}


function sortArtworks(
  artworks: any[],
  sortKey: SortKey,
  direction: SortDirection
) {
  return [...artworks].sort((a, b) => {
    const va = getSortValue(a, sortKey)
    const vb = getSortValue(b, sortKey)

    if (va < vb) return direction === 'asc' ? -1 : 1
    if (va > vb) return direction === 'asc' ? 1 : -1
    return 0
  })
}


/* ======================
   Page
   ====================== */

export default function ArtworksPrintPage() {
  /* ======================
     State
     ====================== */
  const [artworks, setArtworks] = useState<Artwork[]>([])
  const [artists, setArtists] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  /* ===== UI state ===== */

const [sortKey, setSortKey] = useState<SortKey>('artist')
const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

const [statusFilter, setStatusFilter] =
  useState<StatusFilter>('active')




  const [priorityFilter, setPriorityFilter] =
    useState<'all' | 'high' | 'medium' | 'low'>('all')

const [auctionFilter, setAuctionFilter] =
  useState<'all' | 'auction' | 'non-auction'>('all')



  /* ======================
     Data loading
     ====================== */

 
useEffect(() => {
  const loadArtworks = async () => {
    try {


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
      url
    ),
    auctionContact:contacts!artworks_auction_contact_id_fkey (
      id,
      first_name,
      last_name
    ),
    proposedBy:contacts!artworks_proposed_by_id_fkey (
      id,
      first_name,
      last_name
    ),
    location:contacts!artworks_location_contact_fkey (
      id,
      first_name,
      last_name
    ),
    certificateLocation:contacts!artworks_certificate_location_contact_id_fkey (
      id,
      first_name,
      last_name
    ),
    buyer:contacts!artworks_buyer_contact_id_fkey (
      id,
      first_name,
      last_name
    ),
    destination:contacts!artworks_destination_contact_id_fkey (
      id,
      first_name,
      last_name
    )
  `)



      if (error) {
        console.error(error)
        setArtworks([])
        return
      }

      setArtworks(data ?? [])
    } catch (err) {
      console.error(err)
      setArtworks([])
    } finally {
      setLoading(false)
    }
  }

  loadArtworks()
}, [])


const filteredAndSorted = useMemo(() => {
  const filtered = artworks

.filter(a => {
  if (statusFilter === 'all') return true

  if (statusFilter === 'archived') {
    return a.status === 'archived'
  }

  if (statusFilter === 'bought') {
    return a.status === 'bought'
  }

  // statusFilter === 'active'
  return a.status !== 'archived' && a.status !== 'bought'
})

    .filter(a => {
      if (priorityFilter === 'all') return true
      return a.priority === priorityFilter
    })
    .filter(a => {
      if (auctionFilter === 'all') return true
      if (auctionFilter === 'auction') return a.auctions === true
      return a.auctions !== true
    })

  return sortArtworks(filtered, sortKey, sortDirection)
}, [
  artworks,
  statusFilter,
  priorityFilter,
  auctionFilter,
  sortKey,
  sortDirection,
])




  if (loading) {
    return <p style={{ padding: 40 }}>Loading…</p>
  }



  return (
    <main style={{ padding: 40 }}>
      {/* ===== Controls (screen only) ===== */}


<button
  className="print-controls no-print"
  onClick={async () => {
    const res = await fetch('/api/pdf/adobe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html: document.documentElement.outerHTML,
      }),
    })

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    window.open(url)
  }}
>
  Export PDF (Adobe)
</button>


      <div className="print-controls no-print" style={{ fontWeight: 700, justifyContent: 'center', display: 'flex', gap: 12, marginBottom: 0, backgroundColor: '#e9eceb' }}> Filtre et tri </div>
      <div className="print-controls no-print" style={{ display: 'flex', gap: 12, marginBottom: 24, backgroundColor: '#e9eceb' }}>
        <select value={sortKey} onChange={e => setSortKey(e.target.value as any)}>
          <option value="artist">Artist</option>
          <option value="date">Date proposed</option>
          <option value="asking">Asking price</option>
          <option value="priority">Priority</option>
          <option value="status">Status</option>
        </select>

        <select
          value={sortDirection}
          onChange={e => setSortDirection(e.target.value as any)}
        >
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>


<select
  value={auctionFilter}
  onChange={e =>
    setAuctionFilter(
      e.target.value as 'all' | 'auction' | 'non-auction'
    )
  }
>
  <option value="all">All market</option>
  <option value="auction">Auction only</option>
  <option value="non-auction">Private Market</option>
</select>



<select
  value={statusFilter}
  onChange={e =>
    setStatusFilter(e.target.value as StatusFilter)
  }
>
  <option value="active">Active</option>
  <option value="bought">Bought</option>
  <option value="archived">Archived</option>
  <option value="all">All</option>
</select>


        <button onClick={() => window.print()}>Print</button>
      </div>

      {/* ===== Printable sheets ===== */}


{filteredAndSorted.map(artwork => (
  <ArtworkSheet
    key={artwork.id}
    artwork={artwork}
  />
))}


<button
  className="no-print"
  onClick={async () => {
    const res = await fetch('/api/pdf/adobe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html: document.documentElement.outerHTML,
      }),
    })

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    window.open(url)
  }}
>
  Export PDF (Adobe)
</button>

      
    </main>
  )
}