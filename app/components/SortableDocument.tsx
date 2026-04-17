
'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export function SortableDocument({
  document,
  isEditing,
  onDelete,
}: {
  document: any
  isEditing: boolean
  onDelete: (id: string) => void
}) {
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
      {/* ✅ Zone CLIQUABLE (lecture) */}
      <div
        onClick={!isEditing ? handleOpen : undefined}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          cursor: isEditing ? 'default' : 'pointer',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={document.label || 'Untitled'}
        >
          {document.label || 'Untitled'}
        </span>

        {!isEditing && (
          <span style={{ fontSize: 14, color: '#0070f3' }}>
            Open
          </span>
        )}
      </div>

      {/* ✅ Poignée DRAG (édition uniquement) */}
      {isEditing && (
        <span
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          style={{
            cursor: 'grab',
            color: '#999',
            fontSize: 16,
            userSelect: 'none',
          }}
          title="Reorder"
        >
          ⠿
        </span>
      )}

      {/* ✅ Delete */}
      {isEditing && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(document.id)
          }}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#999',
            cursor: 'pointer',
            fontSize: 16,
          }}
          title="Delete"
        >
          ×
        </button>
      )}
    </div>
  )
}