
'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import ArtworkList from '@/components/artwork/ArtworkList'
import { supabase } from '@/lib/supabaseBrowser'
import type { ArtworkListItem } from '@/app/(protected)/types/artwork'
import { useSessionProfile } from '@/contexts/SessionContext'
import { resolveSource } from '@/lib/viewerSources'
import SearchSelect from '@/components/ui/SearchSelect'

type Props = {
  title?: string
  fixedProposedToId?: string
  forcedStatus?: 'Bought' | 'Archived' | 'Active' 
}

type ContactRow = {
  id: string
  company_name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
}

type ArtistRow = { id: string; last_name: string | null }
type ProposalLinkRow = { artwork_id: string; contact_id: string }


type EditableArtworkField = 'status' | 'priority'

type EditableArtworkValue = string | boolean | null


const chunk = <T,>(arr: T[], size: number) => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

type ArtworkAll = ArtworkListItem & {
  auctions?: boolean | null

  artist_id?: string | null
  proposed_by_id?: string | null

  artist_label?: string | null
  proposed_by_label?: string | null

  proposed_by_name?: string | null

  proposals?: { contact_id: string; contact_label: string }[] | null

  // Champs utiles (selon tes vues)
  date_proposition?: string | null
  date_acquisition?: string | null
  sale_date?: string | null
}


export default function ArtworksIndexPage({
  title,
  fixedProposedToId,
  forcedStatus,   // ✅ AJOUT ICI
}: Props)
 {
  const [artworks, setArtworks] = useState<ArtworkAll[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

const [savingInlineKey, setSavingInlineKey] = useState<string | null>(null)
const [inlineEditError, setInlineEditError] = useState<string | null>(null)
const statusOptions = useMemo(() => {
  const baseStatuses = [
    'Draft',
    'Viewed',
    'Negotiation',
    'Bought',
    'Archived',
  ]

  const existingStatuses = artworks
    .map(a => a.status)
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)

  return Array.from(new Set([...baseStatuses, ...existingStatuses]))
}, [artworks])

const { role } = useSessionProfile()

const normalizedRole = typeof role === 'string' ? role.toLowerCase() : ''

const isViewer = normalizedRole === 'viewer'

const canEditStatusPriority =
  normalizedRole === 'administrator' || normalizedRole === 'editor'

  const marketSource = role ? resolveSource('artworks', role) : null
  const auctionsSource = role ? resolveSource('auctions', role) : null

  // (optionnel) si tu affiches le nom du contact fixé quelque part
  const [fixedProposedToName, setFixedProposedToName] = useState<string | null>(null)

  // Filtres
  const [artistIdFilter, setArtistIdFilter] = useState('all')
  const [proposedByIdFilter, setProposedByIdFilter] = useState('all')
  const [proposedToIdFilter, setProposedToIdFilter] = useState('all')



const [fromDateProposed, setFromDateProposed] = useState<string>('')
  // =========================
  // Helpers date
  // =========================
  const safeDateMs = (v: any) => {
    if (!v) return 0
    const d = new Date(v)
    return isNaN(d.getTime()) ? 0 : d.getTime()
  }

  const dateAcquisitionMs = (a: any) => safeDateMs(a?.date_acquisition)

  // ✅ Archived doivent s’afficher avec "date proposed"
  // On rend le getter robuste (au cas où ta vue auctions n’utilise pas exactement le même nom)
  const datePropositionMs = (a: any) =>
    safeDateMs(a?.date_proposition) ||
    safeDateMs((a as any)?.proposed_at) ||
    safeDateMs((a as any)?.date_proposed) ||
    safeDateMs((a as any)?.proposed_date)

  const saleDateMs = (a: any) => safeDateMs(a?.sale_date)

  // ✅ Date utilisée pour le filtre "From date ..." :
  // - Bought => date_acquisition
  // - Archived => date_proposition (et si absente: fallback sale_date UNIQUEMENT pour ne pas perdre les rows)
  const nonActiveFilterDateMs = (a: any) => {
    if (a?.status === 'Bought') return dateAcquisitionMs(a)
    if (a?.status === 'Archived') {
      const dp = datePropositionMs(a)
      return dp || saleDateMs(a) // fallback pour que les "archived auctions" ne disparaissent pas
    }
    return 0
  }

  // =========================
  // Helpers labels
  // =========================

const contactLabel = (c?: ContactRow | null) => {
  const company = (c?.company_name ?? '').trim()
  if (company) return company

  const full = `${(c?.first_name ?? '').trim()} ${(c?.last_name ?? '').trim()}`.trim()
  if (full) return full

  const email = (c?.email ?? '').trim()
  if (email) return email

  return ''
}


  const artistLabel = (a?: ArtistRow | null) => (a?.last_name ?? '').trim()

  const getArtistId = (a: any): string | null => {
    if (a?.artist_id) return String(a.artist_id)
    if (a?.artist?.id) return String(a.artist.id)
    if (a?.artistId) return String(a.artistId)
    return null
  }

  const getProposedById = (a: any): string | null => {
    if (a?.proposed_by_id) return String(a.proposed_by_id)
    if (a?.proposed_by) return String(a.proposed_by)
    if (a?.proposed_by_contact_id) return String(a.proposed_by_contact_id)
    if (a?.proposedById) return String(a.proposedById)
    if (a?.proposed_by?.id) return String(a.proposed_by.id)
    return null
  }

  const getProposedByLabelFromRow = (a: any): string => {
    const s = (a?.proposed_by_name ?? '').toString().trim()
    return s ? s : ''
  }


const applyForcedStatusFilter = (query: any) => {
  if (!forcedStatus) return query

  if (forcedStatus === 'Active') {
    // Inclut les status null + tous les status sauf Bought / Archived
    return query.or('status.is.null,status.not.in.(Bought,Archived)')
  }

  return query.eq('status', forcedStatus)
}


  // Charger le nom du contact fixé
  useEffect(() => {
    const loadFixedName = async () => {
      if (!fixedProposedToId) {
        setFixedProposedToName(null)
        return
      }

      const { data, error } = await supabase
        .from('contacts')
        .select('company_name, first_name, last_name, email')
        .eq('id', fixedProposedToId)
        .maybeSingle()

      if (error) {
        console.error('Failed to load fixed contact name', error)
        setFixedProposedToName(null)
        return
      }

      const label = contactLabel((data ?? null) as any) || null
      setFixedProposedToName(label)
    }

    loadFixedName()
  }, [fixedProposedToId])

  // Load artworks
  useEffect(() => {
    if (!marketSource || !auctionsSource) {
      setLoading(false)
      return
    }

    const load = async () => {
      try {
        setLoading(true)
        setError(null)

        // Viewer : pas de proposed_to (inutile)
        const shouldLoadProposedTo = !isViewer && !fixedProposedToId


let baseArtworks: any[] = []

if (marketSource === auctionsSource) {
  // ✅ Une seule vue fusionnée : on charge UNE SEULE FOIS

let query = supabase
  .from(marketSource)
  .select('*')

query = applyForcedStatusFilter(query)

const { data, error } = await query

  if (error) {
    console.error(error)
    setError('Failed to load artworks')
    return
  }

  const rows = (Array.isArray(data) ? data : []) as any[]

  // ✅ On garde le vrai champ auctions venant de la vue
  baseArtworks = rows.map(a => ({
    ...a,
    auctions: !!a.auctions,
  }))
} else {
  // ✅ Ancienne logique : deux sources distinctes

let marketQuery = supabase
  .from(marketSource)
  .select('*')

let auctionsQuery = supabase
  .from(auctionsSource)
  .select('*')

marketQuery = applyForcedStatusFilter(marketQuery)
auctionsQuery = applyForcedStatusFilter(auctionsQuery)

const [
  { data: marketData, error: marketError },
  { data: auctionsData, error: auctionsError },
] = await Promise.all([
  marketQuery,
  auctionsQuery,
])



if (marketError) {
  console.error('marketError raw =', marketError)
  console.error('marketError json =', JSON.stringify(marketError, null, 2))
  console.error('marketError message =', (marketError as any)?.message)
  console.error('marketError details =', (marketError as any)?.details)
  console.error('marketError hint =', (marketError as any)?.hint)
  console.error('marketError code =', (marketError as any)?.code)

  setError(
    `Failed to load artworks (market): ${
      (marketError as any)?.message ||
      (marketError as any)?.details ||
      'unknown error'
    }`
  )
  return
}


if (auctionsError) {
  console.error('auctionsError raw =', auctionsError)
  console.error('auctionsError json =', JSON.stringify(auctionsError, null, 2))
  console.error('auctionsError message =', (auctionsError as any)?.message)
  console.error('auctionsError details =', (auctionsError as any)?.details)
  console.error('auctionsError hint =', (auctionsError as any)?.hint)
  console.error('auctionsError code =', (auctionsError as any)?.code)

  setError(
    `Failed to load artworks (auctions): ${
      (auctionsError as any)?.message ||
      (auctionsError as any)?.details ||
      'unknown error'
    }`
  )
  return
}


  const marketRows = (Array.isArray(marketData) ? marketData : []) as any[]
  const auctionsRows = (Array.isArray(auctionsData) ? auctionsData : []) as any[]

  baseArtworks = [
    ...marketRows.map(a => ({ ...a, auctions: false })),
    ...auctionsRows.map(a => ({ ...a, auctions: true })),
  ]
}



        const artworkIds = baseArtworks.map(a => a.id).filter(Boolean) as string[]
        const artistIds = Array.from(new Set(baseArtworks.map(getArtistId).filter(Boolean))) as string[]
        const proposedByIds = Array.from(new Set(baseArtworks.map(getProposedById).filter(Boolean))) as string[]

        // Proposals links
        let proposalLinks: ProposalLinkRow[] = []
        if (shouldLoadProposedTo && artworkIds.length > 0) {
          const batches = chunk(artworkIds, 200)
          for (const ids of batches) {
            const { data, error } = await supabase
              .from('artwork_proposals')
              .select('artwork_id, contact_id')
              .in('artwork_id', ids)

            if (error) {
              console.error(error)
              setError('Failed to load proposals')
              return
            }

            proposalLinks = proposalLinks.concat((data ?? []) as ProposalLinkRow[])
          }
        }

        const proposedToIds = shouldLoadProposedTo
          ? (Array.from(new Set(proposalLinks.map(p => p.contact_id).filter(Boolean))) as string[])
          : []

        // Contacts map
        const allContactIds = Array.from(new Set([...proposedByIds, ...proposedToIds]))
        const contactsMap = new Map<string, ContactRow>()

        if (allContactIds.length > 0) {
          const batches = chunk(allContactIds, 200)
          for (const ids of batches) {
            const { data, error } = await supabase
              .from('contacts')
              .select('id, company_name, first_name, last_name, email')
              .in('id', ids)

            if (error) {
              console.error(error)
              setError('Failed to load contacts')
              return
            }

            for (const c of (data ?? []) as ContactRow[]) {
              contactsMap.set(c.id, c)
            }
          }
        }

        // Artists map
        const artistsMap = new Map<string, ArtistRow>()
        if (artistIds.length > 0) {
          const batches = chunk(artistIds, 200)
          for (const ids of batches) {
            const { data, error } = await supabase.from('artists').select('id, last_name').in('id', ids)
            if (error) {
              console.error(error)
              setError('Failed to load artists')
              return
            }
            for (const a of (data ?? []) as ArtistRow[]) artistsMap.set(a.id, a)
          }
        }

        // Proposals par artwork
        const proposalsByArtwork = new Map<string, { contact_id: string; contact_label: string }[]>()
        if (shouldLoadProposedTo) {
          for (const p of proposalLinks) {
            const c = contactsMap.get(p.contact_id)
            const label = contactLabel(c)
            if (!label) continue
            const arr = proposalsByArtwork.get(p.artwork_id) ?? []
            arr.push({ contact_id: p.contact_id, contact_label: label })
            proposalsByArtwork.set(p.artwork_id, arr)
          }
        }

        // Normalisation finale
        const normalized: ArtworkAll[] = baseArtworks.map(a => {
          const artist_id = getArtistId(a)
          const proposed_by_id = getProposedById(a)

          const art = artist_id ? artistsMap.get(artist_id) : undefined
          const pb = proposed_by_id ? contactsMap.get(proposed_by_id) : undefined

          const artist_label = artistLabel(art)

          const pbFromRow = getProposedByLabelFromRow(a)
          const proposed_by_label = pbFromRow || contactLabel(pb)

          const props = shouldLoadProposedTo ? proposalsByArtwork.get(a.id) ?? [] : []
          const uniqueProps = Array.from(new Map(props.map(x => [x.contact_id, x])).values())

          return {
            ...a,
            artist_id,
            proposed_by_id,
            artist_label,
            proposed_by_label,
            proposals: shouldLoadProposedTo ? uniqueProps : [],
          }
        })

        setArtworks(normalized)
      } catch (e) {
        console.error(e)
        setError('Network error')
      } finally {
        setLoading(false)
      }
    }

    load()
}, [marketSource, auctionsSource, isViewer, fixedProposedToId, forcedStatus])
  // Options filtres
  const artistOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of artworks as any[]) {
      const id = a.artist_id as string | null
      const label = (a.artist_label ?? '').trim()
      if (id && label) map.set(id, label)
    }
    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((x, y) => x.label.localeCompare(y.label, 'fr-CH', { sensitivity: 'base' }))
  }, [artworks])

  const proposedByOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of artworks as any[]) {
      const id = (a.proposed_by_id ?? null) as string | null
      const label = (a.proposed_by_label ?? '').trim()
      if (id && label) map.set(id, label)
    }
    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((x, y) => x.label.localeCompare(y.label, 'fr-CH', { sensitivity: 'base' }))
  }, [artworks])

  const proposedToOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of artworks) {
      const props = Array.isArray(a.proposals) ? a.proposals : []
      for (const p of props) {
        if (p.contact_id && p.contact_label) map.set(p.contact_id, p.contact_label)
      }
    }
    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((x, y) => x.label.localeCompare(y.label, 'fr-CH', { sensitivity: 'base' }))
  }, [artworks])

  // Forcer proposedTo si page dédiée
  useEffect(() => {
    if (!fixedProposedToId) return
    setProposedToIdFilter(fixedProposedToId)
  }, [fixedProposedToId])

  // Filtrage global

const globallyFiltered = useMemo(() => {
  return artworks.filter(a => {
    // ✅ FORCE STATUS


if (forcedStatus) {
  if (forcedStatus === 'Active') {
    if (['Bought', 'Archived'].includes(a.status ?? '')) return false
  } else {
    if (a.status !== forcedStatus) return false
  }
}


    if (artistIdFilter !== 'all' && a.artist_id !== artistIdFilter) return false
    if (proposedByIdFilter !== 'all' && a.proposed_by_id !== proposedByIdFilter) return false

    if (!isViewer && proposedToIdFilter !== 'all') {
      const ids = (Array.isArray(a.proposals) ? a.proposals : []).map(p => p.contact_id)
      if (!ids.includes(proposedToIdFilter)) return false
    }

    return true
  })
}, [
  artworks,
  forcedStatus,     // ✅ important
  artistIdFilter,
  proposedByIdFilter,
  proposedToIdFilter,
  isViewer,
])

  // Active vs Non-active
  const activeAll = useMemo(() => {
    return globallyFiltered.filter(a => !['Bought', 'Archived'].includes(a.status ?? ''))
  }, [globallyFiltered])

  const nonActiveBase = useMemo(() => {
    return globallyFiltered.filter(a => ['Bought', 'Archived'].includes(a.status ?? ''))
  }, [globallyFiltered])

  // ✅ Filtre date:
  // - Bought -> acquisition
  // - Archived -> proposed
  const nonActiveFiltered = useMemo(() => {
    const fromMs = fromDateProposed ? new Date(fromDateProposed + 'T00:00:00').getTime() : 0
    if (!fromMs) return nonActiveBase

    return nonActiveBase.filter(a => {
      const d = nonActiveFilterDateMs(a as any)
      return d && d >= fromMs
    })
  }, [nonActiveBase, fromDateProposed])

  // Sections
  const primaryMarket = useMemo(() => activeAll.filter(a => !((a as any).auctions ?? false)), [activeAll])
  const auctions = useMemo(() => activeAll.filter(a => !!(a as any).auctions), [activeAll])

  const bought = useMemo(() => nonActiveFiltered.filter(a => a.status === 'Bought'), [nonActiveFiltered])
  const archivedAll = useMemo(() => nonActiveFiltered.filter(a => a.status === 'Archived'), [nonActiveFiltered])

  // ✅ Bought fusionné + tri acquisition DESC
  const boughtSorted = useMemo(() => {
    return [...bought].sort((a, b) => dateAcquisitionMs(b) - dateAcquisitionMs(a))
  }, [bought])

  // Archived séparés (comme tu veux)
  const archivedMarket = useMemo(
    () => archivedAll.filter(a => !((a as any).auctions ?? false)),
    [archivedAll]
  )

  const archivedAuctions = useMemo(
    () => archivedAll.filter(a => !!(a as any).auctions),
    [archivedAll]
  )
  
const marketGroups = useMemo(
  () => groupByPriority(primaryMarket),
  [primaryMarket]
)

const auctionGroups = useMemo(
  () => groupByPriority(auctions),
  [auctions]
)


  const totalDisplayed = activeAll.length + nonActiveFiltered.length

  // ✅ Reset : effacer la date (comme demandé)
  const resetFilters = () => {
    setArtistIdFilter('all')
    setProposedByIdFilter('all')
    setFromDateProposed('') // ✅ efface
    setProposedToIdFilter(isViewer ? 'all' : fixedProposedToId ?? 'all')
  }

  if (loading) return <p className="p-10">Loading artworks…</p>
  if (error) return <p className="p-10 text-red-600">{error}</p>

  const baseTitle = title ?? 'Artworks — Private market & Auctions'
  const headerTitle = fixedProposedToId ? `${baseTitle}` : baseTitle



const handleUpdateArtworkField = async (
  artworkId: string,
  field: EditableArtworkField,
  value: EditableArtworkValue
) => {
  if (!canEditStatusPriority) return

  setInlineEditError(null)
  setSavingInlineKey(`${artworkId}:${field}`)

  try {
    const payload =
      field === 'status'
        ? { status: value === '' ? null : value }
        : { priority: value }

    const { error } = await supabase
      .from('artworks')
      .update(payload)
      .eq('id', artworkId)

    if (error) {
      console.error('Failed to update artwork field', error)
      setInlineEditError(
        error.message || 'Failed to update artwork'
      )
      return
    }

    setArtworks(prev =>
      prev.map(a =>
        a.id === artworkId
          ? {
              ...a,
              ...payload,
            }
          : a
      )
    )
  } catch (e) {
    console.error(e)
    setInlineEditError('Network error while updating artwork')
  } finally {
    setSavingInlineKey(null)
  }
}



function groupByPriority(list: ArtworkAll[]) {
  const groups: Record<string, ArtworkAll[]> = {
    High: [],
    Medium: [],
    Information: [],
    Other: [],
  }

  for (const a of list) {
    const key = (a.priority ?? '').toString().trim()

    if (key === 'High') groups.High.push(a)
    else if (key === 'Medium') groups.Medium.push(a)
    else if (key === 'Information') groups.Information.push(a)
    else groups.Other.push(a)
  }

  return groups
}



const buildPrintUrl = ({
  market,
  priority,
  status,
}: {
  market: 'private' | 'auction'
  priority?: string
  status: 'active' | 'bought' | 'archived'
}) => {
  const params = new URLSearchParams()

  params.set('market', market)
  params.set('status', status)
  params.set('sort', 'date')
  params.set('dir', 'desc')

  if (priority && priority !== 'Other') {
    params.set('priority', priority)
  } else {
    params.set('priority', 'all')
  }

  return `/artworks/print?${params.toString()}`
}





  return (
    <main style={mainStyle}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="m-0 text-[1.8rem] font-bold text-white">{headerTitle}</h2>

        {!isViewer && (
        <Link className="no-print" href="/artworks/new">
          <button className="edit-button">+ New artwork</button>
        </Link>)}
      </div>

      {/* Filters */}
      <section className="no-print" style={filtersBoxStyle}>
        {/* LIGNE 1 */}        
        <div
          style={
            window.innerWidth > 768
              ? filtersRowDesktopStyle
              : filtersRowStyle
          }
        >
          <div style={dateBlockStyle}>
            <div style={{ marginBottom: 6, fontSize: 14, fontWeight: 'bold' }}>
              From date{" "}
              <span className="text-[12px] font-normal opacity-70">
                (Bought = acquisition date, Archived = proposed date)
              </span>
              </div>

<div style={dateWrapperStyle}>
  <input
    type="date"
    value={fromDateProposed}
    onChange={e => setFromDateProposed(e.target.value)}
    style={dateInputStyle}
  />
</div>

          </div>

          <SearchSelect
            label="Artist"
            placeholder="Search artist…"
            valueId={artistIdFilter}
            onChangeId={setArtistIdFilter}
            options={artistOptions}
          />
        </div>

        {/* LIGNE 2 */}
        <div style={filtersRowStyle}>
          <SearchSelect
            label="Proposed by"
            placeholder="Search contact…"
            valueId={proposedByIdFilter}
            onChangeId={setProposedByIdFilter}
            options={proposedByOptions}
          />

          {!fixedProposedToId && !isViewer && (
            <SearchSelect
              label="Proposed to"
              placeholder="Search contact…"
              valueId={proposedToIdFilter}
              onChangeId={setProposedToIdFilter}
              options={proposedToOptions}
            />
          )}
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center">
          <div className="text-[1.05rem] font-bold text-[#006039]">Total: {totalDisplayed}</div>

          <button
            onClick={resetFilters}
            className="ml-auto rounded-[10px] border border-black/25 bg-white px-4 py-2.5 font-semibold hover:bg-black/5"
          >
            Reset
          </button>
        </div>
      </section>


{inlineEditError && (
  <div
    className="no-print"
    style={{
      marginBottom: 16,
      padding: '10px 12px',
      borderRadius: 10,
      backgroundColor: '#fff3f3',
      color: '#9b1c1c',
      fontWeight: 600,
      border: '1px solid rgba(155, 28, 28, 0.25)',
    }}
  >
    {inlineEditError}
  </div>
)}

      {/* Primary market (active) */}


{primaryMarket.length > 0 && (
  <section>



<div style={centeredHeaderRowStyle}>
  <h2 style={centeredTitleStyle}>
    Private market ({primaryMarket.length})
  </h2>

  {primaryMarket.length > 0 && (
    <a
      href={buildPrintUrl({ market: 'private', priority: 'all' })}
      target="_blank"
      rel="noopener noreferrer"
      style={printLinkStyle}
    >
      All factsheets
    </a>
  )}
</div>


  {(['High', 'Medium', 'Information', 'Other'] as const).map(priority => {
    const list = marketGroups[priority]
    if (!list.length) return null

    return (
      <div key={priority} style={{ marginTop: 16 }}>
        <div style={subSectionHeaderRowStyle}>

<h3 style={subSectionTitle}>
  Private market — {priority} ({list.length})
</h3>


          <Link
            href={buildPrintUrl({
              market: 'private',
              priority,
            })}
            target="_blank"
            rel="noopener noreferrer"
            style={printLinkStyle}
          >
            Factsheets
          </Link>
        </div>

        <ArtworkList
          artworks={list}
          mode="market"
          canEditStatusPriority={canEditStatusPriority}
          statusOptions={statusOptions}
          savingInlineKey={savingInlineKey}
          onUpdateArtworkField={handleUpdateArtworkField}
        />
      </div>
    )
  })}
</section>
)}




{/* ✅ AUCTIONS */}

{auctions.length > 0 && (
  <section className="mt-8 border-t-2 border-white/30 pt-6">

  {/* ✅ TITRE + BOUTON CENTRÉS ENSEMBLE */}
  <div style={centeredHeaderRowStyle}>
    <h2 style={centeredTitleStyle}>
      Auctions ({auctions.length})
    </h2>

    {auctions.length > 0 && (
      <a
        href={buildPrintUrl({ market: 'auction', priority: 'all' })}
        target="_blank"
        rel="noopener noreferrer"
        style={printLinkStyle}
      >
        All factsheets
      </a>
    )}
  </div>


  {/* ✅ PRIORITY */}
  {(['High', 'Medium', 'Information', 'Other'] as const).map(priority => {
    const list = auctionGroups[priority]
    if (!list.length) return null

    return (
      <div key={priority} style={{ marginTop: 16 }}>

        <div style={subSectionHeaderRowStyle}>
          <h3 style={subSectionTitle}>
            Auctions — {priority} ({list.length})
          </h3>

          <Link
            href={buildPrintUrl({
              market: 'auction',
              priority,
            })}
            target="_blank"
            rel="noopener noreferrer"
            style={printLinkStyle}
          >
            Factsheets
          </Link>
        </div>

        <ArtworkList
          artworks={list}
          mode="auction"
          section="active"
          canEditStatusPriority={canEditStatusPriority}
          statusOptions={statusOptions}
          savingInlineKey={savingInlineKey}
          onUpdateArtworkField={handleUpdateArtworkField}
        />

      </div>
    )
  })}

</section>
)}





      {/* Bought (fusionné) */}

{boughtSorted.length > 0 && (
  <section className="mt-8 border-t-2 border-white/30 pt-6">

    <div style={centeredHeaderRowStyle}>
      <h2 style={centeredTitleStyle}>
        Bought ({boughtSorted.length})
      </h2>

      <Link
        href={buildPrintUrl({
          market: 'private',
          status: 'bought',
          priority: 'all',
        })}
        target="_blank"
        rel="noopener noreferrer"
        style={printLinkStyle}
      >
        All factsheets
      </Link>
    </div>

    <ArtworkList
      artworks={boughtSorted}
      mode="bought"
      canEditStatusPriority={canEditStatusPriority}
      statusOptions={statusOptions}
      savingInlineKey={savingInlineKey}
      onUpdateArtworkField={handleUpdateArtworkField}
    />

  </section>
)}


      {/* Archived (séparés) */}

{(archivedMarket.length > 0 || archivedAuctions.length > 0) && (
  <section className="mt-8 border-t-2 border-white/30 pt-6">

    <div style={centeredHeaderRowStyle}>
      <h2 style={centeredTitleStyle}>
        Archived ({archivedMarket.length + archivedAuctions.length})
      </h2>

      <Link
        href={buildPrintUrl({
          market: 'private',
          status: 'archived',
          priority: 'all',
        })}
        target="_blank"
        rel="noopener noreferrer"
        style={printLinkStyle}
      >
        All factsheets
      </Link>
    </div>

    {/* ✅ PRIVATE MARKET */}
    {archivedMarket.length > 0 && (
      <div style={{ marginTop: 12 }}>
        <div style={subSectionHeaderRowStyle}>
          <h3 style={subSectionTitle}>
            Private market ({archivedMarket.length})
          </h3>

          <Link
            href={buildPrintUrl({
              market: 'private',
              status: 'archived',
              priority: 'all',
            })}
            target="_blank"
            rel="noopener noreferrer"
            style={printLinkStyle}
          >
            Factsheets
          </Link>
        </div>

        <ArtworkList
          artworks={archivedMarket}
          mode="market"
          canEditStatusPriority={canEditStatusPriority}
          statusOptions={statusOptions}
          savingInlineKey={savingInlineKey}
          onUpdateArtworkField={handleUpdateArtworkField}
        />
      </div>
    )}

    {/* ✅ AUCTIONS */}
    {archivedAuctions.length > 0 && (
      <div style={{ marginTop: 16 }}>
        <div style={subSectionHeaderRowStyle}>
          <h3 style={subSectionTitle}>
            Auctions ({archivedAuctions.length})
          </h3>

          <Link
            href={buildPrintUrl({
              market: 'auction',
              status: 'archived',
              priority: 'all',
            })}
            target="_blank"
            rel="noopener noreferrer"
            style={printLinkStyle}
          >
            Factsheets
          </Link>
        </div>

        <ArtworkList
          artworks={archivedAuctions}
          mode="auction"
          section="archived"
          canEditStatusPriority={canEditStatusPriority}
          statusOptions={statusOptions}
          savingInlineKey={savingInlineKey}
          onUpdateArtworkField={handleUpdateArtworkField}
        />
      </div>
    )}

  </section>
)}

    </main>
  )
}




const dateInputStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',

  padding: '8px 6px',
  fontSize: 16,            // ✅ évite zoom iOS

  borderRadius: 8,
  border: '1px solid rgba(0,0,0,0.25)',
  backgroundColor: '#fff',

  WebkitAppearance: 'none', // ✅ iOS fix
}





const filtersBoxStyle: React.CSSProperties = {
  marginBottom: 20,
  borderRadius: 14,
  border: '2px solid rgba(0,0,0,0.5)',
  backgroundColor: '#DCEFE7',
  padding: 16,
  boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
  width: '100%',
  boxSizing: 'border-box',
}


const filtersRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: 12,
}


const filtersRowDesktopStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 12,
}

const dateBlockStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,            // ✅ CRITIQUE (remplace min-w-240px)
}

const dateWrapperStyle: React.CSSProperties = {
  width: '100%',
  overflow: 'hidden',     // ✅ empêche le débordement iOS
  borderRadius: 8,
}

const mainStyle: React.CSSProperties = {
  minHeight: '100vh',
  backgroundColor: '#006039',
  paddingTop: 90,
  paddingBottom: 40,
  paddingLeft: 12,
  paddingRight: 12,

  boxSizing: 'border-box',      // ✅ CRITIQUE (fix overflow iPhone)
  width: '100%',
  overflowX: 'hidden',          // ✅ empêche dépassement
}


const subSectionTitle: React.CSSProperties = {
  fontSize: '1.1rem',
  fontWeight: 700,
  color: 'white',
  marginBottom: 6,
  opacity: 0.95,
}


const printButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: '0.8rem',
  borderRadius: 6,
  border: '1px solid rgba(0,0,0,0.25)',
  backgroundColor: '#fff',
  cursor: 'pointer',
}


const printLinkStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.7)',
  backgroundColor: 'white',
  fontSize: '0.8rem',
  fontWeight: 700,
  color: '#006039',
  textDecoration: 'none',
  cursor: 'pointer',
}


const sectionHeaderRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  marginBottom: 8,
}

const subSectionHeaderRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginBottom: 6,
}


const centeredHeaderRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',  // ✅ centre le bloc entier
  alignItems: 'center',
  gap: 12,                   // ✅ espace entre texte et bouton
  textAlign: 'center',
  marginBottom: 10,
}


const centeredTitleStyle: React.CSSProperties = {
  fontSize: '1.6rem',
  fontWeight: 700,
  color: 'white',
  margin: 0,
}
