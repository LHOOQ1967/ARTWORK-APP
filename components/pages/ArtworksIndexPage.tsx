
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

export default function ArtworksIndexPage({ title, fixedProposedToId }: Props) {
  const [artworks, setArtworks] = useState<ArtworkAll[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { role } = useSessionProfile()
  const isViewer = typeof role === 'string' && role.toLowerCase() === 'viewer'

  const marketSource = role ? resolveSource('artworks', role) : null
  const auctionsSource = role ? resolveSource('auctions', role) : null

  // (optionnel) si tu affiches le nom du contact fixé quelque part
  const [fixedProposedToName, setFixedProposedToName] = useState<string | null>(null)

  // Filtres
  const [artistIdFilter, setArtistIdFilter] = useState('all')
  const [proposedByIdFilter, setProposedByIdFilter] = useState('all')
  const [proposedToIdFilter, setProposedToIdFilter] = useState('all')

  // ✅ Par défaut: 1er janvier de l’année en cours (comme tu avais)
  const defaultFromDateProposed = useMemo(() => {
    const now = new Date()
    const year = now.getFullYear()
    return `${year}-01-01` // YYYY-MM-DD
  }, [])

  const [fromDateProposed, setFromDateProposed] = useState<string>(defaultFromDateProposed)

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
    const full = `${(c?.first_name ?? '').trim()} ${(c?.last_name ?? '').trim()}`.trim()
    if (full) return full
    const company = (c?.company_name ?? '').trim()
    if (company) return company
    const last = (c?.last_name ?? '').trim()
    if (last) return last
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

        const [{ data: marketData, error: marketError }, { data: auctionsData, error: auctionsError }] =
          await Promise.all([
            supabase.from(marketSource).select('*'),
            supabase.from(auctionsSource).select('*'),
          ])

        if (marketError) {
          console.error(marketError)
          setError('Failed to load artworks (market)')
          return
        }
        if (auctionsError) {
          console.error(auctionsError)
          setError('Failed to load artworks (auctions)')
          return
        }

        const marketRows = (Array.isArray(marketData) ? marketData : []) as any[]
        const auctionsRows = (Array.isArray(auctionsData) ? auctionsData : []) as any[]

        // 🔎 Debug utile : vérifier si date_proposition est bien présente côté auctions
        // console.log('[index] auctions archived rows =', auctionsRows.filter(a => a?.status === 'Archived').length)
        // console.log('[index] auctions archived with date_proposition =', auctionsRows.filter(a => a?.status === 'Archived' && a?.date_proposition).length)

        const baseArtworks = [
          ...marketRows.map(a => ({ ...a, auctions: false })),
          ...auctionsRows.map(a => ({ ...a, auctions: true })),
        ]

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
  }, [marketSource, auctionsSource, isViewer, fixedProposedToId])

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
      if (artistIdFilter !== 'all' && a.artist_id !== artistIdFilter) return false
      if (proposedByIdFilter !== 'all' && a.proposed_by_id !== proposedByIdFilter) return false

      if (!isViewer && proposedToIdFilter !== 'all') {
        const ids = (Array.isArray(a.proposals) ? a.proposals : []).map(p => p.contact_id)
        if (!ids.includes(proposedToIdFilter)) return false
      }

      return true
    })
  }, [artworks, artistIdFilter, proposedByIdFilter, proposedToIdFilter, isViewer])

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

  return (
    <main className="min-h-screen bg-[#006039] px-10 pb-10 pt-24">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="m-0 text-[1.8rem] font-bold text-white">{headerTitle}</h2>
        <Link className="no-print" href="/artworks/new">
          <button className="edit-button">+ New artwork</button>
        </Link>
      </div>

      {/* Filters */}
      <section className="no-print mb-5 rounded-[14px] border-[3px] border-black/60 bg-[#DCEFE7] p-5 shadow-[0_2px_10px_rgba(0,0,0,0.10)]">
        {/* LIGNE 1 */}
        <div className="flex flex-wrap gap-4">
          <div className="min-w-[240px] flex-[1_1_240px]">
            <div className="mb-1.5 text-[14px] font-bold tracking-[0.02em]">
              From date{" "}
              <span className="text-[12px] font-normal opacity-70">
                (Bought = acquisition date, Archived = proposed date)
              </span>
            </div>

            <input
              type="date"
              value={fromDateProposed}
              onChange={e => setFromDateProposed(e.target.value)}
              className="w-full rounded-[10px] border border-black/25 bg-white px-3 py-2.5 outline-none focus:ring-2 focus:ring-black/15"
            />
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
        <div className="mt-4 flex flex-wrap gap-4">
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

      {/* Primary market (active) */}
      <section>
        <h2 className="text-[1.6rem] font-bold text-white">Private market ({primaryMarket.length})</h2>
        <ArtworkList artworks={primaryMarket} mode="market" />
      </section>

      {/* Auctions (active) */}
      <section className="mt-8 border-t-2 border-white/30 pt-6">
        <h2 className="text-[1.6rem] font-bold text-white">Auctions ({auctions.length})</h2>
        <ArtworkList artworks={auctions} mode="auction" section="active" />
      </section>

      {/* Bought (fusionné) */}
      {boughtSorted.length > 0 && (
        <section className="mt-8 border-t-2 border-white/30 pt-6">
          <h2 className="text-[1.6rem] font-bold text-white">Bought ({boughtSorted.length})</h2>
          <ArtworkList artworks={boughtSorted} mode="bought"  />
        </section>
      )}

      {/* Archived (séparés) */}
      {(archivedMarket.length > 0 || archivedAuctions.length > 0) && (
        <section className="mt-8 border-t-2 border-white/30 pt-6">
          <h2 className="text-[1.6rem] font-bold text-white">
            Archived ({archivedMarket.length + archivedAuctions.length})
          </h2>

          {archivedMarket.length > 0 && (
            <div className="mt-3">
              <h3 className="text-[1.2rem] font-semibold text-white/95">
                Private market ({archivedMarket.length})
              </h3>
              <ArtworkList artworks={archivedMarket} mode="market" />
            </div>
          )}

          {archivedAuctions.length > 0 && (
            <div className="mt-5">
              <h3 className="text-[1.2rem] font-semibold text-white/95">
                Auctions ({archivedAuctions.length})
              </h3>
              <ArtworkList artworks={archivedAuctions} mode="auction" section="archived" />
            </div>
          )}
        </section>
      )}
    </main>
  )
}
