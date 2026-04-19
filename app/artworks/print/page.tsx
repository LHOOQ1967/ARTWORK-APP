
'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchWithAuth } from '@/lib/fetchWithAuth'
import ArtworkSheet from '@/app/components/artwork/ArtworkSheet'


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
function sortArtworks(
  artworks: any[],
  artists: any[],
  sortKey: string,
  direction: 'asc' | 'desc'
) {
  return [...artworks].sort((a, b) => {
    let va: any
    let vb: any

    switch (sortKey) {
      case 'artist':

  const artistA = artists.find(ar => ar.id === a.artist_id)
  const artistB = artists.find(ar => ar.id === b.artist_id)

  va = artistA?.last_name || ''
  vb = artistB?.last_name || ''

        break

      case 'date':
        va = a.date_proposition
          ? new Date(a.date_proposition).getTime()
          : 0
        vb = b.date_proposition
          ? new Date(b.date_proposition).getTime()
          : 0
        break

      case 'asking':
        va = a.asking_price ?? 0
        vb = b.asking_price ?? 0
        break

      case 'priority':
        va = PRIORITY_ORDER[a.priority] ?? 0
        vb = PRIORITY_ORDER[b.priority] ?? 0
        break

      case 'status':
        va = STATUS_ORDER[a.status] ?? 99
        vb = STATUS_ORDER[b.status] ?? 99
        break

      default:
        return 0
    }

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
  const [artworks, setArtworks] = useState<any[]>([])
  const [artists, setArtists] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  /* ===== UI state ===== */
  const [sortKey, setSortKey] =
    useState<'artist' | 'date' | 'asking' | 'priority' | 'status'>('artist')

  const [sortDirection, setSortDirection] =
    useState<'asc' | 'desc'>('asc')

  const [statusFilter, setStatusFilter] =
    useState<'active' | 'archived' | 'all'>('active')

  const [priorityFilter, setPriorityFilter] =
    useState<'all' | 'high' | 'medium' | 'low'>('all')

const [auctionFilter, setAuctionFilter] =
  useState<'all' | 'auction' | 'non-auction'>('all')



  /* ======================
     Data loading
     ====================== */

 
useEffect(() => {
  let cancelled = false

  async function loadAll() {
    try {
      // 1️⃣ artworks
      const artworksRes = await fetchWithAuth('/api/artworks')
      if (!artworksRes.ok) return
      const artworksJson = await artworksRes.json()
      if (cancelled) return
      setArtworks(Array.isArray(artworksJson) ? artworksJson : [])

      // 2️⃣ references
      const [artistsRes, documentsRes, contactsRes] = await Promise.all([
        fetchWithAuth('/api/artists'),
        fetchWithAuth('/api/documents'),
        fetchWithAuth('/api/contacts'),
      ])

      const artistsJson = artistsRes.ok ? await artistsRes.json() : []
      const documentsJson = documentsRes.ok ? await documentsRes.json() : []
      const contactsJson = contactsRes.ok ? await contactsRes.json() : []

      if (cancelled) return

      setArtists(Array.isArray(artistsJson) ? artistsJson : artistsJson.data || [])
      setDocuments(Array.isArray(documentsJson) ? documentsJson : documentsJson.data || [])
      setContacts(Array.isArray(contactsJson) ? contactsJson : contactsJson.data || [])

    } catch (err) {
      console.error('PRINT load error', err)
      setArtworks([])
      setArtists([])
      setDocuments([])
      setContacts([])
    } finally {
      if (!cancelled) setLoading(false)
    }
  }

  loadAll()
  return () => {
    cancelled = true
  }
}, [])
 





  /* ======================
     Hydration (clé !)
     ====================== */



const hydratedArtworks = useMemo(() => {
  return artworks.map(a => {
    const artistId = a.artist_id ?? null

    return {
      ...a,

      // ✅ Artiste (comme /artworks/[id])
      artist:
        artists.find(ar => ar.id === artistId) || null,

      // ✅ Documents liés à l’œuvre
      documents:
        documents.filter(d => d.artwork_id === a.id),

      // ✅ Contacts
      proposedBy:
        contacts.find(c => c.id === a.proposed_by_id) || null,

      location:
        contacts.find(c => c.id === a.location_contact_id) || null,

      certificateLocation:
        contacts.find(
          c => c.id === a.certificate_location_contact_id
        ) || null,
    }
  })
}, [artworks, artists, documents, contacts])





  /* ======================
     Filter
     ====================== */

const filtered = hydratedArtworks
  .filter(a => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'archived') return a.status === 'archived'
    return a.status !== 'archived'
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

    

  /* ======================
     Sort
     ====================== */
  const sorted = sortArtworks(filtered, artists, sortKey, sortDirection)

  if (loading) {
    return <p style={{ padding: 40 }}>Loading…</p>
  }



  return (
    <main style={{ padding: 40 }}>
      {/* ===== Controls (screen only) ===== */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 0, backgroundColor: '#a8aaa9' }}> Tri </div>
      <div className="print-controls" style={{ display: 'flex', gap: 12, marginBottom: 24, backgroundColor: '#a8aaa9' }}>
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
          onChange={e => setStatusFilter(e.target.value as any)}
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>

        <select
          value={priorityFilter}
          onChange={e => setPriorityFilter(e.target.value as any)}
        >
          <option value="all">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <button onClick={() => window.print()}>Print</button>
      </div>

      {/* ===== Printable sheets ===== */}
      {sorted.map(artwork => (
        <ArtworkSheet key={artwork.id} artwork={artwork} />
      ))}
    </main>
  )
}
