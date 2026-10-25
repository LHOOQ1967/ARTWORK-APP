'use client'

import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS, isDocumentCategory, type DocumentCategory } from '@/lib/documentCategory'

export default function DocumentCategorySelect({
  value, onChange, disabled = false, label = 'Link category',
}: {
  value: DocumentCategory
  onChange: (category: DocumentCategory) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <label className="document-edit-field" style={{
      display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, minWidth: 0, maxWidth: '100%',
    }}>
      Category{' '}
      <select className="document-edit-select" style={{
        border: '1px solid #c8ceca', borderRadius: 5, backgroundColor: '#fff', padding: '5px 8px', minHeight: 34,
      }} aria-label={label} value={value} disabled={disabled} onChange={event => {
        if (isDocumentCategory(event.target.value)) onChange(event.target.value)
      }}>
        {DOCUMENT_CATEGORIES.map(category => (
          <option key={category} value={category}>{DOCUMENT_CATEGORY_LABELS[category]}</option>
        ))}
      </select>
    </label>
  )
}
