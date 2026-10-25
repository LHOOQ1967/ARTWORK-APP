'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseBrowser'
import {
  paginatedArtworkCache, parseArtworkListPage, type ArtworkListPage,
} from '@/lib/paginatedArtworkLists'
import { subscribeTemporaryCache, temporaryCacheRevision } from '@/lib/temporaryCache'
import type { ArtworkTableState } from './useArtworkListNavigation'

export function usePaginatedArtworks(
  scope: string, filters: Record<string, string>, tables: Record<string, ArtworkTableState>,
) {
  const filtersKey = JSON.stringify(filters)
  const tablesKey = JSON.stringify(tables)
  const key = JSON.stringify([scope, filtersKey, tablesKey])
  const [data, setData] = useState<ArtworkListPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const previous = useRef<{ baseKey: string; data: ArtworkListPage } | null>(null)

  useEffect(() => {
    const refresh = () => setReload(value => value + 1)
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    const unsubscribe = subscribeTemporaryCache(refresh)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', visible)
    return () => {
      unsubscribe()
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const revision = temporaryCacheRevision()
    const cached = paginatedArtworkCache.read(key)
    const currentFilters: Record<string, string> = JSON.parse(filtersKey)
    const currentTables: Record<string, ArtworkTableState> = JSON.parse(tablesKey)
    const sorts = Object.fromEntries(Object.entries(currentTables).filter(([, table]) => table.sortKey !== null).map(([id, table]) => [id, {
      sortKey: table.sortKey, sortDirection: table.sortDirection,
    }]))
    const baseKey = JSON.stringify([scope, filtersKey, sorts, revision, reload])
    async function page(group: string | null, offset: number) {
      const { data, error } = await supabase.rpc('artwork_list_page', {
        p_filters: currentFilters, p_tables: sorts, p_group: group, p_offset: offset,
      })
      if (error) throw new Error(error.message || 'Failed to load artworks')
      return parseArtworkListPage(data)
    }
    async function load() {
      if (cached) setData(cached)
      setLoading(!cached && !previous.current)
      setRefreshing(Boolean(cached || previous.current))
      setError(null)
      try {
        const result = previous.current?.baseKey === baseKey
          ? { ...previous.current.data, groups: previous.current.data.groups.map(group => ({
            ...group, rows: [...group.rows],
          })) }
          : await page(null, 0)
        // Restore only explicitly requested pages, in bounded parallel groups.
        const groups = result.groups.filter(group => (currentTables[group.id]?.loadedCount ?? 20) > 20)
        for (let start = 0; start < groups.length; start += 4) {
          await Promise.all(groups.slice(start, start + 4).map(async group => {
            const wanted = Math.min(currentTables[group.id]?.loadedCount ?? 20, group.total)
            for (let offset = group.rows.length; offset < wanted; offset += 20) {
              if (cancelled || revision !== temporaryCacheRevision()) return
              const next = await page(group.id, offset)
              const rows = next.groups.find(item => item.id === group.id)?.rows ?? []
              group.rows.push(...rows)
            }
          }))
        }
        if (cancelled || revision !== temporaryCacheRevision()) return
        paginatedArtworkCache.write(key, result, revision)
        previous.current = { baseKey, data: result }
        setData(result)
      } catch (cause) {
        console.error('PAGINATED ARTWORK LIST ERROR:', cause)
        if (!cancelled && revision === temporaryCacheRevision()) {
          paginatedArtworkCache.remove(key)
          setData(null)
          setError(cause instanceof Error ? cause.message : 'Failed to load artworks')
        }
      } finally {
        if (!cancelled && revision === temporaryCacheRevision()) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }
    const timer = setTimeout(() => { void load() }, previous.current ? 200 : 0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [key, filtersKey, tablesKey, reload, scope])

  return { data, loading, refreshing, error, refresh: () => setReload(value => value + 1) }
}
