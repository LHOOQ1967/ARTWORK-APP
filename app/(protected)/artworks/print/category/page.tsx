'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import ArtworkSheet from '@/components/artwork/ArtworkSheet'
import type { ArtworkPrint } from '@/app/(protected)/types/artwork'
import { useSessionProfile } from '@/contexts/SessionContext'
import { useClientFilter } from '@/contexts/ClientFilterContext'
import { parseCategoryArtworkIds } from '@/lib/categoryFactsheets'
import { resolveSource } from '@/lib/viewerSources'
import { supabase } from '@/lib/supabaseBrowser'

export default function CategoryFactsheetsPage() {
  const params = useSearchParams()
  const { user, role } = useSessionProfile()
  const { selectedClientId } = useClientFilter()
  const query = params.toString()
  const scope = JSON.stringify([query, user?.id, role, selectedClientId])
  return <CategoryFactsheets key={scope} query={query} />
}

function CategoryFactsheets({ query }: { query: string }) {
  const { role } = useSessionProfile()
  const { selectedClientId } = useClientFilter()
  const [artworks, setArtworks] = useState<ArtworkPrint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!role) return
    const source = resolveSource('prints', role)
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams(query)
        const category = params.get('category')
        if (!category || !/^(market|auction|archived|bought)(-(High|Medium|Low|Information|Other)-(others|drafts)|-(market|auction))?$/.test(category)) {
          throw new Error('Invalid artwork category.')
        }
        const tables: unknown = JSON.parse(params.get('tables') ?? '{}')
        if (!tables || typeof tables !== 'object' || Array.isArray(tables)) {
          throw new Error('Invalid category sorting.')
        }
        const filters = Object.fromEntries([...params.entries()].filter(([key]) =>
          ['status', 'artistId', 'search', 'fromDate', 'marketType', 'proposedTo'].includes(key)))
        if (selectedClientId) filters.client = selectedClientId
        const result = await supabase.rpc('artwork_category_ids', {
          p_category: category, p_filters: filters, p_tables: tables,
        })
        if (result.error) throw new Error(result.error.message)
        const ids = parseCategoryArtworkIds(result.data)
        const rows: ArtworkPrint[] = []
        for (let start = 0; start < ids.length; start += 20) {
          if (cancelled) return
          const result = await supabase.from(source).select('*').in('id', ids.slice(start, start + 20))
          if (result.error) throw new Error(result.error.message)
          rows.push(...(result.data ?? []))
        }
        const byId = new Map(rows.map(row => [row.id, row]))
        const ordered = ids.map(id => {
          const row = byId.get(id)
          if (!row) throw new Error('An artwork is no longer available. Please retry.')
          return row
        })
        if (!cancelled) setArtworks(ordered)
      } catch (cause) {
        console.error('CATEGORY FACTSHEETS ERROR:', cause)
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load factsheets.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [query, role, selectedClientId, retry])

  return <main style={{ padding: '98px 20px 56px' }}>
    {loading ? <div className="ux-feedback-card" role="status">Loading factsheets...</div>
      : error ? <div className="ux-feedback-card ux-feedback-card-error" role="alert">
        <span>{error}</span>
        <button type="button" className="edit-button" onClick={() => setRetry(value => value + 1)}>Retry</button>
      </div>
      : <>
        <h1 className="no-print">Factsheets ({artworks.length})</h1>
        {artworks.length === 0 && <p role="status">No artworks match this category.</p>}
        <div className="print-list">{artworks.map(artwork =>
          <div className="print-sheet" key={artwork.id}>
            <ArtworkSheet artwork={artwork} canEdit={role === 'Administrator' || role === 'Editor'} />
          </div>)}</div>
      </>}
  </main>
}
