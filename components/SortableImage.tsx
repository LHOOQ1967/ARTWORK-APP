
'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ArtworkDocument } from '@/app/(protected)/types/artwork'


type Props = {
  image: ArtworkDocument
  isEditing: boolean
  onDelete: (id: string) => void
}


export function SortableImage({
  image,
  isEditing,
  onDelete,
  onOpen,
}: {
  image: any
  isEditing: boolean
  onDelete: (id: string) => void
  onOpen: (url: string) => void
}) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
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
      }}
    >
      {/* ✅ IMAGE CLIQUABLE (LECTURE SEULEMENT) */}
      <div
        onClick={() => {
          if (!isEditing) {
            onOpen(image.url)
          }
        }}
        style={{
          cursor: isEditing ? 'default' : 'zoom-in',
        }}
      >
        <img
          src={image.url}
          alt={image.label || ''}
          style={{

    maxHeight: 240,        // ✅ LIMITE HAUTEUR
    width: 'auto',
    maxWidth: '100%',

            objectFit: 'contain',
            display: 'block',
            pointerEvents: 'none', // ⭐ CRITIQUE : empêche conflit click / drag
          }}
        />
      </div>

      {/* ✅ LABEL */}
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

      {/* ✅ POIGNÉE DRAG (MODE ÉDITION UNIQUEMENT) */}
      {isEditing && (
        <div
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          style={{
            position: 'absolute',
            bottom: 6,
            left: 6,
            background: 'rgba(0,0,0,0.6)',
            color: 'white',
            borderRadius: 4,
            padding: '2px 6px',
            fontSize: 12,
            cursor: 'grab',
            userSelect: 'none',
          }}
          title="Reorder image"
        >
          ⠿
        </div>
      )}

      {/* ✅ DELETE */}
      {isEditing && (
        <button
        
  onClick={(e) => {
    e.stopPropagation()
    onDelete(image.id)
  }}
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
