
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import ArtworkSheet from '@/app/components/artwork/ArtworkSheet'
import { supabase } from '@/lib/supabaseClient'
import type { ArtworkPrint } from '@/app/types/artwork'
import { resolveSource } from '@/lib/viewerSources'
import { useSessionProfile } from '@/app/contexts/SessionContext'

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

export default function ArtworksPrintPage() {
  const { profile, loading: sessionLoading } = useSessionProfile()


const canEdit =
  profile?.role === 'Administrator' ||
  profile?.role === 'Editor'


  const [artworks, setArtworks] = useState<ArtworkPrint[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [exporting, setExporting] = useState(false)

  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [priorityFilter, setPriorityFilter] =
    useState<'all' | 'high' | 'medium' | 'low'>('all')
  const [auctionFilter, setAuctionFilter] =
    useState<'all' | 'auction' | 'non-auction'>('all')
  const [proposedToFilter, setProposedToFilter] =
    useState<string | 'all'>('all')

  const searchParams = useSearchParams()

  useEffect(() => {
    if (!profile) return

    const loadArtworks = async () => {
      const source = resolveSource('prints', profile.role)
      const { data } = await supabase.from(source).select('*')
      setArtworks((data as ArtworkPrint[]) ?? [])
      setLoadingData(false)
    }

    loadArtworks()
  }, [profile])

  const filteredAndSorted = useMemo(() => {
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
    statusFilter,
    priorityFilter,
    auctionFilter,
    proposedToFilter,
    sortKey,
    sortDirection,
  ])

  if (sessionLoading || loadingData) {
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
