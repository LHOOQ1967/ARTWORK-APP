

'use client'


import { useEffect, useMemo, useState } from 'react'
import ArtworkSheet from '@/components/artwork/ArtworkSheet'
import { supabase } from '@/lib/supabaseBrowser'
import type { ArtworkPrint } from '@/app/(protected)/types/artwork'
import { resolveSource } from '@/lib/viewerSources'
import { useSessionProfile } from '@/contexts/SessionContext'
import SearchSelect from '@/components/ui/SearchSelect'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'



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
  Draft: 1,
  Viewed: 2,
  Negotiation: 3,
  Bought: 4,
  Archived: 99,
}

const PRIORITY_ORDER: Record<string, number> = {
  High: 3,
  Medium: 2,
Information: 1,
}


function getSaleDateTimeMs(artwork: any): number {
  const d = artwork?.sale_date
  if (!d) return 0

  // sale_date peut être "2026-05-15" ou ISO. On garde la date.
  const dateObj = new Date(d)
  if (isNaN(dateObj.getTime())) return 0

  const tRaw = (artwork?.sale_time ?? '').toString().trim()
  if (!tRaw) {
    // Pas d'heure => date seule
    return dateObj.getTime()
  }

  // 1) Formats type "HH:MM" ou "HH:MM:SS"
  const m24 = tRaw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (m24) {
    const hh = Math.min(23, Math.max(0, parseInt(m24[1], 10)))
    const mm = Math.min(59, Math.max(0, parseInt(m24[2], 10)))
    const ss = m24[3] ? Math.min(59, Math.max(0, parseInt(m24[3], 10))) : 0

    const dt = new Date(dateObj)
    dt.setHours(hh, mm, ss, 0)
    return dt.getTime()
  }

  // 2) Format "6:30 PM" / "6 PM" etc.
  const m12 = tRaw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i)
  if (m12) {
    let hh = parseInt(m12[1], 10)
    const mm = m12[2] ? parseInt(m12[2], 10) : 0
    const ampm = m12[3].toUpperCase()

    hh = hh % 12
    if (ampm === 'PM') hh += 12

    const dt = new Date(dateObj)
    dt.setHours(hh, mm, 0, 0)
    return dt.getTime()
  }

  // 3) Dernier recours : essayer de parser "date + time" en ISO-like
  // Exemple: sale_date="2026-05-15" sale_time="18:30:00" => "2026-05-15T18:30:00"
  // Si sale_date est déjà ISO, on peut aussi tenter une concat.
  const datePart = typeof d === 'string' ? d.slice(0, 10) : null
  if (datePart) {
    const combined = new Date(`${datePart}T${tRaw}`)
    if (!isNaN(combined.getTime())) return combined.getTime()
  }

  // Sinon, on ignore l'heure si format exotique
  return dateObj.getTime()
}

/**
 * Date "secondaire" par défaut (tie-breaker) :
 * - auctions => sale_date + sale_time
 * - sinon => date_proposition
 */
function getDefaultDateMs(artwork: any): number {
  if (artwork?.auctions) {
    return getSaleDateTimeMs(artwork)
  }
  return artwork?.date_proposition
    ? new Date(artwork.date_proposition).getTime()
    : 0
}


function getSortValue(artwork: any, sortKey: SortKey) {
  switch (sortKey) {
    case 'artist':
      return artwork.artist?.last_name?.toLowerCase() ?? ''

    case 'sale_date':
      // ✅ date + heure
      return getSaleDateTimeMs(artwork)

    case 'date':
      if (artwork.auctions && artwork.sale_date) {
        // ✅ si tu veux aussi l'heure quand on trie par "date" en mode auction
        return getSaleDateTimeMs(artwork)
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

    // 1) tri principal
    if (va < vb) return direction === 'asc' ? -1 : 1
    if (va > vb) return direction === 'asc' ? 1 : -1

    // 2) ✅ tie-breaker : si priority ou status => tri par date
    if (sortKey === 'status' || sortKey === 'priority') {
      const da = getDefaultDateMs(a)
      const db = getDefaultDateMs(b)

      // groupe: active / bought / archived
      const ga = getStatusGroupOrder(a) // 1=active, 2=bought, 3=archived
      const gb = getStatusGroupOrder(b)

      // Normalement ga===gb ici si tu groupes ailleurs,
      // mais on reste robuste: si différents, on garde l'ordre des groupes
      if (ga !== gb) return ga - gb

      // ✅ Active => date ASC
      if (ga === 1) {
        if (da < db) return -1
        if (da > db) return 1
        return 0
      }

      // ✅ Bought + Archived => date DESC
      if (da < db) return 1
      if (da > db) return -1
    }

    return 0
  })
}



function getStatusGroupOrder(artwork: ArtworkPrint): number {
  if (artwork.status === 'Archived') return 3
  if (artwork.status === 'Bought') return 2
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

  const { role } = useSessionProfile()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()


const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
  if (preset === 'active') return 'active'
  if (preset === 'bought') return 'bought'
  if (preset === 'archived') return 'archived'
  return 'all'
})


const [priorityFilter, setPriorityFilter] =
  useState<'Information' | 'Medium' | 'High' | 'all'>('all')

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
  try {
    const source = resolveSource("prints", role);
    console.log("[prints] source =", source, "role =", role);

    const res = await supabase.from(source).select("*", { count: "exact" });

    
console.log("source =", source);
console.log("res.data[0] =", res.data?.[0]);
console.log("keys =", res.data?.[0] ? Object.keys(res.data[0]) : []);


    const { data, error, status, count } = res;

    // Logs “lisibles”
    console.log("[prints] status/count =", status, count);
    if (error) {
      console.error("[prints] error.message =", (error as any).message);
      console.error("[prints] error.details =", (error as any).details);
      console.error("[prints] error.hint =", (error as any).hint);
      console.error("[prints] error.code =", (error as any).code);

      // Dump complet (utile si la console cache des props)
      console.error("[prints] error dump =", JSON.stringify(error, null, 2));
      // Et aussi l'objet brut
      console.error("[prints] error raw =", error);
    }

    setArtworks((data as ArtworkPrint[]) ?? []);
  } catch (e) {
    console.error("[prints] unexpected error:", e);
    setArtworks([]);
  } finally {
    setLoadingData(false);
  }
};


    loadArtworks()
  }, [role])

  // … tri + filtres + render inchangés …


useEffect(() => {
  // ⚠️ si tu es sur un preset métier (florac-*), on ignore les query params
  if (preset === 'florac-market' || preset === 'florac-auction') return

  const market = searchParams.get('market') // private | auction | all
  const status = searchParams.get('status') // active | bought | archived | all
  const priority = searchParams.get('priority') // High | Medium | Information | all
  const sort = searchParams.get('sort') // date | sale_date | artist | asking | priority | status
  const dir = searchParams.get('dir') // asc | desc
  const proposedTo = searchParams.get('proposedTo') // uuid | all (optionnel)

  // ✅ Market → ton state s'appelle auctionFilter
  if (market === 'private') setAuctionFilter('non-auction')
  else if (market === 'auction') setAuctionFilter('auction')
  else if (market === 'all') setAuctionFilter('all')

  // ✅ Status
  if (status === 'active' || status === 'bought' || status === 'archived' || status === 'all') {
    setStatusFilter(status)
  }

  // ✅ Priority
  if (
    priority === 'High' ||
    priority === 'Medium' ||
    priority === 'Information' ||
    priority === 'all'
  ) {
    setPriorityFilter(priority as any)
  }

  // ✅ Sort key
  if (
    sort === 'date' ||
    sort === 'sale_date' ||
    sort === 'artist' ||
    sort === 'asking' ||
    sort === 'priority' ||
    sort === 'status'
  ) {
    setSortKey(sort)
  }

  // ✅ Direction
  if (dir === 'asc' || dir === 'desc') {
    setSortDirection(dir)
  }

  // ✅ ProposedTo (optionnel)
  if (proposedTo) {
    setProposedToFilter(proposedTo as any)
  }
}, [searchParams, preset])


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
        ? a.status === 'Archived'
        : statusFilter === 'bought'
        ? a.status === 'Bought'
        : a.status !== 'Archived' && a.status !== 'Bought'
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

const isViewer = typeof role === 'string' && role.toLowerCase() === 'viewer'

// ✅ Options Proposed to (pour SearchSelect)

type SearchOption = { id: string; label: string } // adapte si ton type existe déjà

const proposedToOptions: SearchOption[] = useMemo(() => {
  const map = new Map<string, string>()

  for (const a of artworks) {
    const props = Array.isArray(a.proposals) ? a.proposals : []

    for (const p of props) {
      const id = typeof p?.contact_id === 'string' ? p.contact_id.trim() : ''
      const label = typeof p?.contact_label === 'string' ? p.contact_label.trim() : ''

      if (id && label) {
        map.set(id, label)
      }
    }
  }

  return Array.from(map, ([id, label]) => ({ id, label }))
    .sort((x, y) => x.label.localeCompare(y.label, 'fr-CH', { sensitivity: 'base' }))
}, [artworks])


// ✅ style commun pour les <select> afin d'avoir le même look que SearchSelect
const selectBase =
  "w-full rounded-[10px] border border-black/25 bg-white px-3 py-2.5 outline-none focus:ring-2 focus:ring-black/15"
const labelBase =
  "mb-1.5 text-[14px] font-bold tracking-[0.02em]"
const fieldBox =
  "min-w-[240px] flex-[1_1_240px]"


  if (loadingData) {
    return <p style={{ 
    paddingTop: 80,
    paddingLeft: 10,
    paddingRight: 10,
    paddingBottom: 10,
 }}>Loading…</p>
  }

  return (
    <main style={{ 
    paddingTop: 80,
    paddingLeft: 10,
    paddingRight: 10,
    paddingBottom: 10,
 }}>
      {/* ===== FILTERS / SORTING ===== */}



<section className="no-print mb-4 rounded-[14px] border-[3px] border-black/60 bg-[#DCEFE7] p-5 shadow-[0_2px_10px_rgba(0,0,0,0.10)]">
  {/* ========================= */}
  {/* ✅ GRILLE 2 LIGNES (3 COLONNES) */}
  {/* ========================= */}
  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
    {/* ===== LIGNE 1 ===== */}
    {/* Market */}
    <div className="min-w-0 w-full md:w-3/4">
      <div className="mb-1.5 text-[14px] font-bold tracking-[0.02em]">Market</div>
      <select
        value={auctionFilter}
        onChange={e => setAuctionFilter(e.target.value as any)}
        className="w-full rounded-[10px] border border-black/25 bg-white px-1 py-1.5 outline-none focus:ring-2 focus:ring-black/15"
      >
        <option value="all">All market</option>
        <option value="auction">Auction</option>
        <option value="non-auction">Private market</option>
      </select>
    </div>

    {/* Status */}
    <div className="min-w-0 w-full md:w-3/4">
      <div className="mb-1.5 text-[14px] font-bold tracking-[0.02em]">Status</div>
      <select
        value={statusFilter}
        onChange={e => setStatusFilter(e.target.value as any)}
        className="w-full rounded-[10px] border border-black/25 bg-white px-1 py-1.5 outline-none focus:ring-2 focus:ring-black/15"
      >
        <option value="active">Active</option>
        <option value="bought">Bought</option>
        <option value="archived">Archived</option>
        <option value="all">All</option>
      </select>
    </div>

    {/* Priority */}
    <div className="min-w-0 w-full md:w-3/4">
      <div className="mb-1.5 text-[14px] font-bold tracking-[0.02em]">Priority</div>
      <select
        value={priorityFilter}
        onChange={e => setPriorityFilter(e.target.value as any)}
        className="w-full rounded-[10px] border border-black/25 bg-white px-1 py-1.5 outline-none focus:ring-2 focus:ring-black/15"
      >
        <option value="all">All priorities</option>
        <option value="High">High</option>
        <option value="Medium">Medium</option>
        <option value="Information">Information</option>
      </select>
    </div>

    {/* Proposed to */}
    {!isViewer && (
      <div className="min-w-0 w-full md:w-3/4">
        <SearchSelect
          label="Proposed to"
          placeholder="Search contact…"
          valueId={proposedToFilter}
          onChangeId={id => setProposedToFilter(id as any)}
          options={proposedToOptions}
          allLabel="All"
        />
      </div>
    )}

    {/* Sort by */}
    <div className="min-w-0 w-full md:w-3/4">
      <div className="mb-1.5 text-[14px] font-bold tracking-[0.02em]">Sort by</div>
      <select
        value={sortKey}
        onChange={e => setSortKey(e.target.value as any)}
        className="w-full rounded-[10px] border border-black/25 bg-white px-1 py-1.5 outline-none focus:ring-2 focus:ring-black/15"
      >
        <option value="date">Date proposed</option>
        <option value="sale_date">Sale date</option>
        <option value="artist">Artist</option>
        <option value="asking">Asking price</option>
        <option value="priority">Priority</option>
        <option value="status">Status</option>
      </select>
    </div>

    {/* Direction */}
    <div className="min-w-0 w-full md:w-3/4">
      <div className="mb-1.5 text-[14px] font-bold tracking-[0.02em]">Direction</div>
      <select
        value={sortDirection}
        onChange={e => setSortDirection(e.target.value as any)}
        className="w-full rounded-[10px] border border-black/25 bg-white px-1 py-1.5 outline-none focus:ring-2 focus:ring-black/15"
      >
        <option value="desc">Descending</option>
        <option value="asc">Ascending</option>
      </select>
    </div>
  </div>

  <div className="mt-4 flex items-center">
    <div className="text-[1.05rem] font-bold text-[#006039]">
      Total: {filteredAndSorted.length} artworks
    </div>

    <button
      className="ml-auto rounded-[10px] border border-black/25 bg-white px-4 py-2.5 font-semibold hover:bg-black/5"
      onClick={() => {
        setSortKey(preset === 'bought' ? 'sale_date' : 'date')
        setSortDirection('desc')

        setStatusFilter(
          preset === 'active'
            ? 'active'
            : preset === 'bought'
            ? 'bought'
            : preset === 'archived'
            ? 'archived'
            : 'all'
        )

        setPriorityFilter('all')
        setAuctionFilter('all')
        setProposedToFilter('all')

        router.replace(pathname)
      }}
    >
      Reset
    </button>
  </div>
</section>


<div className="print-list">
  {filteredAndSorted.map(a => (
    <div className="print-sheet" key={a.id}>
      <ArtworkSheet artwork={a} canEdit={canEdit} />
    </div>
  ))}
</div>

    </main>
  )
}
