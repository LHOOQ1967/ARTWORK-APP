
'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseBrowser'
import { useSessionProfile } from '@/contexts/SessionContext'
import ArtworkListUpdated from '@/components/artwork/ArtworkListUpdated'
import type { ArtworkListItem } from '@/app/(protected)/types/artwork'

type UpdatedArtworkItem = ArtworkListItem & {
  created_at?: string | null
  updated_at?: string | null
  last_changed_at?: string | null
  changed_fields?: string[] | null
  changed_diff?: Record<string, { old: unknown; new: unknown }> | null

  proposed_by_id?: string | null
  proposed_by_name?: string | null
  proposed_by_label?: string | null

  proposedBy?: {
    id?: string
    company_name?: string | null
    first_name?: string | null
    last_name?: string | null
  } | null

  buyer_id?: string | null
  buyer_contact_id?: string | null

  title?: string | null
  status?: string | null
  priority?: string | null

  asking_price?: number | string | null
  currency?: string | null

  estimate_low?: number | string | null
  estimate_high?: number | string | null
  auction_currency?: string | null

  sold_premium?: number | string | null

  cost_amount?: number | string | null
  cost_currency?: string | null

  documents?: Array<{
    id?: string
    url?: string | null
    position?: number | null
    document_type?: string | null
  }> | null

  images?: Array<{
    id?: string
    url?: string | null
    position?: number | null
  }> | null

  artist?: {
    id?: string
    first_name?: string | null
    last_name?: string | null
  } | null
}

const SPECIAL_BUYER_ID = '7c944786-75ff-4630-9851-e1ac0105b9b5'
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function getUpdatedMs(item: UpdatedArtworkItem): number {
  const value = item.last_changed_at ?? item.updated_at
  if (!value) return 0
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? 0 : d.getTime()
}

function getCreatedMs(item: UpdatedArtworkItem): number {
  const value = item.created_at
  if (!value) return 0
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? 0 : d.getTime()
}

function extractImagesFromDocuments(documents: unknown): Array<{
  id?: string
  url?: string | null
  position?: number | null
}> {
  if (!Array.isArray(documents)) return []

  return documents
    .filter((doc: any) => doc?.document_type === 'image')
    .sort((a: any, b: any) => (a?.position ?? 0) - (b?.position ?? 0))
    .map((doc: any) => ({
      id: doc?.id,
      url: doc?.url ?? null,
      position: doc?.position ?? null,
    }))
}

function extractProposedByName(proposedBy: unknown): string {
  if (!proposedBy || typeof proposedBy !== 'object') return '—'

  const p = proposedBy as {
    company_name?: string | null
    first_name?: string | null
    last_name?: string | null
  }

  const company = (p.company_name ?? '').toString().trim()
  if (company) return company

  const full = [p.first_name, p.last_name]
    .filter(Boolean)
    .join(' ')
    .trim()

  return full || '—'
}

function normalizeArtworkRow(row: any): UpdatedArtworkItem {
  return {
    ...row,

    images:
      Array.isArray(row.images) && row.images.length > 0
        ? row.images
        : extractImagesFromDocuments(row.documents),

    proposed_by_name:
      (row.proposed_by_name ?? '').toString().trim() ||
      extractProposedByName(row.proposedBy),

    buyer_id: row.buyer_id ?? row.buyer_contact_id ?? null,
  }
}

function normalizeStatus(status?: string | null): string {
  return (status ?? '').toString().trim().toLowerCase()
}

function SectionTitle({
  title,
  count,
  color = 'white',
}: {
  title: string
  count: number
  color?: string
}) {
  return (
    <div
      style={{
        marginBottom: 10,
        fontSize: '1.1rem',
        fontWeight: 700,
        color,
      }}
    >
      {title} ({count})
    </div>
  )
}

export default function ArtworksUpdatedPage() {
  const { role } = useSessionProfile()

  const [artworks, setArtworks] = useState<UpdatedArtworkItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!role) return

    let isMounted = true

    const load = async () => {
      setLoading(true)

      try {
        const source =
          role.toLowerCase() === 'viewer'
            ? 'viewer_artworks_full_secure'
            : 'artworks_full_admin'

        console.log('[updated] role =', role)
        console.log('[updated] source =', source)

        const res = await supabase.from(source).select('*')

        if (res.error) {
          console.error('[updated] load error =', res.error)
          console.error(
            '[updated] load error json =',
            JSON.stringify(res.error, null, 2)
          )

          if (isMounted) {
            setArtworks([])
          }
          return
        }

        const data = (res.data as UpdatedArtworkItem[]) ?? []

        const normalized = data
          .map(normalizeArtworkRow)
          .sort((a, b) => getUpdatedMs(b) - getUpdatedMs(a))

        console.log('[updated] first row =', normalized[0])
        console.log('[updated] first created_at =', normalized[0]?.created_at)
        console.log('[updated] first changed_fields =', normalized[0]?.changed_fields)
        console.log('[updated] first last_changed_at =', normalized[0]?.last_changed_at)
        console.log('[updated] first updated_at =', normalized[0]?.updated_at)
        console.log('[updated] first images =', normalized[0]?.images)
        console.log('[updated] first proposed_by_name =', normalized[0]?.proposed_by_name)
        console.log('[updated] first buyer_id =', normalized[0]?.buyer_id)

        if (isMounted) {
          setArtworks(normalized)
        }
      } catch (e) {
        console.error('[updated] unexpected error =', e)

        if (isMounted) {
          setArtworks([])
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      isMounted = false
    }
  }, [role])

  const specialBuyerArtworks = useMemo(() => {
    return artworks
      .filter((a) => a.buyer_id === SPECIAL_BUYER_ID)
      .sort((a, b) => getUpdatedMs(b) - getUpdatedMs(a))
  }, [artworks])

  // ✅ On retire les artworks de la section spéciale
  const latestUpdatesBase = useMemo(() => {
    return artworks.filter((a) => a.buyer_id !== SPECIAL_BUYER_ID)
  }, [artworks])

  // ✅ Newly created = seulement les 7 derniers jours

const newlyCreatedArtworks = useMemo(() => {
  const threshold = Date.now() - SEVEN_DAYS_MS

  return latestUpdatesBase
    .filter((a) => {
      const createdMs = getCreatedMs(a)
      const status = normalizeStatus(a.status)

      // ✅ créé dans les 7 derniers jours
      if (!(createdMs > 0 && createdMs >= threshold)) return false

      // ✅ exclure impérativement Bought / Archived
      if (status === 'bought' || status === 'archived') return false

      return true
    })
    .sort((a, b) => getCreatedMs(b) - getCreatedMs(a))
}, [latestUpdatesBase])


  // ✅ Reste des updates = uniquement ceux qui ont été modifiés après création

const nonCreatedUpdates = useMemo(() => {
  const threshold = Date.now() - SEVEN_DAYS_MS

  return latestUpdatesBase.filter((a) => {
    const createdMs = getCreatedMs(a)
    const updatedMs = getUpdatedMs(a)
    const status = normalizeStatus(a.status)

    // ✅ Bought / Archived doivent toujours rester dans les updates
    if (status === 'bought' || status === 'archived') {
      return true
    }

    // pas de created_at → on garde dans les updates
    if (!createdMs) return true

    // si créé dans les 7 derniers jours, on le retire des updates
    // (sauf Bought / Archived déjà gérés ci-dessus)
    if (createdMs >= threshold) return false

    // sinon, vraie mise à jour après création
    return updatedMs > createdMs
  })
}, [latestUpdatesBase])


  const updatedPipelineArtworks = useMemo(() => {
    return nonCreatedUpdates.filter((a) => {
      const status = normalizeStatus(a.status)
      return (
        status === 'draft' ||
        status === 'viewed' ||
        status === 'negotiation'
      )
    })
  }, [nonCreatedUpdates])

  const updatedClosedArtworks = useMemo(() => {
    return nonCreatedUpdates.filter((a) => {
      const status = normalizeStatus(a.status)
      return status === 'bought' || status === 'archived'
    })
  }, [nonCreatedUpdates])

  const updatedOtherArtworks = useMemo(() => {
    return nonCreatedUpdates.filter((a) => {
      const status = normalizeStatus(a.status)
      return ![
        'draft',
        'viewed',
        'negotiation',
        'bought',
        'archived',
      ].includes(status)
    })
  }, [nonCreatedUpdates])

  const total = useMemo(() => artworks.length, [artworks])

  if (loading) {
    return <p style={{ padding: 40 }}>Loading…</p>
  }

  return (
    <main className="min-h-screen bg-[#006039] px-3 pb-10 pt-24">
      {/* Bandeau total */}
      <section className="mb-4 rounded-[14px] border-[3px] border-black/60 bg-[#DCEFE7] p-5 shadow-[0_2px_10px_rgba(0,0,0,0.10)]">
        <div className="text-[1.05rem] font-bold text-[#006039]">
          Total: {total} artworks
        </div>
      </section>

      {/* Section spéciale buyer */}
      <section className="mb-8 rounded-[14px] border-[3px] border-black/60 bg-[#4A5068] p-5 shadow-[0_2px_10px_rgba(0,0,0,0.10)]">
        <div className="mb-2 text-[1.15rem] font-bold text-[#eaeaea]">
          En attente de destination de factures
        </div>

        {specialBuyerArtworks.length > 0 ? (
          <ArtworkListUpdated artworks={specialBuyerArtworks} />
        ) : (
          <div className="text-[0.95rem] text-white/80">
            Aucun artwork en attente de destination de factures.
          </div>
        )}
      </section>

      {/* Latest updates */}
      <section>
        <div className="mb-4 text-[1.2rem] font-bold text-white">
          Latest updates
        </div>

        {/* Newly created - last 7 days */}
        <div className="mb-8">
          <SectionTitle
            title="Newly created (last 7 days)"
            count={newlyCreatedArtworks.length}
          />

          {newlyCreatedArtworks.length > 0 ? (
            <ArtworkListUpdated artworks={newlyCreatedArtworks} />
          ) : (
            <div className="rounded-[14px] border-[3px] border-black/40 bg-white/90 p-5 text-[0.95rem] text-black/70">
              Aucun artwork créé dans les 7 derniers jours.
            </div>
          )}
        </div>

        {/* Updated — Draft / Viewed / Negotiation */}
        <div className="mb-8">
          <SectionTitle
            title="Updated — Draft / Viewed / Negotiation"
            count={updatedPipelineArtworks.length}
          />

          {updatedPipelineArtworks.length > 0 ? (
            <ArtworkListUpdated artworks={updatedPipelineArtworks} />
          ) : (
            <div className="rounded-[14px] border-[3px] border-black/40 bg-white/90 p-5 text-[0.95rem] text-black/70">
              Aucun artwork mis à jour dans Draft / Viewed / Negotiation.
            </div>
          )}
        </div>

        {/* Updated — Bought / Archived */}
        <div className="mb-8">
          <SectionTitle
            title="Updated — Bought / Archived"
            count={updatedClosedArtworks.length}
          />

          {updatedClosedArtworks.length > 0 ? (
            <ArtworkListUpdated artworks={updatedClosedArtworks} />
          ) : (
            <div className="rounded-[14px] border-[3px] border-black/40 bg-white/90 p-5 text-[0.95rem] text-black/70">
              Aucun artwork mis à jour dans Bought / Archived.
            </div>
          )}
        </div>

        {/* Other statuses */}
        {updatedOtherArtworks.length > 0 && (
          <div className="mb-8">
            <SectionTitle
              title="Updated — Other statuses"
              count={updatedOtherArtworks.length}
            />
            <ArtworkListUpdated artworks={updatedOtherArtworks} />
          </div>
        )}
      </section>
    </main>
  )
}
