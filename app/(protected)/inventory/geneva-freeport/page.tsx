'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionProfile } from '@/contexts/SessionContext'
import { useClientFilter } from '@/contexts/ClientFilterContext'
import { fetchWithAuth } from '@/lib/fetchWithAuth'
import { privateImageUrl } from '@/lib/privateImageUrl'
import { buildFreeportWorkbook } from '@/lib/genevaFreeportExcel'
import * as XLSX from 'xlsx-js-style'
import {
  documentFields, emptyDocument, freeportDraft, goodsDesignation, inventoryFields,
  parseFreeportInput, type FreeportDraft, type FreeportRow,
  compareFreeportRows, defaultFreeportSort, freeportPageColumns, type FreeportSortKey,
} from '@/lib/genevaFreeport'

function money(value: string | number | null | undefined, currency: string) {
  if (value == null) return '—'
  return `${currency} ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value)).replace(/,/g, "'")}`
}

export default function GenevaFreeportPage() {
  const { role } = useSessionProfile()
  const { matchesClient } = useClientFilter()
  const router = useRouter()
  const canEdit = role === 'Editor' || role === 'Administrator'
  const canView = canEdit || role === 'Viewer'
  const [rows, setRows] = useState<FreeportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [exportError, setExportError] = useState('')
  const [sort, setSort] = useState<{ key: FreeportSortKey; direction: 'asc' | 'desc' }>({
    ...defaultFreeportSort,
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<FreeportDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  const [reload, setReload] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (role && !canView) router.replace('/not-authorized')
  }, [role, canView, router])

  useEffect(() => {
    if (!canView) return
    let active = true
    async function load() {
      setLoading(true)
      setError('')
      try {
        const response = await fetchWithAuth('/api/inventory/geneva-freeport')
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Unable to load Geneva Freeport inventory.')
        if (!active) return
        setRows(result.artworks)
      } catch (failure) {
        if (!active) return
        console.error('GENEVA FREEPORT PAGE LOAD FAILED:', failure)
        setError(failure instanceof Error ? failure.message : 'Unable to load inventory.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [canView, reload])

  const clientRows = useMemo(() => rows.filter(row => matchesClient(row.id)), [rows, matchesClient])
  const filteredRows = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('en')
    return clientRows.filter(row => !search || [
      goodsDesignation(row), row.inventory?.inventory_number,
      row.inventory?.storage_location, row.inventory?.packing,
      row.inventory?.country_of_provenance,
      ...row.documents.flatMap(document => [
        document.document_reference, document.document_date, document.issuing_office,
        document.stamp_date, document.customs_reference, document.country_of_provenance,
      ]),
    ].join(' ').toLocaleLowerCase('en').includes(search))
      .sort((a, b) => compareFreeportRows(a, b, sort.key, sort.direction))
  }, [clientRows, query, sort])
  const selected = clientRows.find(row => row.id === selectedId)
  const dirty = Boolean(selected && draft && JSON.stringify(draft) !== JSON.stringify(freeportDraft(selected)))

  useEffect(() => {
    if (selectedId) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selectedId])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function edit(row: FreeportRow) {
    if (!canEdit) return
    if (dirty && !window.confirm('Discard unsaved inventory changes?')) return
    setSelectedId(row.id)
    setDraft(freeportDraft(row))
    setSaveError('')
    setSaved(false)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!canEdit || !selected || !draft || saving) return
    const input = parseFreeportInput(draft)
    if ('error' in input) { setSaveError(input.error); return }
    setSaving(true)
    setSaveError('')
    setSaved(false)
    try {
      const response = await fetchWithAuth(`/api/inventory/geneva-freeport/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to save inventory.')
      setRows(current => current.map(row => row.id !== selected.id ? row : {
        ...row,
        inventory: { ...row.inventory, artwork_id: row.id, ...input.inventory },
        documents: input.documents,
      }))
      setDraft(freeportDraft({
        ...selected,
        inventory: { ...selected.inventory, artwork_id: selected.id, ...input.inventory },
        documents: input.documents,
      }))
      setSaved(true)
    } catch (failure) {
      console.error('GENEVA FREEPORT PAGE SAVE FAILED:', failure)
      setSaveError(failure instanceof Error ? failure.message : 'Unable to save inventory.')
    } finally {
      setSaving(false)
    }
  }

  if (!canView) return null
  return (
    <section className="mx-auto max-w-[1600px] space-y-5 p-6 pt-20">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
        <h1 className="text-2xl font-semibold">Inventory Geneva Freeport</h1>
        <p className="text-sm text-gray-600">Customs and storage — Florac Works / PF, Geneva, Switzerland</p>
        <p className="mt-2 text-sm text-gray-600">
          Goods designations come from ArtMuse. Customs information is edited here, separately from artworks,
          and is not included in factsheets. Inventory values do not change artwork costs or insured values.
        </p>
        </div>
      </header>
      {loading ? <p>Loading inventory…</p> : error ? (
        <div role="alert" className="rounded border border-red-300 bg-red-50 p-4 text-red-800">
          {error}
          <button type="button" className="ml-3 underline" onClick={() => setReload(value => value + 1)}>Retry</button>
        </div>
      ) : (
        <>
          <label className="block max-w-xl text-sm">
            Search inventory
            <input className="mt-1 w-full rounded border px-3 py-2" value={query} onChange={event => setQuery(event.target.value)} />
          </label>
          <p className="text-sm text-gray-600">{filteredRows.length} artwork{filteredRows.length === 1 ? '' : 's'}</p>
          <button type="button" disabled={filteredRows.length === 0 || saving}
            className="rounded border px-4 py-2 disabled:opacity-50"
            onClick={() => {
              setExportError('')
              if (dirty && !window.confirm('The export uses saved inventory data. Continue without unsaved changes?')) return
              try {
                XLSX.writeFile(buildFreeportWorkbook(filteredRows), 'inventory-geneva-freeport.xlsx')
              } catch (failure) {
                console.error('GENEVA FREEPORT EXCEL EXPORT FAILED:', failure)
                setExportError(failure instanceof Error ? failure.message : 'Unable to export inventory.')
              }
            }}>Export Excel</button>
          {exportError && <p role="alert" className="text-red-700">{exportError}</p>}
          <p className="text-xs text-gray-600">Click a column heading to sort. Document Date uses the first customs document; full history is available in Edit Inventory.</p>
          <div className="overflow-x-auto rounded border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  {freeportPageColumns.map(column => column.key === 'image' || column.key === 'actions' ? (
                    <th key={column.key} className="p-3">{column.label}</th>
                  ) : (
                    <th key={column.key} className="p-3"
                      aria-sort={sort.key === column.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" className="text-left hover:underline"
                        onClick={() => setSort(current => ({
                          key: column.key,
                          direction: current.key === column.key && current.direction === 'asc' ? 'desc' : 'asc',
                        }))}>
                        {column.label}{sort.key === column.key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(row => (
                  <tr key={row.id} className="border-t align-top">
                    <td className="whitespace-nowrap p-3">{row.documents[0]?.document_date
                      ? String(row.documents[0].document_date).split('-').reverse().join('/')
                      : '—'}</td>
                    <td className="p-3">{row.inventory?.inventory_number ?? '—'}</td>
                    <td className="p-3">
                      {row.image_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={privateImageUrl(row.image_url)} alt={row.title ?? 'Artwork'}
                          width={64} height={64} loading="lazy" className="h-16 w-16 rounded object-cover" />
                      ) : (
                        <span className="flex h-16 w-16 items-center justify-center rounded bg-gray-100 text-gray-500">—</span>
                      )}
                    </td>
                    <td className="min-w-64 whitespace-pre-line p-3">{goodsDesignation(row) || 'Untitled'}</td>
                    <td className="whitespace-pre-line p-3">{row.inventory?.storage_location ?? '—'}</td>
                    <td className="p-3">{canEdit ? <button type="button" disabled={saving} className="rounded border px-3 py-1" onClick={() => edit(row)}>Edit Inventory</button> : <span className="text-gray-500">Read only</span>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-gray-50 font-semibold">
                  <td colSpan={6} className="p-3">
                    Total inventory insured value (available values): {money(filteredRows.reduce((sum, row) => sum + Number(row.inventory?.insured_value_usd ?? 0), 0), 'USD')}
                    <span className="ml-3 font-normal">{filteredRows.filter(row => row.inventory?.insured_value_usd == null).length} missing value(s)</span>
                  </td>
                </tr>
              </tfoot>
            </table>
            {filteredRows.length === 0 && <p className="p-6 text-center">No artworks at this location match the search.</p>}
          </div>
          {canEdit && selected && draft && (
            <form ref={formRef} onSubmit={save} className="space-y-5 rounded border bg-gray-50 p-5">
              <h2 className="text-lg font-semibold">Edit inventory — {selected.title || 'Untitled'}</h2>
              <pre className="whitespace-pre-wrap font-sans text-sm">{goodsDesignation(selected)}</pre>
              {selected.inventory?.source_file && <p className="text-xs text-gray-600">Source: {selected.inventory.source_file}, row {selected.inventory.source_row}</p>}
              <div className="grid gap-4 md:grid-cols-3">
                {inventoryFields.map(field => (
                  <Field key={field.key} field={field} value={draft.inventory[field.key]} disabled={saving}
                    onChange={value => { setSaved(false); setDraft({ ...draft, inventory: { ...draft.inventory, [field.key]: value } }) }} />
                ))}
              </div>
              <h3 className="font-semibold">Customs document history</h3>
              <p className="text-sm text-gray-600">Keep all previous documents. Their order follows the original inventory; the first is the most recent.</p>
              {draft.documents.map((document, index) => (
                <details key={index} open={index === 0} className="rounded border bg-white p-3">
                  <summary className="cursor-pointer">Document {index + 1}: {document.document_reference || 'New document'} {document.source_row ? `(source row ${document.source_row})` : ''}</summary>
                  <div className="mt-3 grid gap-4 md:grid-cols-3">
                    {documentFields.map(field => (
                      <Field key={field.key} field={field} value={document[field.key]} disabled={saving}
                        onChange={value => {
                          setSaved(false)
                          setDraft({ ...draft, documents: draft.documents.map((item, position) => position === index ? { ...item, [field.key]: value } : item) })
                        }} />
                    ))}
                  </div>
                  <button type="button" disabled={saving} className="mt-3 text-sm text-red-700 underline"
                    onClick={() => {
                      if (window.confirm('Remove this customs document from the history?')) {
                        setSaved(false)
                        setDraft({ ...draft, documents: draft.documents.filter((_, position) => position !== index) })
                      }
                    }}>Remove document</button>
                </details>
              ))}
              <button type="button" disabled={saving} className="rounded border px-3 py-2"
                onClick={() => { setSaved(false); setDraft({ ...draft, documents: [emptyDocument(), ...draft.documents] }) }}>Add customs document</button>
              {saveError && <p role="alert" className="text-red-700">{saveError}</p>}
              {saved && <p role="status" className="text-green-700">Inventory saved.</p>}
              <div className="flex gap-3">
                <button disabled={saving} type="submit" className="rounded bg-black px-4 py-2 text-white">{saving ? 'Saving…' : 'Save inventory'}</button>
                <button disabled={saving} type="button" className="rounded border px-4 py-2" onClick={() => {
                  if (dirty && !window.confirm('Discard unsaved inventory changes?')) return
                  setSelectedId(null)
                  setDraft(null)
                }}>Close</button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  )
}

function Field({ field, value, disabled, onChange }: Readonly<{
  field: { label: string; type?: string }
  value: string
  disabled: boolean
  onChange: (value: string) => void
}>) {
  const className = 'mt-1 w-full rounded border bg-white px-3 py-2'
  return (
    <label className="block text-sm">
      {field.label}
      {field.type === 'textarea' ? (
        <textarea className={className} rows={3} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} />
      ) : (
        <input className={className} type={field.type ?? 'text'} min={field.type === 'number' ? 0 : undefined}
          step={field.type === 'number' ? 'any' : undefined} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} />
      )}
    </label>
  )
}
