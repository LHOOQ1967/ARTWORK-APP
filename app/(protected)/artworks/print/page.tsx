
'use client'

import { useEffect, useMemo, useState } from 'react'
import ArtworkSheet from '@/app/components/artwork/ArtworkSheet'
import { supabase } from '@/lib/supabaseClient'
import type { ArtworkPrint } from '@/app/types/artwork'



type SortKey =
  | 'date'
  | 'sale_date'
  | 'artist'
  | 'asking'
  | 'priority'
  | 'status';

type SortDirection = 'desc' | 'asc';

type StatusFilter = 'active' | 'bought' | 'archived' | 'all';

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


    case 'sale_date':
      return artwork.sale_date
        ? new Date(artwork.sale_date).getTime()
        : 0


case 'date': {
  // ✅ Auctions → date de vente
  if (artwork.auctions === true && artwork.sale_date) {
    return new Date(artwork.sale_date).getTime()
  }

  // ✅ Sinon → date de proposition
  return artwork.date_proposition
    ? new Date(artwork.date_proposition).getTime()
    : 0
}


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
  
const [artworks, setArtworks] = useState<ArtworkPrint[]>([])
const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  /* ===== UI state ===== */

const [sortKey, setSortKey] = useState<SortKey>('date')
const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

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
  .from('artwork_print_view')
  .select(`*`)




if (error) {
  console.error(error)
  setArtworks([])
  return
}


      setArtworks(data as ArtworkPrint[])
    } catch (err) {
      console.error(err)
      setArtworks([])
    } finally {
      setLoading(false)
    }
  }

  loadArtworks()
}, [])


function getStatusGroupOrder(artwork: any): number {
  if (artwork.status === 'archived') return 3
  if (artwork.status === 'bought') return 2
  return 1 // active = tout le reste
}



const filteredAndSorted = useMemo(() => {
  const filtered = artworks
    .filter(a => {
      if (statusFilter === 'all') return true
      if (statusFilter === 'archived') return a.status === 'archived'
      if (statusFilter === 'bought') return a.status === 'bought'
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
    // ✅ RÈGLE MÉTIER : tri par sale_date → uniquement œuvres avec sale_date
    .filter(a => {
      if (sortKey === 'sale_date') {
        return !!a.sale_date
      }
      return true
    })

  // ✅ CAS SPÉCIAL : Status = All
  if (statusFilter === 'all') {
    return [...filtered].sort((a, b) => {
      // 1️⃣ tri par groupe de statut
      const ga = getStatusGroupOrder(a)
      const gb = getStatusGroupOrder(b)

      if (ga !== gb) return ga - gb

      // 2️⃣ tri secondaire normal
      const va = getSortValue(a, sortKey)
      const vb = getSortValue(b, sortKey)

      if (va < vb) return sortDirection === 'asc' ? -1 : 1
      if (va > vb) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }

  // ✅ comportement normal
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
    document.documentElement.classList.add('pdf-puppeteer')

    const res = await fetch('/api/pdf/adobe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html: document.documentElement.outerHTML,
        mode: 'puppeteer',
      }),
    })

    document.documentElement.classList.remove('pdf-puppeteer')

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    window.open(url)
  }}
>
  Export PDF (liens actifs)
</button>



<button
className="print-controls no-print"
  onClick={() => {
    setSortKey('date')
    setSortDirection('desc')
    setStatusFilter('active')
    setPriorityFilter('all')
    setAuctionFilter('all')
  }}
>
  Reset
</button>


<div
  className="print-controls no-print"
  style={{
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    rowGap: 12,
    columnGap: 24,
    padding: '12px 16px',
    backgroundColor: '#e9eceb',
    marginBottom: 24,
    alignItems: 'center',
  }}
>
  {/* ===== Row 1 : Sorting ===== */}
  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
    <strong>Sort by</strong>

    <select value={sortKey} onChange={e => setSortKey(e.target.value as any)}>
      <option value="date">Date proposed</option>
      <option value="sale_date">Sale Date</option>
      <option value="artist">Artist</option>
      <option value="asking">Asking price</option>
      <option value="priority">Priority</option>
      <option value="status">Status</option>
    </select>

    <select
      value={sortDirection}
      onChange={e => setSortDirection(e.target.value as any)}
    >
      <option value="desc">Descending</option>
      <option value="asc">Ascending</option>
    </select>
  </div>

  {/* Counter */}
  <div style={{ color: '#555' }}>
    {filteredAndSorted.length} artworks
  </div>

  {/* ===== Row 2 : Filters ===== */}
  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
    <strong>Filter</strong>

    <select
      value={auctionFilter}
      onChange={e =>
        setAuctionFilter(e.target.value as any)
      }
    >
      <option value="all">All market</option>
      <option value="auction">Auction</option>
      <option value="non-auction">Private market</option>
    </select>

    <select
      value={statusFilter}
      onChange={e =>
        setStatusFilter(e.target.value as any)
      }
    >
      <option value="active">Active</option>
      <option value="bought">Bought</option>
      <option value="archived">Archived</option>
      <option value="all">All</option>
    </select>

    <select
      value={priorityFilter}
      onChange={e =>
        setPriorityFilter(e.target.value as any)
      }
    >
      <option value="all">All priorities</option>
      <option value="high">High</option>
      <option value="medium">Medium</option>
      <option value="low">Low</option>
    </select>
  </div>

  {/* Action */}
  <div>
    <button onClick={() => window.print()}>Print</button>
  </div>
</div>






{filteredAndSorted.map(artwork => (
  <ArtworkSheet
    key={artwork.id}
    artwork={artwork}
  />
))}

     
    </main>
  )
}