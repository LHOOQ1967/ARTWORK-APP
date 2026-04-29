
'use client'

import { useState, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'


type SortableArtworkDocument = {
  id: string
  document_type: 'image' | 'onedrive'
  label?: string | null
  url?: string | null
  position?: number | null
}

export function SortableDocument({
  document,
  isEditing,
  onDelete,
}: {
  document: SortableArtworkDocument
  isEditing: boolean
  onDelete: (id: string) => void
}) {
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)

  // ✅ SYNCHRONISATION RÉELLE DES DONNÉES
  useEffect(() => {
    setLabel(document.label ?? '')
  }, [document.label])

  const {
    setNodeRef,
    attributes,
    listeners,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({ id: document.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  function handleOpen() {
    window.open(document.url, '_blank', 'noopener,noreferrer')
  }

  async function saveLabel() {
    if (label === (document.label ?? '')) return

    setSaving(true)

    await fetch(`/api/documents/${document.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    })

    setSaving(false)
  }


  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        border: '1px solid #e0e0e0',
        borderRadius: 6,
        backgroundColor: '#fafafa',
      }}
    >
      <div
        onClick={!isEditing ? handleOpen : undefined}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: isEditing ? 'default' : 'pointer',
        }}
      >
        {isEditing ? (
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            onBlur={saveLabel}
            placeholder={label ? '' : 'Document title'}
            onFocus={e => e.target.select()}
            style={{ flex: 1 }}
          />
        ) : (
          <span style={{ fontWeight: 500 }}>
            {document.label || 'Untitled'}
          </span>
        )}

        {saving && (
          <span style={{ fontSize: 12, color: '#999' }}>
            Saving…
          </span>
        )}
      </div>

      {isEditing && (
        <span
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          style={{ cursor: 'grab', color: '#999' }}
        >
          ⠿
        </span>
      )}

      {isEditing && (
        <button
          onClick={e => {
            e.stopPropagation()
            onDelete(document.id)
          }}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#999',
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}