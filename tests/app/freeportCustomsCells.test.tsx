import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import FreeportCustomsCells from '@/components/artwork/FreeportCustomsCells'
import { emptyDocument, parseFreeportInput } from '@/lib/genevaFreeport'

describe('Freeport customs columns', () => {
  it('shows previous documents, dates, issuing offices and 11.95 references for all historical rows', () => {
    const input = parseFreeportInput({
      inventory: {},
      documents: [
        { ...emptyDocument(), document_reference: 'T-CH 2026', document_date: '2026-07-10', issuing_office: 'Geneva Freeport', stamp_date: '2026-07-14', customs_reference: '6021-1044-2026' },
        { ...emptyDocument(), document_reference: '11.87 No 92', document_date: '2024-01-31', stamp_date: '2024-01-31' },
      ],
    })
    if ('error' in input) throw new Error(input.error)
    const html = renderToStaticMarkup(<table><tbody><tr><FreeportCustomsCells documents={input.documents} /></tr></tbody></table>)
    for (const value of ['T-CH 2026', '10/07/2026', 'Geneva Freeport', '14/07/2026', '6021-1044-2026', '11.87 No 92', '31/01/2024', 'Document 1', 'Document 2']) {
      expect(html).toContain(value)
    }
    expect(html.match(/<td /g)).toHaveLength(5)
  })

  it('shows five empty cells when no customs history is available', () => {
    const html = renderToStaticMarkup(<table><tbody><tr><FreeportCustomsCells documents={[]} /></tr></tbody></table>)
    expect(html.match(/—/g)).toHaveLength(5)
  })
})
