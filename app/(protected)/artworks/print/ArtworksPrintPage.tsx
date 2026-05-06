

'use client'


import { useEffect, useMemo, useState } from 'react'
import ArtworkSheet from '@/components/artwork/ArtworkSheet'
import { supabase } from '@/lib/supabaseBrowser'
import type { ArtworkPrint } from '@/app/(protected)/types/artwork'
import { resolveSource } from '@/lib/viewerSources'
import { useSessionProfile } from '@/contexts/SessionContext'



/* ======================
   Types
   ====================== */

type SortKey =
  | 'date'
  | 'sale_date'
  | 'artist'
  | 'asking'
  | 'priority'
  | 'status'

type SortDirection = 'desc' | 'asc'
type StatusFilter = 'active' | 'bought' | 'archived' | 'all'

/* ======================
   Sort orders
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


function getSortValue(artwork: any, sortKey: SortKey) {
  switch (sortKey) {
    case 'artist':
      return artwork.artist?.last_name?.toLowerCase() ?? ''
    case 'sale_date':
      return artwork.sale_date
        ? new Date(artwork.sale_date).getTime()
        : 0
    case 'date':
      if (artwork.auctions && artwork.sale_date) {
        return new Date(artwork.sale_date).getTime()
      }
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
  artworks: ArtworkPrint[],
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

function getStatusGroupOrder(artwork: ArtworkPrint): number {
  if (artwork.status === 'archived') return 3
  if (artwork.status === 'bought') return 2
  return 1
}


function sortFloracMarket(artworks: ArtworkPrint[]) {
  return [...artworks].sort((a, b) => {
    const groupA = getStatusGroupOrder(a)
    const groupB = getStatusGroupOrder(b)

    // 1️⃣ Ordre des groupes : active → bought → archived
    if (groupA !== groupB) {
      return groupA - groupB
    }

    // 2️⃣ Même groupe → date_proposition DESC pour TOUS
    const dateA = a.date_proposition
      ? new Date(a.date_proposition).getTime()
      : 0

    const dateB = b.date_proposition
      ? new Date(b.date_proposition).getTime()
      : 0

    // ✅ TOUS → DESC
    return dateB - dateA
  })
}


function sortFloracAuction(artworks: ArtworkPrint[]) {
  return [...artworks].sort((a, b) => {
    const groupA = getStatusGroupOrder(a)
    const groupB = getStatusGroupOrder(b)

    // ✅ ordre des groupes : active → bought → archived
    if (groupA !== groupB) {
      return groupA - groupB
    }

    // ✅ même groupe → tri par date
    const dateA = a.date_proposition
      ? new Date(a.date_proposition).getTime()
      : 0
    const dateB = b.date_proposition
      ? new Date(b.date_proposition).getTime()
      : 0

    // ✅ actives → ASC
    if (groupA === 1) {
      return dateA - dateB
    }

    // ✅ bought + archived → DESC
    return dateB - dateA
  })
}



export default function ArtworksPrintPage({
  preset,
}: {
  preset: string
}) {
console.log('[ArtworksPrintPage] preset reçu =', preset)
  const { role } = useSessionProfile()

const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
  if (preset === 'active') return 'active'
  if (preset === 'bought') return 'bought'
  if (preset === 'archived') return 'archived'
  return 'all'
})


const [priorityFilter, setPriorityFilter] =
  useState<'low' | 'medium' | 'high' | 'all'>('all')

const [auctionFilter, setAuctionFilter] =
  useState<'all' | 'auction' | 'non-auction'>('all')

const [proposedToFilter, setProposedToFilter] =
  useState<string | 'all'>('all')


const [sortKey, setSortKey] = useState<SortKey>(() => {
  if (preset === 'active') return 'date'
  if (preset === 'bought') return 'sale_date'
  return 'date'
})


const [sortDirection, setSortDirection] =
  useState<SortDirection>('desc')

const [exporting, setExporting] =
  useState(false)

  const canEdit =
    role === 'Administrator' ||
    role === 'Editor'

  const [artworks, setArtworks] = useState<ArtworkPrint[]>([])
  const [loadingData, setLoadingData] = useState(true)



  useEffect(() => {
    if (!role) return

    const loadArtworks = async () => {
      const source = resolveSource('prints', role)
      const { data } = await supabase.from(source).select('*')
      setArtworks((data as ArtworkPrint[]) ?? [])
      setLoadingData(false)
    }

    loadArtworks()
  }, [role])

  // … tri + filtres + render inchangés …



const filteredAndSorted = useMemo(() => {


  if (preset === 'florac-market') {
    const filtered = artworks
      // ✅ NON-auctions uniquement
      .filter(a => !a.auctions)

      // ✅ Proposed to Florac uniquement
      .filter(a =>
        (a.proposals ?? []).some(
          p => p.contact_id === 'abbcf211-f94e-4435-918e-775390164cb2'
        )
      )

    // ✅ TRI MÉTIER : TOUS DESC
    return sortFloracMarket(filtered)
  }

  // ✅ PRESET FLORAC AUCTION (existant)
  if (preset === 'florac-auction') {
    const filtered = artworks
      .filter(a => a.auctions === true)
      .filter(a =>
        (a.proposals ?? []).some(
          p => p.contact_id === 'abbcf211-f94e-4435-918e-775390164cb2'
        )
      )

    return sortFloracAuction(filtered)
  }

  // ✅ PRESET MÉTIER : FLORAC AUCTION
  if (preset === 'florac-auction') {
    const filtered = artworks
      // ✅ Auction only
      .filter(a => a.auctions === true)

      // ✅ Proposed to Florac uniquement (ID sécurisé)
      .filter(a =>
        (a.proposals ?? []).some(
          p => p.contact_id === 'abbcf211-f94e-4435-918e-775390164cb2'
        )
      )

    // ✅ TRI MÉTIER SPÉCIFIQUE (active ASC, bought/archived DESC)
    return sortFloracAuction(filtered)
  }

  // ================================
  // ✅ LOGIQUE STANDARD (INCHANGÉE)
  // ================================

  let filtered = artworks
    .filter(a =>
      statusFilter === 'all'
        ? true
        : statusFilter === 'archived'
        ? a.status === 'archived'
        : statusFilter === 'bought'
        ? a.status === 'bought'
        : a.status !== 'archived' && a.status !== 'bought'
    )
    .filter(a =>
      priorityFilter === 'all' ? true : a.priority === priorityFilter
    )
    .filter(a =>
      auctionFilter === 'all'
        ? true
        : auctionFilter === 'auction'
        ? a.auctions
        : !a.auctions
    )
    .filter(a =>
      proposedToFilter === 'all'
        ? true
        : (a.proposals ?? []).some(
            p => p.contact_id === proposedToFilter
          )
    )

  if (statusFilter === 'all') {
    return [...filtered].sort((a, b) => {
      const ga = getStatusGroupOrder(a)
      const gb = getStatusGroupOrder(b)
      if (ga !== gb) return ga - gb
      return sortArtworks([a, b], sortKey, sortDirection)[0] === a
        ? -1
        : 1
    })
  }

  return sortArtworks(filtered, sortKey, sortDirection)

}, [
  artworks,
  preset,
  statusFilter,
  priorityFilter,
  auctionFilter,
  proposedToFilter,
  sortKey,
  sortDirection,
])


  if (loadingData) {
    return <p style={{ padding: 40 }}>Loading…</p>
  }

  return (
    <main style={{ padding: 40 }}>
      {/* ===== FILTERS / SORTING ===== */}
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

      {filteredAndSorted.map(a => (
        <ArtworkSheet key={a.id} artwork={a}
        canEdit={canEdit} />
      ))}
    </main>
  )
}
