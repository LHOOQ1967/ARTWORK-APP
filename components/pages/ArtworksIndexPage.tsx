'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import ArtworkList from '@/components/artwork/ArtworkList'
import {
  DEFAULT_ARTWORK_TABLE_STATE, useArtworkListNavigation, type ArtworkTableState,
} from '@/components/artwork/useArtworkListNavigation'
import { usePaginatedArtworks } from '@/components/artwork/usePaginatedArtworks'
import { artworkPageFilters } from '@/lib/paginatedArtworkLists'
import { supabase } from '@/lib/supabaseBrowser'
import { useSessionProfile } from '@/contexts/SessionContext'
import { useClientFilter } from '@/contexts/ClientFilterContext'
import SearchSelect from '@/components/ui/SearchSelect'

type Props = {
  title?: string
  fixedProposedToId?: string
  forcedStatus?: 'Bought' | 'Archived' | 'Active'
}

export default function ArtworksIndexPage(props: Props) {
  const { user, role } = useSessionProfile()
  const { selectedClientId } = useClientFilter()
  const scope = JSON.stringify([
    user?.id ?? null, role ?? null, selectedClientId ?? null,
    props.forcedStatus ?? null, props.fixedProposedToId ?? null,
  ])
  return <ArtworksIndexContent key={scope} {...props} navigationScope={scope} />
}

function groupLabel(id: string) {
  if (id === 'bought') return 'Bought'
  if (id === 'archived-market') return 'Archived — Private market'
  if (id === 'archived-auction') return 'Archived — Auctions'
  const [market, priority, kind] = id.split('-')
  return `${market === 'auction' ? 'Auctions' : 'Private market'} — ${priority}${kind === 'drafts' ? ' Not viewed yet' : ''}`
}

const groupOrder = [
  ...['market', 'auction'].flatMap(market =>
    ['High', 'Medium', 'Low', 'Information', 'Other'].flatMap(priority =>
      [`${market}-${priority}-others`, `${market}-${priority}-drafts`])),
  'bought', 'archived-market', 'archived-auction',
]

function ArtworksIndexContent({
  title, forcedStatus, fixedProposedToId, navigationScope,
}: Props & { navigationScope: string }) {
  const { role } = useSessionProfile()
  const { selectedClientId } = useClientFilter()
  const [ready, setReady] = useState(false)
  const navigation = useArtworkListNavigation(navigationScope, ready)
  const { filters, tables } = navigation
  const requestFilters = artworkPageFilters(filters, forcedStatus, selectedClientId, fixedProposedToId)
  const { data, loading, refreshing, error, refresh } = usePaginatedArtworks(navigationScope, requestFilters, tables)
  const isReady = !loading && !refreshing && !error
  useEffect(() => { setReady(isReady) }, [isReady])
  const [savingInlineKey, setSavingInlineKey] = useState<string | null>(null)
  const [inlineError, setInlineError] = useState('')
  const [inlineSuccess, setInlineSuccess] = useState('')
  const isViewer = role?.toLowerCase() === 'viewer'
  const canEdit = role === 'Administrator' || role === 'Editor'
  const statuses = Array.from(new Set(['Draft', 'Viewed', 'Negotiation', 'Bought', 'Archived', ...(data?.statuses ?? [])]))

  async function updateArtwork(id: string, field: 'status' | 'quality' | 'priority', value: string | number | null) {
    if (!canEdit) return
    setSavingInlineKey(`${id}:${field}`)
    setInlineError('')
    setInlineSuccess('')
    try {
      const { data, error } = await supabase.from('artworks')
        .update({ [field]: value === '' ? null : value })
        .eq('id', id).select('id, status, quality, priority, view_date').maybeSingle()
      if (error || !data) throw new Error(error?.message || 'Failed to update artwork')
      setInlineSuccess('Changes saved.')
      refresh()
    } catch (cause) {
      console.error('UPDATE ARTWORK FIELD ERROR:', cause)
      setInlineError(cause instanceof Error ? cause.message : 'Failed to update artwork')
    } finally {
      setSavingInlineKey(null)
    }
  }

  function changeSort(id: string, state: ArtworkTableState) {
    navigation.updateTable(id, { ...state, loadedCount: 20 })
  }

  if (loading && !data) return <main style={mainStyle}>
    <div className="ux-feedback-card" role="status">
      <span className="ux-spinner" aria-hidden="true" />Loading artworks...
    </div>
  </main>

  if (error) return <main style={mainStyle}>
    <div className="ux-feedback-card ux-feedback-card-error" role="alert">
      <strong>Unable to load artworks.</strong><span>{error}</span>
      <button type="button" className="edit-button" onClick={refresh}>Retry</button>
    </div>
  </main>

  const groups = [...(data?.groups ?? [])].sort((a, b) => groupOrder.indexOf(a.id) - groupOrder.indexOf(b.id))
  const sectionTotals = (prefix: string) => groups.filter(group => group.id.startsWith(prefix))
    .reduce((total, group) => total + group.total, 0)

  return <main style={mainStyle}>
    <div className="artwork-index-shell">
      <div className="artwork-index-header">
        <div>
          <div className="artwork-index-eyebrow">Collection management</div>
          <h1 className="artwork-index-title">{title ?? 'Artworks — Private market & Auctions'}</h1>
          <p className="artwork-index-subtitle">Review, filter and update proposals from one workspace.</p>
          {refreshing && <p role="status" aria-live="polite">Refreshing artworks...</p>}
        </div>
        {!isViewer && <Link className="no-print artwork-index-new-link" href="/artworks/new">
          <button className="artwork-index-primary-button">+ New artwork</button>
        </Link>}
      </div>

      <section className="no-print artwork-index-filters">
        <div className="artwork-index-filter-heading">
          <div>
            <div className="artwork-index-filter-title">Filters</div>
            <div className="artwork-index-filter-caption">Refine the proposals displayed below</div>
          </div>
          <div className="artwork-index-count">{data?.total ?? 0} proposals</div>
        </div>
        <div className="artwork-index-filter-grid">
          <div style={{ minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 'bold', marginBottom: 6 }}>
              From date <span style={{ fontWeight: 'normal', fontSize: 12 }}>(Bought = acquisition date, Archived = proposed date)</span>
              <input type="date" aria-label="From date" value={filters.fromDate} style={inputStyle}
                onChange={event => navigation.updateFilters({ fromDate: event.target.value })} />
            </label>
          </div>
          <SearchSelect label="Artist" placeholder="Search artist…" valueId={filters.artistId}
            onChangeId={artistId => navigation.updateFilters({ artistId })} options={data?.artists ?? []} />
          <div className="artwork-index-search-field">
            <label htmlFor="artwork-search" style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 'bold' }}>Search</label>
            <input id="artwork-search" type="search" value={filters.search} style={inputStyle}
              placeholder="Title, artist, status, contact, location…"
              onChange={event => navigation.updateFilters({ search: event.target.value })} />
          </div>
          <SearchSelect label="Proposed by" placeholder="Search contact…" valueId={filters.proposedBy}
            onChangeId={proposedBy => navigation.updateFilters({ proposedBy })} options={data?.proposers ?? []} />
          {!fixedProposedToId && !isViewer && <SearchSelect label="Proposed to" placeholder="Search contact…"
            valueId={filters.proposedTo} onChangeId={proposedTo => navigation.updateFilters({ proposedTo })}
            options={data?.recipients ?? []} />}
        </div>
        <div className="artwork-index-filter-actions">
          <button type="button" className="artwork-index-reset-button" onClick={() =>
            navigation.updateFilters({ artistId: 'all', proposedBy: 'all', proposedTo: 'all', search: '', fromDate: '' })
          }>Reset filters</button>
          <button type="button" className="artwork-index-reset-button" disabled={refreshing} onClick={refresh}>Refresh</button>
        </div>
      </section>
      {inlineError && <p role="alert">{inlineError}</p>}
      {inlineSuccess && <div className="ux-inline-success" role="status">{inlineSuccess}</div>}
      {groups.map((group, index) => {
        const section = group.id.startsWith('market-') ? 'market' : group.id.startsWith('auction-') ? 'auction'
          : group.id === 'bought' ? 'bought' : 'archived'
        const previousId = groups[index - 1]?.id
        const sectionStart = index === 0 || !previousId?.startsWith(section === 'archived' ? 'archived-' : `${section}-`)
        const table = tables[group.id] ?? DEFAULT_ARTWORK_TABLE_STATE
        return <section key={group.id} style={{ marginTop: 16 }}>
          {sectionStart && <div style={sectionHeaderStyle}><h2 style={{ fontSize: '1.6rem', fontWeight: 500, margin: 0 }}>
            {section === 'market' ? `Private market (${sectionTotals('market-')})`
              : section === 'auction' ? `Auctions (${sectionTotals('auction-')})`
              : section === 'bought' ? `Bought (${group.total})` : `Archived (${sectionTotals('archived-')})`}
          </h2></div>}
          {group.id !== 'bought' && <h3 style={{ fontSize: '1.1rem', fontWeight: 400, marginBottom: 6 }}>
            {groupLabel(group.id)} ({group.total})
          </h3>}
          <ArtworkList artworks={group.rows} mode={section === 'bought' ? 'bought' : group.id.includes('auction') ? 'auction' : 'market'}
            section={section === 'archived' ? 'archived' : 'active'} tableState={table}
            onTableStateChange={state => changeSort(group.id, state)} onOpenArtwork={navigation.saveScroll}
            canEditStatusPriority={canEdit} statusOptions={statuses} savingInlineKey={savingInlineKey}
            onUpdateArtworkField={updateArtwork}
            pagination={{ total: group.total, loading: loading || refreshing, onLoadMore: () =>
              navigation.updateTable(group.id, { ...table, loadedCount: group.rows.length + 20 }) }} />
        </section>
      })}
      {data?.total === 0 && <div className="ux-empty-state" role="status">No artworks match the selected filters.</div>}
    </div>
  </main>
}

const mainStyle: React.CSSProperties = {
  minHeight: '100vh', backgroundColor: '#f3f5f1', paddingTop: 98, paddingBottom: 56,
  paddingLeft: 20, paddingRight: 20, boxSizing: 'border-box', width: '100%', overflowX: 'hidden',
}
const inputStyle: React.CSSProperties = {
  width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: '8px 6px', fontSize: 16,
  borderRadius: 8, border: '1px solid rgba(0,0,0,0.25)', backgroundColor: '#fff', WebkitAppearance: 'none',
}
const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
  marginTop: 30, marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid rgba(0,96,57,0.18)',
}
