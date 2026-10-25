
'use client'

import { useState, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import DocumentVisibilityFields from '@/components/artwork/DocumentVisibilityFields'
import DocumentCategorySelect from '@/components/artwork/DocumentCategorySelect'
import { saveDocumentLinkCategory, type DocumentCategory } from '@/lib/documentCategory'
import {
  DOCUMENT_VISIBILITY_LABELS,
  parseDocumentAccess,
  saveDocumentVisibility,
  type DocumentAccess,
  type DocumentClientOption,
} from '@/lib/documentVisibility'

const DOCUMENT_LABEL_DATALIST_ID = 'document-label-suggestions'


type SortableArtworkDocument = {
  id: string
  document_type: 'image' | 'link' | 'onedrive'
  label?: string | null
  url?: string | null
  position?: number | null
  storage_provider?: 'legacy' | 'sharepoint'
  visibility?: DocumentAccess['visibility']
  recipient_contact_id?: string | null
  link_category?: DocumentCategory
}

export function SortableDocument({
  artworkId,
  document,
  isEditing,
  onDelete,
  labelSuggestions,
  onLabelSaved,
  clients = [],
  onAccessSaved,
  onCategorySaved,
}: {
  artworkId: string
  document: SortableArtworkDocument
  isEditing: boolean
  onDelete: (id: string) => void
  labelSuggestions: string[]
  onLabelSaved?: (id: string, label: string) => void
  clients?: DocumentClientOption[]
  onAccessSaved?: (id: string, access: DocumentAccess) => void
  onCategorySaved?: (id: string, category: DocumentCategory) => void
}) {
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [access, setAccess] = useState<DocumentAccess>({
    visibility: document.visibility ?? 'all_clients',
    recipient_contact_id: document.recipient_contact_id ?? null,
  })
  const accessChanged = access.visibility !== (document.visibility ?? 'all_clients') ||
    access.recipient_contact_id !== (document.recipient_contact_id ?? null)

  useEffect(() => {
    setAccess({
      visibility: document.visibility ?? 'all_clients',
      recipient_contact_id: document.recipient_contact_id ?? null,
    })
  }, [document.visibility, document.recipient_contact_id])

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
  if (!document.url) return
  window.open(document.url, '_blank', 'noopener,noreferrer')
}


  async function saveLabel() {
    if (label === (document.label ?? '')) return

    setSaving(true)
    setError('')

    try {
      const response = await fetch(
        `/api/artworks/${artworkId}/documents/${document.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label }),
        }
      )

      if (!response.ok) {
        throw new Error('Failed to save document label')
      }

      onLabelSaved?.(document.id, label)
    } catch (cause) {
      console.error('SAVE DOCUMENT LABEL ERROR:', cause)
      setError(cause instanceof Error ? cause.message : 'Failed to save document label')
    } finally {
      setSaving(false)
    }
  }

  async function saveAccess() {
    if (saving || !accessChanged) return
    const result = parseDocumentAccess(access)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setSaving(true)
    setError('')
    try {
      await saveDocumentVisibility(artworkId, document.id, result.access)
      onAccessSaved?.(document.id, result.access)
    } catch (cause) {
      console.error('SAVE DOCUMENT VISIBILITY ERROR:', cause)
      setError(cause instanceof Error ? cause.message : 'Failed to save document visibility')
    } finally {
      setSaving(false)
    }
  }

  async function saveCategory(category: DocumentCategory) {
    setSaving(true)
    setError('')
    try {
      await saveDocumentLinkCategory(artworkId, document.id, category)
      onCategorySaved?.(document.id, category)
    } catch (cause) {
      console.error('SAVE DOCUMENT CATEGORY ERROR:', cause)
      setError(cause instanceof Error ? cause.message : 'Failed to save link category')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: 'flex',
        flexWrap: 'wrap',
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
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: isEditing ? 'default' : 'pointer',
        }}
      >
        <span
          title={document.storage_provider === 'sharepoint' ? 'Stored in SharePoint' : 'External link'}
          style={{
            fontSize: 11,
            padding: '2px 6px',
            borderRadius: 4,
            whiteSpace: 'nowrap',
            color: document.storage_provider === 'sharepoint' ? '#0b5d2a' : '#555',
            backgroundColor: document.storage_provider === 'sharepoint' ? '#dff3e6' : '#ececec',
          }}
        >
          {document.storage_provider === 'sharepoint' ? 'SharePoint' : 'Link'}
        </span>
        {isEditing ? (
          <>
            <datalist id={DOCUMENT_LABEL_DATALIST_ID}>
              {labelSuggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
            <input
              value={label}
              disabled={saving}
              onChange={e => setLabel(e.target.value)}
              onBlur={saveLabel}
              placeholder={label ? '' : 'Document title'}
              onFocus={e => e.target.select()}
              list={DOCUMENT_LABEL_DATALIST_ID}
              style={{ flex: 1, minWidth: 0 }}
            />
          </>
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

      {isEditing ? (
        <div style={{ flex: '1 1 100%', minWidth: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <div className="document-edit-fields" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 18px', flex: '1 1 auto', minWidth: 0 }}>
          <DocumentCategorySelect
            label={`Category for ${document.label || 'Document'}`}
            value={document.link_category ?? 'general'}
            disabled={saving}
            onChange={category => void saveCategory(category)}
          />
          <DocumentVisibilityFields
            label={document.label || 'Document'}
            value={access}
            clients={clients}
            disabled={saving}
            onChange={setAccess}
          />
          {accessChanged && (
            <button type="button" className="edit-button" disabled={saving} onClick={saveAccess}>
              Save visibility
            </button>
          )}
          </div>
          <div role="group" aria-label="Document actions"
            style={{ display: 'flex', flexShrink: 0, gap: 8, alignItems: 'center', justifyContent: 'flex-end', marginLeft: 'auto' }}>
            <button
              type="button"
              className="edit-button"
              aria-label={`Reorder ${document.label || 'document'}`}
              title="Drag to reorder"
              disabled={saving}
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              style={{ cursor: saving ? 'not-allowed' : 'grab' }}
            >
              ⠿
            </button>
            <button
              type="button"
              className="edit-button edit-button-danger"
              aria-label={`Delete ${document.label || 'document'}`}
              title="Delete document"
              disabled={saving}
              onClick={event => {
                event.stopPropagation()
                onDelete(document.id)
              }}
            >
              ×
            </button>
          </div>
          </div>
          {access.visibility !== 'all_clients' && (
            <p style={{ fontSize: 12 }}>
              Restrictions apply in ArtMuse. Existing external or SharePoint sharing permissions are not revoked.
            </p>
          )}
        </div>
      ) : (
        <span style={{ fontSize: 12 }}>
          {DOCUMENT_VISIBILITY_LABELS[document.visibility ?? 'all_clients']}
        </span>
      )}
      {error && <p role="alert" style={{ color: '#a00000', flexBasis: '100%' }}>{error}</p>}

    </div>
  )
}