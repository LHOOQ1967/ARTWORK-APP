import type { ArtworkListItem } from '@/app/(protected)/types/artwork'

export type ArtworkIndexItem = ArtworkListItem & {
  auctions?: boolean | null
  artist_id?: string | null
  artist_label?: string | null
  proposed_by_id?: string | null
  proposed_by_label?: string | null
  proposed_at?: string | null
  date_proposed?: string | null
  proposed_date?: string | null
  artistId?: string | null
  proposed_by?: string | { id?: string | null } | null
  proposed_by_contact_id?: string | null
  proposedById?: string | null
}

export type ContactRow = {
  id: string
  company_name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
}

export type ArtistRow = { id: string; last_name: string | null }
export type ProposalLinkRow = { artwork_id: string; contact_id: string }

type RecordLike = Record<string, unknown>

const isRecord = (value: unknown): value is RecordLike =>
  typeof value === 'object' && value !== null

export const isString = (value: unknown): value is string => typeof value === 'string'

export function artworkRows(value: unknown): ArtworkIndexItem[] {
  return Array.isArray(value)
    ? value.filter((row): row is ArtworkIndexItem => isRecord(row) && isString(row.id))
    : []
}

export function contactRows(value: unknown): ContactRow[] {
  return Array.isArray(value)
    ? value.filter(
        (row): row is ContactRow =>
          isRecord(row) &&
          isString(row.id) &&
          (row.company_name == null || isString(row.company_name)) &&
          (row.first_name == null || isString(row.first_name)) &&
          (row.last_name == null || isString(row.last_name)) &&
          (row.email == null || isString(row.email))
      )
    : []
}

export function artistRows(value: unknown): ArtistRow[] {
  return Array.isArray(value)
    ? value.filter(
        (row): row is ArtistRow =>
          isRecord(row) &&
          isString(row.id) &&
          (row.last_name == null || isString(row.last_name))
      )
    : []
}

export function proposalLinkRows(value: unknown): ProposalLinkRow[] {
  return Array.isArray(value)
    ? value.filter(
        (row): row is ProposalLinkRow =>
          isRecord(row) && isString(row.artwork_id) && isString(row.contact_id)
      )
    : []
}

export const chunk = <T,>(items: T[], size: number) => {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

export const contactLabel = (contact?: ContactRow | null) => {
  const company = contact?.company_name?.trim()
  if (company) return company

  const fullName = `${contact?.first_name?.trim() ?? ''} ${contact?.last_name?.trim() ?? ''}`.trim()
  return fullName || contact?.email?.trim() || ''
}

export const artistLabel = (artist?: ArtistRow | null) => artist?.last_name?.trim() ?? ''

export const getArtistId = (artwork: ArtworkIndexItem): string | null =>
  artwork.artist_id ?? artwork.artist?.id ?? artwork.artistId ?? null

export const getProposedById = (artwork: ArtworkIndexItem): string | null => {
  const proposedBy = artwork.proposed_by
  return artwork.proposed_by_id ??
    (typeof proposedBy === 'string' ? proposedBy : proposedBy?.id ?? null) ??
    artwork.proposed_by_contact_id ??
    artwork.proposedById ??
    null
}

export const getProposedByLabelFromRow = (artwork: ArtworkIndexItem) =>
  artwork.proposed_by_name?.trim() ?? ''

export const dateAcquisitionMs = (artwork: ArtworkIndexItem) =>
  safeDateMs(artwork.date_acquisition)

export function nonActiveFilterDateMs(artwork: ArtworkIndexItem) {
  if (artwork.status === 'Bought') return safeDateMs(artwork.date_acquisition)
  if (artwork.status === 'Archived') {
    return (
      safeDateMs(artwork.date_proposition) ||
      safeDateMs(artwork.proposed_at) ||
      safeDateMs(artwork.date_proposed) ||
      safeDateMs(artwork.proposed_date) ||
      safeDateMs(artwork.sale_date)
    )
  }
  return 0
}

function safeDateMs(value: string | null | undefined) {
  if (!value) return 0
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

export function getErrorSummary(error: unknown) {
  if (!isRecord(error)) return 'unknown error'
  const message = error.message
  const details = error.details
  return isString(message) ? message : isString(details) ? details : 'unknown error'
}

export function logQueryError(label: string, error: unknown) {
  console.error(`${label} raw =`, error)
  console.error(`${label} json =`, JSON.stringify(error, null, 2))
  if (isRecord(error)) {
    console.error(`${label} message =`, error.message)
    console.error(`${label} details =`, error.details)
    console.error(`${label} hint =`, error.hint)
    console.error(`${label} code =`, error.code)
  }
}

export function groupByPriority(artworks: ArtworkIndexItem[]) {
  const groups: Record<'High' | 'Medium' | 'Information' | 'Other', ArtworkIndexItem[]> = {
    High: [],
    Medium: [],
    Information: [],
    Other: [],
  }

  for (const artwork of artworks) {
    const priority = artwork.priority?.trim()
    if (priority === 'High' || priority === 'Medium' || priority === 'Information') {
      groups[priority].push(artwork)
    } else {
      groups.Other.push(artwork)
    }
  }

  return groups
}

export function buildPrintUrl({
  market,
  priority,
  status = 'active',
}: {
  market: 'private' | 'auction'
  priority?: string
  status?: 'active' | 'bought' | 'archived'
}) {
  const params = new URLSearchParams({
    market,
    status,
    sort: 'date',
    dir: 'desc',
    priority: priority && priority !== 'Other' ? priority : 'all',
  })
  return `/artworks/print?${params.toString()}`
}
