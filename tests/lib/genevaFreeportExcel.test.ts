import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx-js-style'
import { buildFreeportWorkbook } from '@/lib/genevaFreeportExcel'
import { parseFreeportInput, type FreeportRow } from '@/lib/genevaFreeport'

function row(id: string, value: number): FreeportRow {
  const input = parseFreeportInput({
    inventory: { inventory_number: 'HES.1', insured_value_usd: value },
    documents: [
      { document_reference: 'Recent', document_date: '2026-07-10', stamp_date: '2026-07-14', customs_reference: '6021-1044-2026' },
      { document_reference: 'Previous', document_date: '2024-01-31', entry_value: 100, entry_currency: 'USD' },
    ],
  })
  if ('error' in input) throw new Error(input.error)
  return {
    id, title: `Title ${id}`, year_execution: 2026, year_execution_start: 2024,
    medium: 'Oil', height_cm: 100, width_cm: 80, depth_cm: null,
    signature: null, edition: null, artist: { first_name: 'First', last_name: 'Last' },
    inventory: { artwork_id: id, ...input.inventory }, documents: input.documents,
  }
}

describe('Freeport Excel export', () => {
  it('preserves input order, duplicate inventory numbers and native numeric totals', () => {
    const book = buildFreeportWorkbook([row('b', 120000), row('a', 0)])
    expect(book.SheetNames).toEqual(['Inventory', 'Customs history'])
    const sheet = XLSX.utils.sheet_to_json(book.Sheets.Inventory, { header: 1 }) as unknown[][]
    expect(sheet[1][1]).toContain('Title b, 2024/2026')
    expect(sheet[2][1]).toContain('Title a, 2024/2026')
    expect(sheet[1][6]).toBe(120000)
    expect(sheet[2][6]).toBe(0)
    expect(sheet[3][6]).toBe(120000)
    expect(book.Sheets.Inventory['!autofilter']?.ref).toBe('A1:L3')
  })

  it('exports every historical document with native Excel dates and references, surviving XLSX round-trip', () => {
    const original = buildFreeportWorkbook([row('work', 120000)])
    const book = XLSX.read(XLSX.write(original, { type: 'buffer', bookType: 'xlsx' }))
    const sheet = book.Sheets['Customs history']
    expect(sheet.D2.v).toBe('Recent')
    expect(sheet.D3.v).toBe('Previous')
    expect(sheet.E2.t).toBe('n')
    expect(XLSX.SSF.parse_date_code(Number(sheet.E2.v))).toMatchObject({ y: 2026, m: 7, d: 10 })
    expect(sheet.E2.w).toBe('10/07/2026')
    expect(sheet.H2.v).toBe('6021-1044-2026')
    expect(sheet.K3.v).toBe(100)
    expect(sheet.R2.v).toBe('work')
  })

  it('limits exported data to supplied filtered rows and treats formula-looking text as text', () => {
    const work = row('included', 10)
    work.title = '=1+1'
    const book = buildFreeportWorkbook([work])
    expect(book.Sheets.Inventory.B2.t).toBe('s')
    expect(book.Sheets.Inventory.B2.f).toBeUndefined()
    expect(book.Sheets.Inventory.L2.v).toBe('included')
    expect(book.Sheets.Inventory.L3).toBeUndefined()
  })
})
