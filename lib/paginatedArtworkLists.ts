import type { ArtworkIndexItem } from '@/components/artwork/artworkIndexHelpers'
import { createTemporaryCache } from './temporaryCache'

export type ListOption = { id: string; label: string }
export type ArtworkPageGroup = { id: string; total: number; rows: ArtworkIndexItem[] }
export type ArtworkListPage = {
  total: number
  groups: ArtworkPageGroup[]
  artists: ListOption[]
  proposers: ListOption[]
  recipients: ListOption[]
  statuses: string[]
}
export const paginatedArtworkCache = createTemporaryCache<ArtworkListPage>(60_000)

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function options(value: unknown): value is ListOption[] {
  return Array.isArray(value) && value.every(item => record(item) &&
    typeof item.id === 'string' && typeof item.label === 'string')
}
export function parseArtworkListPage(value: unknown): ArtworkListPage {
  if (!record(value) || typeof value.total !== 'number' || value.total < 0 ||
    !Array.isArray(value.groups) || !value.groups.every(group =>
      record(group) && typeof group.id === 'string' && typeof group.total === 'number' &&
      group.total >= 0 && Array.isArray(group.rows) && group.rows.length <= 20 &&
      group.rows.every(row => record(row) && typeof row.id === 'string')) ||
    !options(value.artists) || !options(value.proposers) || !options(value.recipients) ||
    !Array.isArray(value.statuses) || !value.statuses.every(status => typeof status === 'string')) {
    throw new Error('Invalid artwork list page response')
  }
  // The wire guard validates the fields used by the list loader; artwork display
  // fields retain the same database contract as the existing lightweight views.
  return value as ArtworkListPage
}

export function artworkPageFilters(
  filters: Record<string, string>,
  status?: string, client?: string | null, fixedRecipient?: string,
) {
  return {
    ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== 'all' && value !== '')),
    status: status ?? 'all',
    ...(client ? { client } : {}),
    ...(fixedRecipient ? { proposedTo: fixedRecipient } : {}),
  }
}
