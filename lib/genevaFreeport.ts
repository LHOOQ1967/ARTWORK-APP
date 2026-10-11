import { formatArtworkYears } from '@/lib/artworkYears'

export const FREEPORT_CONTACT_ID = 'abbcf211-f94e-4435-918e-775390164cb2'
export const FREEPORT_ADDRESS_ID = '9b46dacc-7e21-4be6-ac45-7c4dfc62882f'

export const inventoryFields = [
  { key: 'inventory_number', label: 'Inventory number' },
  { key: 'owner_name', label: 'Owner' },
  { key: 'country_of_provenance', label: 'Country of provenance' },
  { key: 'entry_value', label: 'Entry value', type: 'number' },
  { key: 'entry_currency', label: 'Entry currency' },
  { key: 'insured_value_usd', label: 'Inventory insured value (USD)', type: 'number' },
  { key: 'storage_location', label: 'Room / shelf', type: 'textarea' },
  { key: 'packing', label: 'Packing / crates', type: 'textarea' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
] as const

export const documentFields = [
  { key: 'document_reference', label: 'Previous document / reference', type: 'textarea' },
  { key: 'document_date', label: 'Document date', type: 'date' },
  { key: 'issuing_office', label: 'Issuing office' },
  { key: 'stamp_date', label: 'Stamp date', type: 'date' },
  { key: 'customs_reference', label: 'Customs reference (11.95)' },
  ...inventoryFields.filter(field => field.key !== 'inventory_number'),
] as const

export type InventoryKey = typeof inventoryFields[number]['key']
export type DocumentKey = typeof documentFields[number]['key']
type Values<K extends string> = Record<K, string | number | null>
export type FreeportInventory = Values<InventoryKey> & {
  artwork_id: string
  source_file?: string | null
  source_row?: number | null
  source_description?: string | null
}
export type FreeportDocument = Values<DocumentKey> & { source_row?: number | null }
export type FreeportArtwork = {
  id: string
  title: string | null
  year_execution: number | null
  year_execution_start: number | null
  medium: string | null
  height_cm: number | null
  width_cm: number | null
  depth_cm: number | null
  signature: string | null
  edition: string | null
  artist: { first_name: string | null; last_name: string | null } | null
}
export type FreeportRow = FreeportArtwork & {
  image_url?: string | null
  inventory: FreeportInventory | null
  documents: FreeportDocument[]
}
export type FreeportDraft = {
  inventory: Record<InventoryKey, string>
  documents: (Record<DocumentKey, string> & { source_row?: number | null })[]
}

export const freeportColumns = [
  { key: 'inventory_number', label: 'Inventory no.' },
  { key: 'document_reference', label: 'Previous document' },
  { key: 'document_date', label: 'Document date' },
  { key: 'issuing_office', label: 'Issuing office' },
  { key: 'stamp_date', label: 'Stamp date' },
  { key: 'customs_reference', label: 'Customs reference (11.95)' },
  { key: 'designation', label: 'Goods designation (ArtMuse)' },
  { key: 'owner_name', label: 'Owner' },
  { key: 'country_of_provenance', label: 'Country of provenance' },
  { key: 'entry_value', label: 'Entry value' },
  { key: 'insured_value_usd', label: 'Insured value (USD)' },
  { key: 'storage_location', label: 'Room / shelf' },
  { key: 'packing', label: 'Packing' },
  { key: 'documents', label: 'Documents' },
] as const

export const freeportPageColumns = [
  { key: 'document_date', label: 'Document Date' },
  { key: 'inventory_number', label: 'Inventory No.' },
  { key: 'image', label: 'Image' },
  { key: 'designation', label: 'Goods designation' },
  { key: 'storage_location', label: 'RoomShelf' },
  { key: 'actions', label: 'Edit Inventory' },
] as const

export type FreeportSortKey = typeof freeportColumns[number]['key']

export const defaultFreeportSort: { key: FreeportSortKey; direction: 'asc' | 'desc' } = {
  key: 'document_date', direction: 'desc',
}

export function compareFreeportRows(
  first: FreeportRow, second: FreeportRow, key: FreeportSortKey, direction: 'asc' | 'desc'
) {
  function value(row: FreeportRow): string | number | null {
    if (key === 'designation') return goodsDesignation(row)
    if (key === 'documents') return row.documents.length
    if (key === 'document_reference' || key === 'document_date' || key === 'issuing_office' ||
      key === 'stamp_date' || key === 'customs_reference') return row.documents[0]?.[key] ?? null
    const raw = row.inventory?.[key] ?? null
    return raw !== null && (key === 'entry_value' || key === 'insured_value_usd') ? Number(raw) : raw
  }
  const a = value(first)
  const b = value(second)
  const emptyA = a === null || a === ''
  const emptyB = b === null || b === ''
  // Missing values remain last in both directions.
  if (emptyA !== emptyB) return emptyA ? 1 : -1
  const comparison = typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a ?? '').localeCompare(String(b ?? ''), 'en', { numeric: true, sensitivity: 'base' })
  return comparison === 0
    ? first.id.localeCompare(second.id)
    : comparison * (direction === 'asc' ? 1 : -1)
}

export function goodsDesignation(artwork: FreeportArtwork) {
  const artist = [artwork.artist?.first_name, artwork.artist?.last_name].filter(Boolean).join(' ')
  const years = formatArtworkYears(artwork.year_execution, artwork.year_execution_start)
  const dimensions = [artwork.height_cm, artwork.width_cm, artwork.depth_cm]
    .filter(value => value !== null && value > 0)
  return [
    artist,
    [artwork.title, years].filter(Boolean).join(', '),
    artwork.medium,
    artwork.signature,
    artwork.edition ? `Edition: ${artwork.edition}` : null,
    dimensions.length ? `${dimensions.join(' x ')} cm` : null,
  ].filter(Boolean).join('\n')
}

export function emptyDocument(): Record<DocumentKey, string> {
  return Object.fromEntries(documentFields.map(field => [field.key, ''])) as Record<DocumentKey, string>
}

export function freeportDraft(row: FreeportRow): FreeportDraft {
  return {
    inventory: Object.fromEntries(inventoryFields.map(field => [field.key, String(row.inventory?.[field.key] ?? '')])) as Record<InventoryKey, string>,
    documents: row.documents.map(document => ({
      ...Object.fromEntries(documentFields.map(field => [field.key, String(document[field.key] ?? '')])) as Record<DocumentKey, string>,
      source_row: document.source_row,
    })),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseFreeportInput(body: unknown):
  | { error: string }
  | { inventory: Values<InventoryKey>; documents: FreeportDocument[] } {
  if (!isRecord(body) || !isRecord(body.inventory) || !Array.isArray(body.documents)) {
    return { error: 'Inventory and customs documents are required.' }
  }
  if (body.documents.length > 200) return { error: 'At most 200 customs documents are allowed per artwork.' }
  function parseFields<K extends string>(
    value: Record<string, unknown>,
    fields: readonly { key: K; label: string; type?: string }[]
  ): Values<K> {
    const result = {} as Values<K>
    for (const field of fields) {
      const raw = value[field.key]
      if (raw == null || raw === '') { result[field.key] = null; continue }
      if (field.type === 'number') {
        if (typeof raw !== 'number' && typeof raw !== 'string') throw new Error(`${field.label} must be a number.`)
        const amount = typeof raw === 'number' ? raw : Number(raw.trim().replace(/'/g, ''))
        if (!Number.isFinite(amount) || amount < 0 || String(raw).trim() === '') throw new Error(`${field.label} must be a non-negative number.`)
        result[field.key] = amount
      } else {
        if (typeof raw !== 'string') throw new Error(`${field.label} must be text.`)
        const text = raw.trim()
        if (field.type === 'date' && text) {
          const date = new Date(`${text}T00:00:00Z`)
          if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
            throw new Error(`${field.label} must be a valid date.`)
          }
        }
        if (field.key === 'entry_currency' && text && !/^[A-Z]{3}$/.test(text)) throw new Error('Entry currency must be a three-letter uppercase code.')
        result[field.key] = text || null
      }
    }
    return result
  }
  try {
    const inventory = parseFields(body.inventory, inventoryFields)
    const documents = body.documents.map(value => {
      if (!isRecord(value)) throw new Error('Invalid customs document.')
      const fields = parseFields(value, documentFields)
      const sourceRow = value.source_row
      if (sourceRow != null && (typeof sourceRow !== 'number' || !Number.isInteger(sourceRow) || sourceRow < 1)) {
        throw new Error('Invalid source row.')
      }
      return { ...fields, source_row: sourceRow == null ? null : sourceRow as number }
    })
    return { inventory, documents }
  } catch (error) {
    if (error instanceof Error) return { error: error.message }
    throw error
  }
}
