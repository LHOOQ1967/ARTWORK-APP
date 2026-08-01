import type { ArtworkListItem } from '@/app/(protected)/types/artwork'

export type ArtworkListMode = 'market' | 'auction' | 'bought'
export type ArtworkListSection = 'active' | 'archived'
export type ArtworkSortKey =
  | 'artist'
  | 'title'
  | 'date'
  | 'proposed_to'
  | 'asking'
  | 'estimate'
  | 'sold_premium'
  | 'cost'
  | 'priority'
  | 'status'
export type SortDirection = 'asc' | 'desc'

type ArtworkValue = number | string | null | undefined

const formatNumber = (value: number) =>
  new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 0 }).format(value)

const hasValue = (value: ArtworkValue) => value != null && value !== ''

export const formatEstimate = (artwork: ArtworkListItem) => {
  const { estimate_low: low, estimate_high: high } = artwork
  const currency = artwork.auction_currency || artwork.currency || ''

  if (!hasValue(low) && !hasValue(high)) {
    return currency ? `Estimate (${currency}): on request` : 'Estimate: on request'
  }

  if (hasValue(low) && !hasValue(high)) {
    return currency ? `${currency} ≥ ${formatNumber(Number(low))}` : `Estimate: ≥ ${formatNumber(Number(low))}`
  }

  if (hasValue(high) && !hasValue(low)) {
    return currency ? `${currency} ≤ ${formatNumber(Number(high))}` : `Estimate: ≤ ${formatNumber(Number(high))}`
  }

  return currency
    ? `${currency} ${formatNumber(Number(low))} – ${formatNumber(Number(high))}`
    : `${formatNumber(Number(low))} – ${formatNumber(Number(high))}`
}

export const formatAsking = (artwork: ArtworkListItem) => {
  const { asking_price: price } = artwork
  const currency = artwork.currency || ''
  if (!hasValue(price)) return currency ? `Asking (${currency}): —` : 'Asking: —'
  return currency ? `${currency} ${formatNumber(Number(price))}` : `Asking: ${formatNumber(Number(price))}`
}

export const formatSoldPremium = (artwork: ArtworkListItem) => {
  const { sold_premium: price } = artwork
  const currency = artwork.sold_premium_currency || artwork.auction_currency || artwork.currency || ''
  if (!hasValue(price)) return currency ? `Sold (${currency}): —` : 'Sold: —'
  return currency ? `${currency} ${formatNumber(Number(price))}` : `Sold: ${formatNumber(Number(price))}`
}

export const formatCost = (artwork: ArtworkListItem) => {
  const { cost_amount: amount } = artwork
  if (!hasValue(amount)) return 'Cost: —'
  return `${artwork.cost_currency ?? ''} ${formatNumber(Number(amount))}`.trim()
}

export function truncateText(value: string, max = 70) {
  if (!value) return '—'
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function safeDateMs(value: string | null | undefined) {
  if (!value) return 0
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function getSaleDateTimeMs(artwork: ArtworkListItem): number {
  if (!artwork.sale_date) return 0
  const date = new Date(artwork.sale_date)
  if (Number.isNaN(date.getTime())) return 0

  const time = artwork.sale_time?.trim()
  if (!time) return date.getTime()

  const match = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return date.getTime()

  const hours = Math.min(23, Math.max(0, parseInt(match[1], 10)))
  const minutes = Math.min(59, Math.max(0, parseInt(match[2], 10)))
  const seconds = match[3] ? Math.min(59, Math.max(0, parseInt(match[3], 10))) : 0
  date.setHours(hours, minutes, seconds, 0)
  return date.getTime()
}

export function getDisplayDateValue(artwork: ArtworkListItem, mode: ArtworkListMode) {
  if (mode === 'auction') return artwork.sale_date
  if (mode === 'bought') return artwork.date_acquisition
  return artwork.date_proposition
}

export function getDateSortMs(artwork: ArtworkListItem, mode: ArtworkListMode) {
  if (mode === 'auction') return getSaleDateTimeMs(artwork)
  return safeDateMs(mode === 'bought' ? artwork.date_acquisition : artwork.date_proposition)
}

function priorityRank(priority?: string | null): number {
  const order: Record<string, number> = { high: 4, medium: 3, low: 2, information: 1 }
  return order[priority?.trim().toLowerCase() ?? ''] ?? 0
}

export function formatDateFr2(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function getProposedByText(artwork: ArtworkListItem): string {
  return artwork.proposed_by_label?.trim() || artwork.proposed_by_name?.trim() || '—'
}

export function getProposedToText(artwork: ArtworkListItem): string {
  return (artwork.proposals ?? [])
    .map(proposal => proposal.contact_label?.trim() ?? '')
    .filter(Boolean)
    .join(', ')
}

export function getPriorityStatusText(artwork: ArtworkListItem): string {
  return `${artwork.priority ?? '—'} • ${artwork.status ?? '—'}`
}

export function getArtistName(artwork: ArtworkListItem): string {
  const artist = artwork.artist
  if (!artist) return '—'
  return `${artist.first_name ?? ''} ${artist.last_name ?? ''}`.trim() || '—'
}

export function getTitleWithYear(artwork: ArtworkListItem) {
  const title = artwork.title?.trim() || '—'
  return artwork.year_execution ? `${title}, ${artwork.year_execution}` : title
}

export function getMainImage(artwork: ArtworkListItem) {
  return (artwork.images ?? [])
    .filter(document => document.document_type === 'image')
    .slice()
    .sort((left, right) => (left.position ?? 9999) - (right.position ?? 9999))[0] ?? null
}

export function getDefaultSort(mode: ArtworkListMode, section: ArtworkListSection) {
  if (mode === 'auction') return { key: 'date' as const, dir: section === 'active' ? 'asc' as const : 'desc' as const }
  return { key: 'date' as const, dir: 'desc' as const }
}

const compareNumbers = (left: number, right: number, direction: SortDirection) => {
  if (left === right) return 0
  return (left < right ? -1 : 1) * (direction === 'asc' ? 1 : -1)
}

const compareStrings = (left: string, right: string, direction: SortDirection) => {
  const result = left.localeCompare(right, 'fr-CH', { sensitivity: 'base' })
  return direction === 'asc' ? result : -result
}

export function sortArtworkItems(
  artworks: ArtworkListItem[],
  mode: ArtworkListMode,
  defaultSort: ReturnType<typeof getDefaultSort>,
  sortKey: ArtworkSortKey | null,
  sortDirection: SortDirection
) {
  const effectiveKey = sortKey ?? defaultSort.key
  const effectiveDirection = sortKey ? sortDirection : defaultSort.dir

  return [...artworks].sort((left, right) => {
    let leftValue: string | number = ''
    let rightValue: string | number = ''

    switch (effectiveKey) {
      case 'artist':
        leftValue = left.artist?.last_name ?? left.artist?.lastName ?? ''
        rightValue = right.artist?.last_name ?? right.artist?.lastName ?? ''
        break
      case 'title':
        leftValue = left.title ?? ''
        rightValue = right.title ?? ''
        break
      case 'date':
        leftValue = getDateSortMs(left, mode)
        rightValue = getDateSortMs(right, mode)
        break
      case 'proposed_to':
        leftValue = getProposedToText(left)
        rightValue = getProposedToText(right)
        break
      case 'asking':
        leftValue = Number(left.asking_price ?? 0)
        rightValue = Number(right.asking_price ?? 0)
        break
      case 'estimate':
        leftValue = Number(left.estimate_low ?? left.estimate_high ?? 0)
        rightValue = Number(right.estimate_low ?? right.estimate_high ?? 0)
        break
      case 'sold_premium':
        leftValue = Number(left.sold_premium ?? 0)
        rightValue = Number(right.sold_premium ?? 0)
        break
      case 'cost':
        leftValue = Number(left.cost_amount ?? 0)
        rightValue = Number(right.cost_amount ?? 0)
        break
      case 'priority':
        leftValue = priorityRank(left.priority)
        rightValue = priorityRank(right.priority)
        break
      case 'status':
        leftValue = left.status ?? ''
        rightValue = right.status ?? ''
        break
    }

    const result =
      typeof leftValue === 'string' || typeof rightValue === 'string'
        ? compareStrings(String(leftValue), String(rightValue), effectiveDirection)
        : compareNumbers(leftValue, rightValue, effectiveDirection)
    if (result !== 0) return result

    if (effectiveKey !== 'date') {
      const dateResult = compareNumbers(getDateSortMs(left, mode), getDateSortMs(right, mode), defaultSort.dir)
      if (dateResult !== 0) return dateResult
    }

    return left.id.localeCompare(right.id)
  })
}
