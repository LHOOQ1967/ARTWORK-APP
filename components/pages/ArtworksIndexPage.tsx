'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import ArtworkList from '@/components/artwork/ArtworkList'
import {
  ARTWORK_PROPOSAL_SORT_KEYS, ARTWORK_PROPOSAL_SORT_PRECEDENCE,
  DEFAULT_ARTWORK_TABLE_STATE, useArtworkListNavigation, type ArtworkProposalSort, type ArtworkTableState,
} from '@/components/artwork/useArtworkListNavigation'
import { usePaginatedArtworks } from '@/components/artwork/usePaginatedArtworks'
import { artworkPageFilters } from '@/lib/paginatedArtworkLists'
import { supabase } from '@/lib/supabaseBrowser'
import { useSessionProfile } from '@/contexts/SessionContext'
import { useClientFilter } from '@/contexts/ClientFilterContext'
import SearchSelect from '@/components/ui/SearchSelect'
import { categoryFactsheetsUrl } from '@/lib/categoryFactsheets'

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

function activeGroupLabel(
  id: string,
  artwork: { priority?: string | null; status?: string | null } | undefined,
  selectedSorts: ReadonlySet<ArtworkProposalSort>,
) {
  const labels = [id.startsWith('auction') ? 'Auctions' : 'Private market']
  if (selectedSorts.has('priority')) {
    const priority = artwork?.priority?.trim().toLowerCase() ?? ''
    const priorityLabels: Record<string, string> = {
      high: 'High', medium: 'Medium', low: 'Low', information: 'Information',
    }
    labels.push(priorityLabels[priority] ?? 'Other')
  }
  if (selectedSorts.has('status')) labels.push(artwork?.status?.trim() || 'Unknown')
  return labels.join(' — ')
}

function priorityGroupRank(priority?: string | null) {
  const order: Record<string, number> = { high: 0, medium: 1, low: 2, information: 3 }
  return order[priority?.trim().toLowerCase() ?? ''] ?? 4
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
  const query = useSearchParams().toString()
  const [ready, setReady] = useState(false)
  const defaultProposalSort = forcedStatus === 'Active'
    ? ARTWORK_PROPOSAL_SORT_PRECEDENCE.join(',') : ''
  const navigation = useArtworkListNavigation(navigationScope, ready, query, defaultProposalSort)
  const { filters, tables } = navigation
  const requestFilters = artworkPageFilters(
    filters.proposalSort === 'none' ? { ...filters, proposalSort: '' } : filters,
    forcedStatus, selectedClientId, fixedProposedToId,
  )
  const { data, loading, refreshing, error, refresh } = usePaginatedArtworks(navigationScope, requestFilters, tables)
  const isReady = !loading && !refreshing && !error
  useEffect(() => { setReady(isReady) }, [isReady])
  const [savingInlineKey, setSavingInlineKey] = useState<string | null>(null)
  const [inlineError, setInlineError] = useState('')
  const [inlineSuccess, setInlineSuccess] = useState('')
  const isViewer = role?.toLowerCase() === 'viewer'
  const canEdit = role === 'Administrator' || role === 'Editor'
  const statuses = Array.from(new Set(['Draft', 'Viewed', 'Negotiation', 'Bought', 'Archived', ...(data?.statuses ?? [])]))
  const includesMarket = filters.marketType === 'all' || filters.marketType === 'market'
  const includesAuctions = filters.marketType === 'all' || filters.marketType === 'auction'

  function updateMarketType(market: boolean, auctions: boolean) {
    navigation.updateFilters({ marketType: market ? auctions ? 'all' : 'market' : auctions ? 'auction' : 'none' })
  }

  function updateProposalSort(sort: ArtworkProposalSort, checked: boolean) {
    const selected = new Set((filters.proposalSort === 'none' ? '' : filters.proposalSort).split(',').filter(Boolean))
    if (checked) selected.add(sort)
    else selected.delete(sort)
    navigation.updateFilters({
      proposalSort: ARTWORK_PROPOSAL_SORT_PRECEDENCE.filter(key => selected.has(key)).join(',') || 'none',
    })
  }

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

  const orderByMarketType = forcedStatus === 'Active'
  const selectedProposalSorts = new Set(
    ARTWORK_PROPOSAL_SORT_KEYS.filter(sort => filters.proposalSort.split(',').includes(sort)),
  )
  const groups = [...(data?.groups ?? [])].sort((a, b) => {
    if (!orderByMarketType) return groupOrder.indexOf(a.id) - groupOrder.indexOf(b.id)
    const sectionRank = (id: string) => id === 'market' || id.startsWith('market-') ? 0
      : id === 'auction' || id.startsWith('auction-') ? 1 : 2
    const sectionDifference = sectionRank(a.id) - sectionRank(b.id)
    if (sectionDifference !== 0) return sectionDifference
    if (selectedProposalSorts.has('priority')) {
      const priorityDifference = priorityGroupRank(a.rows[0]?.priority) - priorityGroupRank(b.rows[0]?.priority)
      if (priorityDifference !== 0) return priorityDifference
    }
    if (selectedProposalSorts.has('status')) {
      const statusDifference = (a.rows[0]?.status ?? '').localeCompare(
        b.rows[0]?.status ?? '', 'fr-CH', { sensitivity: 'base' })
      if (statusDifference !== 0) return statusDifference
    }
    return a.id.localeCompare(b.id)
  })
  const sectionTotals = (section: string) => groups.filter(group =>
    group.id === section || group.id.startsWith(`${section}-`))
    .reduce((total, group) => total + group.total, 0)
  const categoryCount = (category: string, total: number) => (
    <Link className="artwork-index-category-count"
      href={categoryFactsheetsUrl(category, requestFilters, tables,
        typeof window === 'undefined' ? undefined : window.location.pathname + window.location.search)}
      onClick={navigation.saveScroll} title="Open category factsheets">({total})</Link>
  )

  return <main style={mainStyle}>
    <div className="artwork-index-shell">
      <div className="artwork-index-header">
        <div>
          <h1 className="artwork-index-title">{title ?? 'Artworks — Private market & Auctions'}</h1>
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
          {forcedStatus !== 'Bought' && (
            <fieldset className="artwork-index-market-filter">
              <legend>Market type</legend>
              <div className="artwork-index-market-options">
                <label>
                  <input type="checkbox" checked={includesMarket}
                    onChange={event => updateMarketType(event.target.checked, includesAuctions)} />
                  Private market
                </label>
                <label>
                  <input type="checkbox" checked={includesAuctions}
                    onChange={event => updateMarketType(includesMarket, event.target.checked)} />
                  Auctions
                </label>
                {orderByMarketType && ARTWORK_PROPOSAL_SORT_KEYS.map(sort => (
                  <label key={sort} className="artwork-index-order-checkbox">
                    <input type="checkbox" checked={selectedProposalSorts.has(sort)}
                      onChange={event => updateProposalSort(sort, event.target.checked)} />
                    {sort === 'status' ? 'Sort by status' : 'Sort by priority'}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div style={{ minWidth: 0 }}>
            <label htmlFor="artwork-from-date" className="artwork-index-field-label">
              From date <span style={{ fontWeight: 'normal', fontSize: 12 }}>(Bought = acquisition date, Archived = proposed date)</span>
            </label>
            <input id="artwork-from-date" type="date" aria-label="From date" value={filters.fromDate}
              className="artwork-index-date-input"
              onChange={event => navigation.updateFilters({ fromDate: event.target.value })} />
          </div>
          <SearchSelect label="Artist" placeholder="Search artist…" valueId={filters.artistId}
            onChangeId={artistId => navigation.updateFilters({ artistId })} options={data?.artists ?? []} />
          <div className="artwork-index-search-field">
            <label htmlFor="artwork-search" style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 'bold' }}>Search</label>
            <input id="artwork-search" type="search" value={filters.search} style={inputStyle}
              placeholder="Title, artist, status, contact, location…"
              onChange={event => navigation.updateFilters({ search: event.target.value })} />
          </div>
        </div>
        <div className="artwork-index-filter-actions">
          <button type="button" className="artwork-index-reset-button" onClick={() =>
            navigation.updateFilters({ artistId: 'all',
              marketType: 'all', proposalSort: defaultProposalSort, search: '', fromDate: '' })
          }>Reset filters</button>
        </div>
      </section>
      {inlineError && <p role="alert">{inlineError}</p>}
      {inlineSuccess && <div className="ux-inline-success" role="status">{inlineSuccess}</div>}
      {groups.map((group, index) => {
        const section = group.id === 'market' || group.id.startsWith('market-') ? 'market'
          : group.id === 'auction' || group.id.startsWith('auction-') ? 'auction'
          : group.id === 'bought' ? 'bought' : 'archived'
        const previousId = groups[index - 1]?.id
        const previousSection = previousId === 'market' || previousId?.startsWith('market-') ? 'market'
          : previousId === 'auction' || previousId?.startsWith('auction-') ? 'auction'
          : previousId === 'bought' ? 'bought' : 'archived'
        const sectionStart = index === 0 || section !== previousSection
        const table = tables[group.id] ?? DEFAULT_ARTWORK_TABLE_STATE
        const showSubgroup = !orderByMarketType || selectedProposalSorts.size > 0
        const subgroupLabel = orderByMarketType
          ? activeGroupLabel(group.id, group.rows[0], selectedProposalSorts) : groupLabel(group.id)
        return <section key={group.id} style={{ marginTop: 16 }}>
          {sectionStart && <div style={sectionHeaderStyle}><h2 style={{ fontSize: '1.6rem', fontWeight: 500, margin: 0 }}>
            {section === 'market' ? 'Private market' : section === 'auction' ? 'Auctions'
              : section === 'bought' ? 'Bought' : 'Archived'}{' '}
            {categoryCount(section, section === 'bought' ? group.total : sectionTotals(section))}
          </h2></div>}
          {group.id !== 'bought' && showSubgroup && <h3 style={{ fontSize: '1.1rem', fontWeight: 400, marginBottom: 6 }}>
            {subgroupLabel} {orderByMarketType ? `(${group.total})` : categoryCount(group.id, group.total)}
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
