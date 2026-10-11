import { describe, expect, it } from 'vitest'
import {
  emptyDocument, freeportDraft, goodsDesignation, parseFreeportInput,
  type FreeportArtwork, type FreeportRow,
  compareFreeportRows, freeportColumns,
  freeportPageColumns,
  defaultFreeportSort,
} from '@/lib/genevaFreeport'

const artwork: FreeportArtwork = {
  id: 'work', title: 'ArtMuse title', year_execution: 2026, year_execution_start: 2024,
  medium: 'Oil on canvas', height_cm: 100, width_cm: 80, depth_cm: null,
  signature: 'Signed', edition: '3/10', artist: { first_name: 'First', last_name: 'Last' },
}

describe('Geneva Freeport inventory', () => {
  it('defaults to newest document dates first, with missing dates last', () => {
    expect(defaultFreeportSort).toEqual({ key: 'document_date', direction: 'desc' })
    const parsed = parseFreeportInput({ inventory: {}, documents: [
      { document_date: '2026-07-10' }, { document_date: '2024-01-31' },
    ] })
    if ('error' in parsed) throw new Error(parsed.error)
    const rows: FreeportRow[] = [
      { ...artwork, id: 'missing', inventory: null, documents: [] },
      { ...artwork, id: 'old', inventory: null, documents: [parsed.documents[1]] },
      { ...artwork, id: 'new', inventory: null, documents: [parsed.documents[0]] },
    ]
    expect(rows.sort((a, b) => compareFreeportRows(a, b, defaultFreeportSort.key, defaultFreeportSort.direction))
      .map(row => row.id)).toEqual(['new', 'old', 'missing'])
  })
  it('shows only the six requested page columns in their exact order', () => {
    expect(freeportPageColumns.map(column => column.label)).toEqual([
      'Document Date', 'Inventory No.', 'Image', 'Goods designation', 'RoomShelf', 'Edit Inventory',
    ])
  })
  it('sorts inventory numbers naturally in both directions', () => {
    const row = (id: string, number: string): FreeportRow => ({
      ...artwork, id, documents: [], inventory: {
        artwork_id: id, ...freeportDraft({ ...artwork, inventory: null, documents: [] }).inventory,
        inventory_number: number,
      },
    })
    expect(compareFreeportRows(row('a', 'PET.2'), row('b', 'PET.10'), 'inventory_number', 'asc')).toBeLessThan(0)
    expect(compareFreeportRows(row('a', 'PET.2'), row('b', 'PET.10'), 'inventory_number', 'desc')).toBeGreaterThan(0)
  })

  it('sorts amounts numerically and places missing values last in both directions', () => {
    const row = (id: string, value: number | null): FreeportRow => ({
      ...artwork, id, documents: [], inventory: {
        artwork_id: id, ...freeportDraft({ ...artwork, inventory: null, documents: [] }).inventory,
        insured_value_usd: value,
      },
    })
    expect(compareFreeportRows(row('a', 900), row('b', 10000), 'insured_value_usd', 'asc')).toBeLessThan(0)
    for (const direction of ['asc', 'desc'] as const) {
      expect(compareFreeportRows(row('a', null), row('b', 0), 'insured_value_usd', direction)).toBeGreaterThan(0)
    }
  })

  it('sorts by first document date without mutating document history and supports every column', () => {
    const input = parseFreeportInput({ inventory: {}, documents: [
      { document_date: '2026-01-01' }, { document_date: '2023-01-01' },
    ] })
    if ('error' in input) throw new Error(input.error)
    const first: FreeportRow = { ...artwork, id: 'a', inventory: null, documents: input.documents }
    const second: FreeportRow = { ...artwork, id: 'b', inventory: null, documents: [{ ...input.documents[0], document_date: '2025-12-31' }] }
    expect(compareFreeportRows(first, second, 'document_date', 'asc')).toBeGreaterThan(0)
    expect(first.documents[0].document_date).toBe('2026-01-01')
    for (const column of freeportColumns) {
      expect(Number.isFinite(compareFreeportRows(first, second, column.key, 'asc'))).toBe(true)
    }
  })

  it('uses ArtMuse designation, dimensions and dates rather than source descriptions', () => {
    const row: FreeportRow = { ...artwork, inventory: null, documents: [] }
    expect(goodsDesignation(row)).toBe('First Last\nArtMuse title, 2024/2026\nOil on canvas\nSigned\nEdition: 3/10\n100 x 80 cm')
  })

  it('creates blank forms for artworks without customs records', () => {
    const draft = freeportDraft({ ...artwork, inventory: null, documents: [] })
    expect(draft.inventory.inventory_number).toBe('')
    expect(draft.documents).toEqual([])
    expect(emptyDocument().document_date).toBe('')
  })

  it('preserves zero inventory values, historical dates and source rows in forms', () => {
    const parsed = parseFreeportInput({
      inventory: { insured_value_usd: 0 },
      documents: [{ document_reference: 'Doc A', document_date: '2024-01-31', source_row: 6 }],
    })
    if ('error' in parsed) throw new Error(parsed.error)
    const draft = freeportDraft({ ...artwork, inventory: { ...parsed.inventory, artwork_id: artwork.id }, documents: parsed.documents })
    expect(draft.inventory.insured_value_usd).toBe('0')
    expect(draft.documents[0].document_date).toBe('2024-01-31')
    expect(draft.documents[0].source_row).toBe(6)
  })

  it('validates non-negative values and keeps document ordering and empty fields', () => {
    const parsed = parseFreeportInput({
      inventory: { entry_value: "1'234.50", entry_currency: 'USD', packing: ' Box ' },
      documents: [{ document_reference: 'Most recent' }, { document_reference: 'Earlier' }],
    })
    if ('error' in parsed) throw new Error(parsed.error)
    expect(parsed.inventory.entry_value).toBe(1234.5)
    expect(parsed.inventory.packing).toBe('Box')
    expect(parsed.documents.map(doc => doc.document_reference)).toEqual(['Most recent', 'Earlier'])
    expect(parsed.documents[0].stamp_date).toBeNull()
  })

  it.each([
    { entry_value: -1 }, { insured_value_usd: 'invalid' }, { entry_value: true },
    { entry_currency: 'usd' }, { entry_currency: 'US' },
  ])('rejects invalid inventory values: %j', inventory => {
    expect(parseFreeportInput({ inventory, documents: [] })).toHaveProperty('error')
  })

  it.each(['2024-02-30', '31.01.2024', 'invalid'])('rejects invalid document dates: %s', document_date => {
    expect(parseFreeportInput({ inventory: {}, documents: [{ document_date }] })).toHaveProperty('error')
  })

  it('accepts leap days and flags malformed documents instead of silently discarding them', () => {
    expect(parseFreeportInput({ inventory: {}, documents: [{ document_date: '2024-02-29' }] })).not.toHaveProperty('error')
    expect(parseFreeportInput({ inventory: {}, documents: [null] })).toHaveProperty('error')
    expect(parseFreeportInput({ inventory: {}, documents: [{ source_row: -1 }] })).toHaveProperty('error')
    expect(parseFreeportInput(null)).toHaveProperty('error')
  })

  it('does not allow inventory edits to change artwork or source-provenance fields', () => {
    const parsed = parseFreeportInput({
      inventory: { title: 'Overwrite', location_contact_id: 'other', source_description: 'Changed' },
      documents: [],
    })
    if ('error' in parsed) throw new Error(parsed.error)
    expect(parsed.inventory).not.toHaveProperty('title')
    expect(parsed.inventory).not.toHaveProperty('location_contact_id')
    expect(parsed.inventory).not.toHaveProperty('source_description')
  })
})
