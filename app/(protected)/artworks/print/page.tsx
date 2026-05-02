
'use client'

import { useEffect, useMemo, useState } from 'react'
import ArtworkSheet from '@/app/components/artwork/ArtworkSheet'
import { supabase } from '@/lib/supabaseClient'
import type { ArtworkPrint } from '@/app/types/artwork'
import { useSearchParams } from 'next/navigation'




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



function sortArtworksForPrint(
  artworks: ArtworkPrint[],
  sortKey: SortKey,
  sortDirection: SortDirection
) {
  return [...artworks].sort((a, b) => {
    const va = getSortValue(a, sortKey)
    const vb = getSortValue(b, sortKey)

    if (va < vb) return sortDirection === 'asc' ? -1 : 1
    if (va > vb) return sortDirection === 'asc' ? 1 : -1
    return 0
  })
}
``





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
const [exporting, setExporting] = useState(false)
  /* ===== UI state ===== */

const [sortKey, setSortKey] = useState<SortKey>('date')
const [sortDirection, setSortDirection] = useState<SortDirection>('desc')


const [statusFilter, setStatusFilter] =
  useState<StatusFilter>('all')





  const [priorityFilter, setPriorityFilter] =
    useState<'all' | 'high' | 'medium' | 'low'>('all')

const [auctionFilter, setAuctionFilter] =
  useState<'all' | 'auction' | 'non-auction'>('all')

const [proposedToFilter, setProposedToFilter] =
  useState<string | 'all'>('all')


const searchParams = useSearchParams()

useEffect(() => {
  const k = searchParams.get('sortKey')
  const d = searchParams.get('sortDirection')
  const s = searchParams.get('statusFilter')
  const p = searchParams.get('priorityFilter')
  const a = searchParams.get('auctionFilter')
  const pt = searchParams.get('proposedToFilter')

  if (k) setSortKey(k as SortKey)
  if (d) setSortDirection(d as SortDirection)
  if (s) setStatusFilter(s as StatusFilter)
  if (p) setPriorityFilter(p as any)
  if (a) setAuctionFilter(a as any)
  if (pt) setProposedToFilter(pt as any)
}, [searchParams])



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

    
.filter(a => {
  if (proposedToFilter === 'all') return true

  // ✅ artwork doit avoir au moins une proposal vers ce contact
  return (a.proposals ?? []).some(
    (p: any) => p.contact_id === proposedToFilter
  )
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
  proposedToFilter,
  sortKey,
  sortDirection,
])


  if (loading) {
    return <p style={{ padding: 40 }}>Loading…</p>
  }

const marketArtworks = filteredAndSorted.filter(
  a => !a.auctions && a.status !== 'bought'
)

const auctionArtworks = filteredAndSorted.filter(
  a => a.auctions === true
)

const boughtArtworks = filteredAndSorted.filter(
  a => a.status === 'bought'
)
return (
    <main style={{ padding: 40 }}>
      {/* ===== Controls (screen only) ===== */}

<section 
  style={{
    padding: '12px 16px',
    backgroundColor: '#b2dee6',
    marginBottom: 10,
    alignItems: 'center',
  }}>
<div
  className="print-controls no-print"
  style={{
   
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    rowGap: 12,
    columnGap: 24,
    padding: '12px 16px',
    backgroundColor: '#b2dee6',
    marginBottom: 18,
    alignItems: 'center',
    border: '3px solid rgba(0, 0, 0, 0.61)', // ✅ bordure fine
    borderRadius: 12,    
  }}
>


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

<select
  value={proposedToFilter}
  onChange={e =>
    setProposedToFilter(e.target.value as any)
  }
>
  <option value="all">Proposed to (all)</option>

  {Array.from(
    new Map(
      artworks
        .flatMap(a => a.proposals ?? [])
        .map(p => [
          p.contact_id,
          {
            id: p.contact_id,
            label: p.contact_label,
          },
        ])
    ).values()
  ).map(c => (
    <option key={c.id} value={c.id}>
      {c.label}
    </option>
  ))}
</select>
  </div>

  {/* Counter */}
  <div style={{ color: '#f80808' }}>
    {filteredAndSorted.length} artworks
  </div>

</div>


<div
  className="print-controls no-print"
  style={{
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    rowGap: 12,
    columnGap: 24,
    padding: '12px 16px',
    backgroundColor: '#b2dee6',
    marginBottom: 12,
    alignItems: 'center',
    border: '3px solid rgba(0, 0, 0, 0.61)', // ✅ bordure fine
    borderRadius: 12,    
    }}
>
  {/* ===== Row 1 : Sorting ===== */}
  <div style={{ display: 'flex', gap: 16, alignItems: 'center',  }}>
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
</div>

<div
  className="print-controls no-print"
  style={{
    display: 'flex',
    justifyContent: 'space-between', // ✅ gauche / droite
    alignItems: 'center',
  }}
>
<button className="edit-button"

  onClick={() => {
    setSortKey('date')
    setSortDirection('desc')
    setStatusFilter('active')
    setPriorityFilter('all')
    setAuctionFilter('all')
    setProposedToFilter('all') // ✅ ICI
  }}
>
  Reset
</button>

  <button
    className="edit-button"
    disabled={exporting}
    style={{
      cursor: exporting ? 'wait' : 'pointer',
    }}
    onClick={async () => {
      try {
        setExporting(true)

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
      } finally {
        setExporting(false)
      }
    }}
  >
    {exporting ? '⌛ Exporting…' : 'Export PDF'}
  </button>
</div>
</section>

{/* ===== Primary / Private Market ===== */}
{marketArtworks.length > 0 && (
  <section style={{ marginTop: 40 }}>
    <h1>Primary & Private Market</h1>

    {marketArtworks.map(artwork => (
      <ArtworkSheet
        key={artwork.id}
        artwork={artwork}
      />
    ))}
  </section>
)}

{/* ===== Auction ===== */}
{auctionArtworks.length > 0 && (
  <section style={{ marginTop: 60 }}>
    <h1>Auction</h1>

    {auctionArtworks.map(artwork => (
      <ArtworkSheet
        key={artwork.id}
        artwork={artwork}
      />
    ))}
  </section>
)}

{/* ===== Bought ===== */}
{boughtArtworks.length > 0 && (
  <section style={{ marginTop: 60 }}>
    <h1>Bought</h1>

    {boughtArtworks.map(artwork => (
      <ArtworkSheet
        key={artwork.id}
        artwork={artwork}
      />
    ))}
  </section>
)}

  </main>
  )
}