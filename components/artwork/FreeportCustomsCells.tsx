import type { FreeportDocument } from '@/lib/genevaFreeport'

function dateLabel(value: string | number | null) {
  if (!value) return '—'
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value)
}

export default function FreeportCustomsCells({ documents }: Readonly<{ documents: FreeportDocument[] }>) {
  return (
    <>
      {(['document_reference', 'document_date', 'issuing_office', 'stamp_date', 'customs_reference'] as const).map(field => (
        <td key={field} className="whitespace-pre-line p-3">
          {documents.length === 0 ? '—' : documents.map((document, index) => (
            <div key={index} className={index > 0 ? 'mt-3 border-t pt-2' : ''}>
              {documents.length > 1 && <span className="block text-xs text-gray-500">Document {index + 1}</span>}
              {field === 'document_date' || field === 'stamp_date'
                ? dateLabel(document[field])
                : document[field] || '—'}
            </div>
          ))}
        </td>
      ))}
    </>
  )
}
