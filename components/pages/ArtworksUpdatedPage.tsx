
'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabaseBrowser'
import { useSessionProfile } from '@/contexts/SessionContext'
import { useClientFilter } from '@/contexts/ClientFilterContext'
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

type AcquisitionEvent = {
  artwork_id: string
  created_at: string
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

const sectionTitleStyle: CSSProperties = {
  fontSize: '1.6rem',
  fontWeight: 500,
  color: '#000000',
  margin: 0,
  textAlign: 'left',
}

const showMoreButtonStyle: CSSProperties = {
  marginTop: 12,
  border: '1px solid #aeb4b1',
  borderRadius: 8,
  background: '#e5e7e6',
  color: '#111111',
  fontSize: '0.85rem',
  fontWeight: 700,
  cursor: 'pointer',
}

const PREVIEW_COUNT = 5

function SectionTitle({
  title,
  count,
}: {
  title: string
  count: number
}) {
  return (
    <div className="updated-section-heading">
      <h2 style={sectionTitleStyle}>
        {title} ({count})
      </h2>
    </div>
  )
}

function CollapsibleArtworkList({
  artworks,
}: {
  artworks: UpdatedArtworkItem[]
}) {
  const [expanded, setExpanded] = useState(false)

  const visibleArtworks = expanded
    ? artworks
    : artworks.slice(0, PREVIEW_COUNT)

  const hiddenCount = artworks.length - PREVIEW_COUNT

  return (
    <>
      <ArtworkListUpdated artworks={visibleArtworks} />

      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          style={showMoreButtonStyle}
        >
          {expanded ? 'Show less' : `Show ${hiddenCount} more`}
        </button>
      ) : null}
    </>
  )
}

export default function ArtworksUpdatedPage() {
  const { role } = useSessionProfile()
  const { matchesClient } = useClientFilter()

  const [allArtworks, setArtworks] = useState<UpdatedArtworkItem[]>([])
  const artworks = useMemo(
    () => allArtworks.filter((artwork) => matchesClient(artwork.id)),
    [allArtworks, matchesClient]
  )
  const [acquisitionEvents, setAcquisitionEvents] = useState<AcquisitionEvent[]>([])
  const [acquisitionLoadError, setAcquisitionLoadError] = useState<string | null>(null)
  const [recentThresholdMs, setRecentThresholdMs] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!role) return

    let isMounted = true

    const load = async () => {
      setLoading(true)
      setAcquisitionLoadError(null)

      try {
        const thresholdMs = Date.now() - SEVEN_DAYS_MS
        setRecentThresholdMs(thresholdMs)

        const source =
          role.toLowerCase() === 'viewer'
            ? 'viewer_artworks_full_secure'
            : 'artworks_full_admin'

        console.log('[updated] role =', role)
        console.log('[updated] source =', source)

        const acquisitionThreshold = new Date(thresholdMs).toISOString()
        const [res, acquisitionsResult] = await Promise.all([
          supabase.from(source).select('*'),
          supabase
            .from('artwork_acquisition_events')
            .select('artwork_id, created_at')
            .gte('created_at', acquisitionThreshold)
            .order('created_at', { ascending: false }),
        ])

        if (res.error) {
          console.error('[updated] load error =', res.error)
          console.error(
            '[updated] load error json =',
            JSON.stringify(res.error, null, 2)
          )

          if (isMounted) {
            setArtworks([])
            setAcquisitionEvents([])
          }
          return
        }

        if (acquisitionsResult.error) {
          console.error(
            '[updated] acquisition events load error =',
            acquisitionsResult.error
          )
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
          if (acquisitionsResult.error) {
            setAcquisitionEvents([])
            setAcquisitionLoadError(
              'Recent acquisitions could not be loaded.'
            )
          } else {
            setAcquisitionEvents(
              (acquisitionsResult.data as AcquisitionEvent[] | null) ?? []
            )
          }
        }
      } catch (e) {
        console.error('[updated] unexpected error =', e)

        if (isMounted) {
          setArtworks([])
          setAcquisitionEvents([])
          setAcquisitionLoadError(
            'Recent acquisitions could not be loaded.'
          )
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

  const recentAcquisitionMsByArtworkId = useMemo(() => {
    const acquisitionMsByArtworkId = new Map<string, number>()

    for (const event of acquisitionEvents) {
      const acquisitionMs = new Date(event.created_at).getTime()
      if (Number.isNaN(acquisitionMs)) continue

      const previousMs = acquisitionMsByArtworkId.get(event.artwork_id) ?? 0
      if (acquisitionMs > previousMs) {
        acquisitionMsByArtworkId.set(event.artwork_id, acquisitionMs)
      }
    }

    return acquisitionMsByArtworkId
  }, [acquisitionEvents])

  const newlyAcquiredArtworks = useMemo(() => {
    return latestUpdatesBase
      .filter((artwork) => recentAcquisitionMsByArtworkId.has(artwork.id))
      .sort(
        (a, b) =>
          (recentAcquisitionMsByArtworkId.get(b.id) ?? 0) -
          (recentAcquisitionMsByArtworkId.get(a.id) ?? 0)
      )
  }, [latestUpdatesBase, recentAcquisitionMsByArtworkId])

  const newlyAcquiredIds = useMemo(
    () => new Set(newlyAcquiredArtworks.map((artwork) => artwork.id)),
    [newlyAcquiredArtworks]
  )

  // ✅ Newly created = seulement les 7 derniers jours

const newlyCreatedArtworks = useMemo(() => {
  return latestUpdatesBase
    .filter((a) => {
      const createdMs = getCreatedMs(a)
      const status = normalizeStatus(a.status)

      if (newlyAcquiredIds.has(a.id)) return false

      // ✅ créé dans les 7 derniers jours
      if (!(createdMs > 0 && createdMs >= recentThresholdMs)) return false

      // ✅ exclure impérativement Bought / Archived
      if (status === 'bought' || status === 'archived') return false

      return true
    })
    .sort((a, b) => getCreatedMs(b) - getCreatedMs(a))
}, [latestUpdatesBase, newlyAcquiredIds, recentThresholdMs])


  // ✅ Reste des updates = uniquement ceux qui ont été modifiés après création

const nonCreatedUpdates = useMemo(() => {
  return latestUpdatesBase.filter((a) => {
    const createdMs = getCreatedMs(a)
    const updatedMs = getUpdatedMs(a)
    const status = normalizeStatus(a.status)

    if (newlyAcquiredIds.has(a.id)) return false

    // ✅ Bought / Archived doivent toujours rester dans les updates
    if (status === 'bought' || status === 'archived') {
      return true
    }

    // pas de created_at → on garde dans les updates
    if (!createdMs) return true

    // si créé dans les 7 derniers jours, on le retire des updates
    // (sauf Bought / Archived déjà gérés ci-dessus)
    if (createdMs >= recentThresholdMs) return false

    // sinon, vraie mise à jour après création
    return updatedMs > createdMs
  })
}, [latestUpdatesBase, newlyAcquiredIds, recentThresholdMs])


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
    <main className="updated-page">
      <div className="updated-page-shell">
        <header className="updated-page-header">
          <div>
            <div className="updated-page-eyebrow">Collection activity</div>
            <h1>Latest updates</h1>
            <p>Track newly created artworks and recent changes across the collection.</p>
          </div>
          <div className="updated-page-total">
            <strong>{total}</strong>
            <span>artworks</span>
          </div>
        </header>

        <section className="updated-attention-card">
          <div className="updated-attention-copy">
            <h2>En attente de destination de factures</h2>
          </div>

          {specialBuyerArtworks.length > 0 ? (
            <div className="updated-attention-list">
              <ArtworkListUpdated artworks={specialBuyerArtworks} />
            </div>
          ) : (
            <div className="updated-empty-state">
              Aucun artwork en attente de destination de factures.
            </div>
          )}
        </section>

        <section className="updated-section">
          <SectionTitle
            title="Newly acquired (last 7 days)"
            count={newlyAcquiredArtworks.length}
          />

          {acquisitionLoadError ? (
            <div className="updated-empty-state">
              {acquisitionLoadError}
            </div>
          ) : newlyAcquiredArtworks.length > 0 ? (
            <CollapsibleArtworkList artworks={newlyAcquiredArtworks} />
          ) : (
            <div className="updated-empty-state">
              No artworks acquired in the last 7 days.
            </div>
          )}
        </section>

        <section className="updated-section">
          <SectionTitle
            title="Newly created (last 7 days)"
            count={newlyCreatedArtworks.length}
          />

          {newlyCreatedArtworks.length > 0 ? (
            <CollapsibleArtworkList artworks={newlyCreatedArtworks} />
          ) : (
            <div className="updated-empty-state">
              Aucun artwork créé dans les 7 derniers jours.
            </div>
          )}
        </section>

        <section className="updated-section">
          <SectionTitle
            title="Updated — Draft / Viewed / Negotiation"
            count={updatedPipelineArtworks.length}
          />

          {updatedPipelineArtworks.length > 0 ? (
            <CollapsibleArtworkList artworks={updatedPipelineArtworks} />
          ) : (
            <div className="updated-empty-state">
              Aucun artwork mis à jour dans Draft / Viewed / Negotiation.
            </div>
          )}
        </section>

        <section className="updated-section">
          <SectionTitle
            title="Updated — Bought / Archived"
            count={updatedClosedArtworks.length}
          />

          {updatedClosedArtworks.length > 0 ? (
            <CollapsibleArtworkList artworks={updatedClosedArtworks} />
          ) : (
            <div className="updated-empty-state">
              Aucun artwork mis à jour dans Bought / Archived.
            </div>
          )}
        </section>

        {updatedOtherArtworks.length > 0 && (
          <section className="updated-section">
            <SectionTitle
              title="Updated — Other statuses"
              count={updatedOtherArtworks.length}
            />
            <CollapsibleArtworkList artworks={updatedOtherArtworks} />
          </section>
        )}
      </div>
    </main>
  )
}
