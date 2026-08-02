
'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import ArtworkList from '@/components/artwork/ArtworkList'
import { supabase } from '@/lib/supabaseBrowser'
import { useSessionProfile } from '@/contexts/SessionContext'
import { resolveSource } from '@/lib/viewerSources'
import SearchSelect from '@/components/ui/SearchSelect'
import {
  artistLabel,
  artistRows,
  artworkRows,
  buildPrintUrl,
  chunk,
  contactLabel,
  contactRows,
  dateAcquisitionMs,
  getArtistId,
  getErrorSummary,
  getProposedById,
  getProposedByLabelFromRow,
  groupByPriority,
  logQueryError,
  nonActiveFilterDateMs,
  proposalLinkRows,
  type ArtistRow,
  type ArtworkIndexItem,
  type ContactRow,
  type ProposalLinkRow,
} from '@/components/artwork/artworkIndexHelpers'

type Props = {
  title?: string
  fixedProposedToId?: string
  forcedStatus?: ForcedStatus
}

type ForcedStatus = 'Bought' | 'Archived' | 'Active'
type EditableArtworkField = 'status' | 'priority'
type EditableArtworkValue = string | null

const applyForcedStatusFilter = <T extends {
  or: (filters: string) => T
  eq: (column: string, value: string) => T
}>(
  query: T,
  forcedStatus?: ForcedStatus
) => {
  if (!forcedStatus) return query

  if (forcedStatus === 'Active') {
    return query.or('status.is.null,status.not.in.(Bought,Archived)')
  }

  return query.eq('status', forcedStatus)
}

export default function ArtworksIndexPage({
  title,
  fixedProposedToId,
  forcedStatus,   // ✅ AJOUT ICI
}: Props)
 {
  const [artworks, setArtworks] = useState<ArtworkIndexItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

const [savingInlineKey, setSavingInlineKey] = useState<string | null>(null)
const [inlineEditError, setInlineEditError] = useState<string | null>(null)
const [inlineEditSuccess, setInlineEditSuccess] = useState<string | null>(null)
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
    .filter(
      (v): v is NonNullable<typeof v> =>
        typeof v === 'string' && v.trim().length > 0
    )

  return Array.from(new Set([...baseStatuses, ...existingStatuses]))
}, [artworks])

const { role } = useSessionProfile()

const normalizedRole = typeof role === 'string' ? role.toLowerCase() : ''

const isViewer = normalizedRole === 'viewer'

const canEditStatusPriority =
  normalizedRole === 'administrator' || normalizedRole === 'editor'

  const marketSource = role ? resolveSource('artworks', role) : null
  const auctionsSource = role ? resolveSource('auctions', role) : null

  // Filtres
  const [artistIdFilter, setArtistIdFilter] = useState('all')
  const [proposedByIdFilter, setProposedByIdFilter] = useState('all')
  const [proposedToIdFilter, setProposedToIdFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const selectedProposedToIdFilter = fixedProposedToId ?? proposedToIdFilter



const [fromDateProposed, setFromDateProposed] = useState<string>('')

  // Load artworks
  useEffect(() => {
    if (!marketSource || !auctionsSource) {
      return
    }

    const load = async () => {
      try {
        setLoading(true)
        setError(null)

        // Viewer : pas de proposed_to (inutile)
        const shouldLoadProposedTo = !isViewer && !fixedProposedToId


let baseArtworks: ArtworkIndexItem[] = []

if (marketSource === auctionsSource) {
  // ✅ Une seule vue fusionnée : on charge UNE SEULE FOIS

let query = supabase
  .from(marketSource)
  .select('*')

query = applyForcedStatusFilter(query, forcedStatus)

const { data, error } = await query

  if (error) {
    console.error(error)
    setError('Failed to load artworks')
    return
  }

  const rows = artworkRows(data)

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

marketQuery = applyForcedStatusFilter(marketQuery, forcedStatus)
auctionsQuery = applyForcedStatusFilter(auctionsQuery, forcedStatus)

const [
  { data: marketData, error: marketError },
  { data: auctionsData, error: auctionsError },
] = await Promise.all([
  marketQuery,
  auctionsQuery,
])



if (marketError) {
  logQueryError('marketError', marketError)

  setError(
    `Failed to load artworks (market): ${getErrorSummary(marketError)}`
  )
  return
}


if (auctionsError) {
  logQueryError('auctionsError', auctionsError)

  setError(
    `Failed to load artworks (auctions): ${getErrorSummary(auctionsError)}`
  )
  return
}


  const marketRows = artworkRows(marketData)
  const auctionsRows = artworkRows(auctionsData)

  baseArtworks = [
    ...marketRows.map(a => ({ ...a, auctions: false })),
    ...auctionsRows.map(a => ({ ...a, auctions: true })),
  ]
}



        const artworkIds = baseArtworks.map(artwork => artwork.id)
        const artistIds = Array.from(
          new Set(baseArtworks.map(getArtistId).filter((id): id is string => Boolean(id)))
        )
        const proposedByIds = Array.from(
          new Set(baseArtworks.map(getProposedById).filter((id): id is string => Boolean(id)))
        )

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

            proposalLinks = proposalLinks.concat(proposalLinkRows(data))
          }
        }

        const proposedToIds = shouldLoadProposedTo
          ? Array.from(new Set(proposalLinks.map(proposal => proposal.contact_id)))
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

            for (const c of contactRows(data)) {
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
            for (const a of artistRows(data)) artistsMap.set(a.id, a)
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
        const normalized: ArtworkIndexItem[] = baseArtworks.map(a => {
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
}, [marketSource, auctionsSource, isViewer, fixedProposedToId, forcedStatus, reloadKey])
  // Options filtres
  const artistOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of artworks) {
      const id = a.artist_id
      const label = (a.artist_label ?? '').trim()
      if (id && label) map.set(id, label)
    }
    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((x, y) => x.label.localeCompare(y.label, 'fr-CH', { sensitivity: 'base' }))
  }, [artworks])

  const proposedByOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of artworks) {
      const id = a.proposed_by_id
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

  // Filtrage global

const globallyFiltered = useMemo(() => {
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase('fr-CH')

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

    if (!isViewer && selectedProposedToIdFilter !== 'all') {
      const ids = (Array.isArray(a.proposals) ? a.proposals : []).map(p => p.contact_id)
      if (!ids.includes(selectedProposedToIdFilter)) return false
    }

    if (normalizedSearch) {
      const searchableText = [
        a.artist_label,
        a.title,
        a.medium,
        a.status,
        a.priority,
        a.proposed_by_label,
        ...(Array.isArray(a.proposals) ? a.proposals.map(p => p.contact_label) : []),
      ]
        .filter((value): value is string => typeof value === 'string')
        .join(' ')
        .toLocaleLowerCase('fr-CH')

      if (!searchableText.includes(normalizedSearch)) return false
    }

    return true
  })
}, [
  artworks,
  forcedStatus,     // ✅ important
  artistIdFilter,
  proposedByIdFilter,
  selectedProposedToIdFilter,
  isViewer,
  searchQuery,
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
      const d = nonActiveFilterDateMs(a)
      return d && d >= fromMs
    })
  }, [nonActiveBase, fromDateProposed])

  // Sections
  const primaryMarket = useMemo(() => activeAll.filter(a => !a.auctions), [activeAll])
  const auctions = useMemo(() => activeAll.filter(a => Boolean(a.auctions)), [activeAll])

  const bought = useMemo(() => nonActiveFiltered.filter(a => a.status === 'Bought'), [nonActiveFiltered])
  const archivedAll = useMemo(() => nonActiveFiltered.filter(a => a.status === 'Archived'), [nonActiveFiltered])

  // ✅ Bought fusionné + tri acquisition DESC
  const boughtSorted = useMemo(() => {
    return [...bought].sort((a, b) => dateAcquisitionMs(b) - dateAcquisitionMs(a))
  }, [bought])

  // Archived séparés (comme tu veux)
  const archivedMarket = useMemo(
    () => archivedAll.filter(a => !a.auctions),
    [archivedAll]
  )

  const archivedAuctions = useMemo(
    () => archivedAll.filter(a => Boolean(a.auctions)),
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
    setProposedToIdFilter('all')
    setSearchQuery('')
  }

  if (loading && marketSource && auctionsSource) {
    return (
      <main style={mainStyle}>
        <div className="ux-feedback-card" role="status" aria-live="polite">
          <span className="ux-spinner" aria-hidden="true" />
          Chargement des œuvres…
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main style={mainStyle}>
        <div className="ux-feedback-card ux-feedback-card-error" role="alert">
          <strong>Impossible de charger les œuvres.</strong>
          <span>{error}</span>
          <button
            type="button"
            className="edit-button"
            onClick={() => setReloadKey(key => key + 1)}
          >
            Réessayer
          </button>
        </div>
      </main>
    )
  }

  const baseTitle = title ?? 'Artworks — Private market & Auctions'
  const headerTitle = fixedProposedToId ? `${baseTitle}` : baseTitle



const handleUpdateArtworkField = async (
  artworkId: string,
  field: EditableArtworkField,
  value: EditableArtworkValue
) => {
  if (!canEditStatusPriority) return

  setInlineEditError(null)
  setInlineEditSuccess(null)
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
    setInlineEditSuccess('Modification enregistrée.')
  } catch (e) {
    console.error(e)
    setInlineEditError('Network error while updating artwork')
  } finally {
    setSavingInlineKey(null)
  }
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
        <div className="artwork-filters-primary" style={filtersRowStyle}>
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
          <div style={{ width: '100%' }}>
            <label
              htmlFor="artwork-search"
              style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 'bold' }}
            >
              Recherche
            </label>
            <input
              id="artwork-search"
              type="search"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Titre, artiste, statut, contact…"
              style={dateInputStyle}
            />
          </div>

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

{inlineEditSuccess && (
  <div className="ux-inline-success" role="status" aria-live="polite">
    {inlineEditSuccess}
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

{totalDisplayed === 0 && (
  <div className="ux-empty-state" role="status">
    Aucune œuvre ne correspond aux filtres sélectionnés.
  </div>
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
