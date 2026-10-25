'use client'

import { useEffect, useRef, useState } from 'react'
import type { ArtworkSortKey, SortDirection } from './artworkListHelpers'

export type ArtworkTableState = {
  sortKey: ArtworkSortKey | null
  sortDirection: SortDirection
  showAll: boolean
  loadedCount?: number
}
export const DEFAULT_ARTWORK_TABLE_STATE: ArtworkTableState = {
  sortKey: null, sortDirection: 'asc', showAll: false,
}

type Filters = {
  artistId: string
  proposedBy: string
  proposedTo: string
  search: string
  fromDate: string
}
type NavigationState = { filters: Filters; tables: Record<string, ArtworkTableState>; scrollY: number }
const historyKey = 'artmuseArtworkNavigation'
const sortKeys: ArtworkSortKey[] = [
  'artist', 'title', 'date', 'proposed_to', 'asking', 'estimate',
  'sold_premium', 'cost', 'priority', 'quality', 'status',
]
const filterDefaults: Filters = {
  artistId: 'all', proposedBy: 'all', proposedTo: 'all', search: '', fromDate: '',
}
function isSortKey(value: unknown): value is ArtworkSortKey | null {
  return value === null || sortKeys.some(key => key === value)
}

function readNavigation(scope: string): NavigationState {
  const filters = { ...filterDefaults }
  if (typeof window === 'undefined') return { filters, tables: {}, scrollY: 0 }
  const params = new URLSearchParams(window.location.search)
  for (const key of Object.keys(filters) as (keyof Filters)[]) {
    filters[key] = params.get(key) ?? filters[key]
  }
  const saved = window.history.state?.[historyKey]
  const tables: Record<string, ArtworkTableState> = {}
  if (saved?.scope === scope && saved.tables && typeof saved.tables === 'object') {
    for (const [id, value] of Object.entries(saved.tables)) {
      if (!value || typeof value !== 'object' || !('sortKey' in value) ||
        !('sortDirection' in value) || !('showAll' in value)) continue
      if (isSortKey(value.sortKey) &&
        (value.sortDirection === 'asc' || value.sortDirection === 'desc') &&
        typeof value.showAll === 'boolean') {
        tables[id] = { sortKey: value.sortKey,
          sortDirection: value.sortDirection, showAll: value.showAll,
          ...('loadedCount' in value && typeof value.loadedCount === 'number' &&
            Number.isInteger(value.loadedCount) && value.loadedCount >= 20 && value.loadedCount <= 1000000
            ? { loadedCount: value.loadedCount } : {}),
        }
      }
    }
  }
  return { filters, tables, scrollY: saved?.scope === scope &&
    Number.isFinite(saved.scrollY) && saved.scrollY >= 0 ? saved.scrollY : 0 }
}

export function useArtworkListNavigation(scope: string, ready: boolean) {
  const [state, setState] = useState(() => readNavigation(scope))
  const current = useRef(state)
  const restored = useRef(false)
  const entryUrl = useRef(typeof window === 'undefined' ? '' : window.location.href)

  function persist(next: NavigationState, updateUrl = false) {
    if (window.location.href !== entryUrl.current) return
    const url = new URL(window.location.href)
    if (updateUrl) {
      for (const key of Object.keys(filterDefaults) as (keyof Filters)[]) {
        if (next.filters[key] === filterDefaults[key]) url.searchParams.delete(key)
        else url.searchParams.set(key, next.filters[key])
      }
    }
    window.history.replaceState({
      ...window.history.state,
      [historyKey]: { scope, tables: next.tables, scrollY: next.scrollY },
    }, '', url)
    entryUrl.current = url.href
  }

  function updateFilters(change: Partial<Filters>) {
    const tables = Object.fromEntries(Object.entries(current.current.tables).map(([id, table]) =>
      [id, { ...table, loadedCount: 20 }]))
    const next = { ...current.current, filters: { ...current.current.filters, ...change }, tables, scrollY: 0 }
    current.current = next
    persist(next, true)
    setState(next)
  }

  function updateTable(id: string, table: ArtworkTableState) {
    const next = { ...current.current, tables: { ...current.current.tables, [id]: table } }
    current.current = next
    persist(next)
    setState(next)
  }

  function saveScroll() {
    if (!restored.current) return
    const next = { ...current.current, scrollY: window.scrollY }
    current.current = next
    persist(next)
  }

  useEffect(() => {
    const onPopState = () => {
      const next = readNavigation(scope)
      current.current = next
      entryUrl.current = window.location.href
      restored.current = false
      setState(next)
    }
    const onScroll = () => {
      if (!restored.current || window.location.href !== entryUrl.current) return
      current.current = { ...current.current, scrollY: window.scrollY }
      window.history.replaceState({
        ...window.history.state,
        [historyKey]: { scope, tables: current.current.tables, scrollY: window.scrollY },
      }, '')
    }
    window.addEventListener('popstate', onPopState)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('scroll', onScroll)
    }
  }, [scope])

  useEffect(() => {
    if (!ready || restored.current) return
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: current.current.scrollY, behavior: 'instant' })
      restored.current = true
    })
    return () => cancelAnimationFrame(frame)
  }, [ready, state])

  return { ...state, updateFilters, updateTable, saveScroll }
}
