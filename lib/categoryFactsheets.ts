import type { ArtworkTableState } from '@/components/artwork/useArtworkListNavigation'

export function categoryFactsheetsUrl(
  category: string, filters: Record<string, string>, tables: Record<string, ArtworkTableState>,
  returnTo?: string,
) {
  const params = new URLSearchParams(filters)
  params.set('category', category)
  params.set('tables', JSON.stringify(tables))
  if (returnTo) params.set('returnTo', returnTo)
  return `/artworks/print/category?${params}`
}

export function matchesArtworkCategory(group: string, category: string) {
  return group === category || group.startsWith(`${category}-`)
}

export function parseCategoryArtworkIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every(id => typeof id === 'string') ||
    new Set(value).size !== value.length) {
    throw new Error('Invalid category artwork identifiers.')
  }
  return value
}
