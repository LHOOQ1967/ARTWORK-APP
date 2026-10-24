'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSessionProfile } from '@/contexts/SessionContext'
import { useClientFilter } from '@/contexts/ClientFilterContext'
import { fetchWithAuth } from '@/lib/fetchWithAuth'
import { formatArtworkYears } from '@/lib/artworkYears'
import {
  certificateAddressLabel, certificateArtistLabel, certificateContactLabel,
  type CertificateLocationRow,
} from '@/lib/certificateLocations'
import { CertificateLocationHistory } from '@/components/artwork/CertificateLocation'
import CertificateLocationCells, { useCertificateContactOptions } from '@/components/artwork/CertificateLocationCells'
import { privateImageUrl } from '@/lib/privateImageUrl'

export default function CertificateLocationsPage() {
  const { role } = useSessionProfile()
  const { matchesClient } = useClientFilter()
  const canView = role === 'Viewer' || role === 'Editor' || role === 'Administrator'
  const canEdit = role === 'Editor' || role === 'Administrator'
  const contactOptions = useCertificateContactOptions(canEdit)
  const [rows, setRows] = useState<CertificateLocationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [reload, setReload] = useState(0)
  const [sort, setSort] = useState<{ key: 'artist' | 'contact'; direction: 'asc' | 'desc' }>({
    key: 'contact', direction: 'asc',
  })

  useEffect(() => {
    if (!canView) return
    let active = true
    void (async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetchWithAuth('/api/inventory/certificates')
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Unable to load certificate locations.')
        if (active) setRows(result.artworks)
      } catch (cause) {
        console.error('CERTIFICATE LOCATIONS PAGE LOAD FAILED:', cause)
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load certificate locations.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [canView, reload])

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('en')
    return rows.filter(row => matchesClient(row.id) && [
      row.title, certificateArtistLabel(row), certificateContactLabel(row),
      certificateAddressLabel(row), formatArtworkYears(row.year_execution, row.year_execution_start),
    ].join(' ').toLocaleLowerCase('en').includes(search)).sort((a, b) => {
      const label = sort.key === 'artist' ? certificateArtistLabel : certificateContactLabel
      const comparison = label(a).localeCompare(label(b), 'en', { sensitivity: 'base', numeric: true })
      return comparison * (sort.direction === 'asc' ? 1 : -1) ||
      certificateArtistLabel(a).localeCompare(certificateArtistLabel(b), 'en', { sensitivity: 'base' }) ||
      (a.title ?? '').localeCompare(b.title ?? '', 'en', { sensitivity: 'base', numeric: true }) ||
      a.id.localeCompare(b.id)
    })
  }, [rows, query, matchesClient, sort])

  if (!canView) return null
  return <section className="mx-auto max-w-[1600px] space-y-5 p-6 pt-20">
    <header>
      <h1 className="text-2xl font-semibold">Certificate locations</h1>
      <p className="text-sm text-gray-600">
        Artworks with a certificate or a recorded certificate location, regardless of artwork status.
        Locations are independent of artwork storage. The selected client filter applies.
      </p>
    </header>
    {loading ? <p role="status">Loading certificate locations...</p> : error ? (
      <div role="alert" className="rounded border border-red-300 bg-red-50 p-4 text-red-800">
        {error}
        <button type="button" className="ml-3 underline" onClick={() => setReload(value => value + 1)}>Retry</button>
      </div>
    ) : <>
      <label className="block max-w-xl text-sm">
        Search artworks or certificate locations
        <input className="mt-1 w-full rounded border px-3 py-2" value={query}
          onChange={event => setQuery(event.target.value)} />
      </label>
      <p className="text-sm text-gray-600">{filtered.length} artwork{filtered.length === 1 ? '' : 's'}</p>
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50"><tr>
            {['Image', 'Artist', 'Artwork', 'Year', 'Certificate contact', 'Certificate address', 'History']
              .map(label => {
                const key = label === 'Artist' ? 'artist' : label === 'Certificate contact' ? 'contact' : null
                return <th key={label} scope="col" className="p-3"
                  aria-sort={key ? sort.key === key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none' : undefined}>
                  {key ? <button type="button" aria-label={`Sort by ${label}`} className="text-left hover:underline"
                    onClick={() => setSort(current => ({
                      key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
                    }))}>{label}{sort.key === key ? sort.direction === 'asc' ? ' (ascending)' : ' (descending)' : ''}</button> : label}
                </th>
              })}
          </tr></thead>
          <tbody>{filtered.map(row => <tr key={row.id} className="border-t align-top">
            <td className="p-3">{row.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={privateImageUrl(row.image_url)} alt={row.title || 'Artwork'} width={64} height={64}
                loading="lazy" className="h-16 w-16 rounded object-cover" />
            ) : <span className="flex h-16 w-16 items-center justify-center rounded bg-gray-100 text-gray-500">No image</span>}</td>
            <td className="p-3">{certificateArtistLabel(row) || 'Not specified'}</td>
            <td className="p-3"><Link className="underline" href={`/artworks/print/${row.id}`}>{row.title || 'Untitled'}</Link></td>
            <td className="whitespace-nowrap p-3">{formatArtworkYears(row.year_execution, row.year_execution_start) || 'Not specified'}</td>
            <CertificateLocationCells row={row} canEdit={canEdit} contactOptions={contactOptions} onSaved={(updated, included) => {
              setRows(current => included
                ? current.map(item => item.id === row.id ? updated : item)
                : current.filter(item => item.id !== row.id))
            }} />
            <td className="p-3"><CertificateLocationHistory artworkId={row.id} /></td>
          </tr>)}</tbody>
        </table>
        {filtered.length === 0 && <p className="p-6 text-center">No certificate locations match the current filters.</p>}
      </div>
    </>}
  </section>
}
