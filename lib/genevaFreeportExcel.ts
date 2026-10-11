import * as XLSX from 'xlsx-js-style'
import { documentFields, goodsDesignation, inventoryFields, type FreeportRow } from '@/lib/genevaFreeport'

function excelDate(value: string | number | null) {
  if (!value) return ''
  const timestamp = Date.parse(`${value}T00:00:00Z`)
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid customs date: ${value}`)
  return { t: 'n', v: (timestamp - Date.UTC(1899, 11, 30)) / 86400000, z: 'dd/mm/yyyy' }
}

function amount(value: string | number | null | undefined) {
  if (value == null || value === '') return ''
  const number = Number(value)
  if (!Number.isFinite(number)) throw new Error(`Invalid inventory amount: ${value}`)
  return number
}

export function buildFreeportWorkbook(rows: FreeportRow[]) {
  const inventoryHeaders = [
    'Inventory no.', 'Goods designation (ArtMuse)', ...inventoryFields
      .filter(field => field.key !== 'inventory_number').map(field => field.label),
    'Documents', 'Artwork ID',
  ]
  const inventory = XLSX.utils.aoa_to_sheet([
    inventoryHeaders,
    ...rows.map(row => [
      row.inventory?.inventory_number ?? '',
      goodsDesignation(row),
      ...inventoryFields.filter(field => field.key !== 'inventory_number').map(field => {
        const value = row.inventory?.[field.key]
        return field.key === 'entry_value' || field.key === 'insured_value_usd' ? amount(value) : value ?? ''
      }),
      row.documents.length,
      row.id,
    ]),
    [
      'Total inventory insured value (available values)', '', '', '', '', '',
      rows.reduce((sum, row) => sum + Number(row.inventory?.insured_value_usd ?? 0), 0),
    ],
  ])
  const history = XLSX.utils.aoa_to_sheet([
    ['Inventory no.', 'Goods designation (ArtMuse)', 'Document order', ...documentFields.map(field => field.label), 'Source row', 'Artwork ID'],
    ...rows.flatMap(row => row.documents.map((document, index) => [
      row.inventory?.inventory_number ?? '', goodsDesignation(row), index + 1,
      ...documentFields.map(field => {
        const value = document[field.key]
        if ('type' in field && field.type === 'date') return excelDate(value)
        if ('type' in field && field.type === 'number') return amount(value)
        return value ?? ''
      }),
      document.source_row ?? '', row.id,
    ])),
  ])
  for (const sheet of [inventory, history]) {
    const range = XLSX.utils.decode_range(sheet['!ref']!)
    sheet['!autofilter'] = { ref: XLSX.utils.encode_range({
      s: range.s, e: { r: sheet === inventory ? Math.max(0, range.e.r - 1) : range.e.r, c: range.e.c },
    }) }
    sheet['!cols'] = Array.from({ length: range.e.c + 1 }, (_, index) => ({ wch: index === 1 ? 60 : 24 }))
    for (const key of Object.keys(sheet)) {
      if (key.startsWith('!')) continue
      const cell = sheet[key]
      const header = XLSX.utils.decode_cell(key).r === 0
      cell.s = {
        alignment: { vertical: 'top', wrapText: true },
        ...(header ? { font: { bold: true }, fill: { fgColor: { rgb: 'E5E7EB' } } } : {}),
      }
    }
  }
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, inventory, 'Inventory')
  XLSX.utils.book_append_sheet(workbook, history, 'Customs history')
  return workbook
}
