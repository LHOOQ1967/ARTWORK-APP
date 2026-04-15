'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export function SortableImage({
  image,
  isEditing,
  onDelete,
}: {
  image: any
  isEditing: boolean
  onDelete: (id: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: image.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        position: 'relative',
        border: '1px solid #e0e0e0',
        borderRadius: 6,
        overflow: 'hidden',
        backgroundColor: '#fafafa',
        cursor: isEditing ? 'grab' : 'default',
      }}
      {...(isEditing ? { ...attributes, ...listeners } : {})}
    >
      <img
        src={image.url}
        alt={image.label || ''}
        style={{
          width: '100%',
          height: 140,
          objectFit: 'cover',
          display: 'block',
        }}
      />

      {image.label && (
        <div
          style={{
            padding: '6px 8px',
            fontSize: 12,
            color: '#555',
            borderTop: '1px solid #eee',
            backgroundColor: '#fff',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={image.label}
        >
          {image.label}
        </div>
      )}

      {isEditing && (
        <button
          onClick={() => onDelete(image.id)}
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            border: 'none',
            background: 'rgba(0,0,0,0.6)',
            color: 'white',
            width: 24,
            height: 24,
            borderRadius: '50%',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: '24px',
          }}
          title="Delete image"
        >
          ×
        </button>
      )}
    </div>
  )
}
