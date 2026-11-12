'use client'

import { useEffect, useRef, useState } from 'react'
import type { ArtworkDocument } from '@/app/(protected)/types/artwork'
import {
  DEFAULT_DOCUMENT_ACCESS,
  parseDocumentAccess,
  type DocumentAccess,
  type DocumentClientOption,
} from '@/lib/documentVisibility'
import DocumentVisibilityFields from './DocumentVisibilityFields'
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS, type DocumentCategory } from '@/lib/documentCategory'

const MAX_FILE_SIZE = 100 * 1024 * 1024

type QueuedDocument = {
  id: string
  file: File
  label: string
  access: DocumentAccess
  category: DocumentCategory
  status: 'queued' | 'uploading' | 'uploaded' | 'error'
  error?: string
}

function fileError(file: File): string | undefined {
  if (file.size === 0) return 'This file is empty.'
  if (file.size > MAX_FILE_SIZE) return 'File too large. Maximum size: 100 MB.'
}

function isUploadedDocument(value: unknown, artworkId: string): value is ArtworkDocument {
  if (!value || typeof value !== 'object') return false
  return 'id' in value && typeof value.id === 'string' &&
    'artwork_id' in value && value.artwork_id === artworkId &&
    'document_type' in value && value.document_type === 'link' &&
    'url' in value && typeof value.url === 'string'
}

function DocumentLabelInput({ id, fileName, value, suggestions, disabled, onChange }: {
  id: string
  fileName: string
  value: string
  suggestions: readonly string[]
  disabled: boolean
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const matches = filter
    ? suggestions.filter(suggestion => suggestion.toLocaleLowerCase().includes(value.toLocaleLowerCase()))
    : suggestions
  const listId = `document-label-options-${id}`
  const expanded = open && !disabled && matches.length > 0

  useEffect(() => {
    if (expanded && activeIndex >= 0) {
      document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' })
    }
  }, [activeIndex, expanded, listId])

  function choose(label: string) {
    onChange(label)
    setOpen(false)
    setFilter(false)
    setActiveIndex(-1)
  }

  return (
    <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 0 }}>
      <input
        aria-label={`Label for ${fileName}`}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded && activeIndex >= 0 && activeIndex < matches.length ? `${listId}-${activeIndex}` : undefined}
        placeholder="Select a label or name the document"
        value={value}
        disabled={disabled}
        onFocus={() => { setOpen(true); setFilter(false); setActiveIndex(-1) }}
        onClick={() => setOpen(true)}
        onBlur={() => { setOpen(false); setFilter(false); setActiveIndex(-1) }}
        onChange={event => {
          onChange(event.target.value)
          setFilter(true)
          setOpen(true)
          setActiveIndex(-1)
        }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            if (matches.length === 0) return
            event.preventDefault()
            setOpen(true)
            setActiveIndex(current => event.key === 'ArrowDown'
              ? Math.min(current + 1, matches.length - 1)
              : current <= 0 ? matches.length - 1 : current - 1)
          } else if (event.key === 'Enter' && expanded && activeIndex >= 0 && matches[activeIndex]) {
            event.preventDefault()
            choose(matches[activeIndex])
          } else if (event.key === 'Escape' && open) {
            event.preventDefault()
            setOpen(false)
            setActiveIndex(-1)
          }
        }}
        style={{ width: '100%', minWidth: 0, padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.95rem', backgroundColor: 'white', boxSizing: 'border-box' }}
      />
      {expanded && (
        <div id={listId} role="listbox" aria-label={`Suggested labels for ${fileName}`}
          style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40, maxHeight: 'min(260px, 60vh)', overflowY: 'auto', background: 'white', border: '1px solid #ccc', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}>
          {matches.map((suggestion, index) => (
            <div key={suggestion} id={`${listId}-${index}`} role="option" aria-selected={index === activeIndex}
              onPointerDown={event => event.preventDefault()}
              onClick={() => choose(suggestion)}
              style={{ padding: '4px 8px', fontSize: '0.9rem', lineHeight: 1.3, background: index === activeIndex ? '#eaf3ff' : 'white', cursor: 'pointer' }}>
              {suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ArtworkDocumentUploader({
  artworkId,
  labelSuggestions = [],
  clients = [],
  disabled = false,
  onUploaded,
  onBusyChange,
}: {
  artworkId: string
  labelSuggestions?: readonly string[]
  clients?: DocumentClientOption[]
  disabled?: boolean
  onUploaded: (document: ArtworkDocument) => void
  onBusyChange: (busy: boolean) => void
}) {
  const [queue, setQueue] = useState<QueuedDocument[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState<DocumentCategory | null>(null)
  const [categoryAccess, setCategoryAccess] = useState<Record<DocumentCategory, DocumentAccess>>({
    general: { ...DEFAULT_DOCUMENT_ACCESS },
    images: { ...DEFAULT_DOCUMENT_ACCESS },
    exhibitions_literature: { ...DEFAULT_DOCUMENT_ACCESS },
  })
  const [validationError, setValidationError] = useState('')
  const [confirmFilenames, setConfirmFilenames] = useState(false)
  const busyRef = useRef(false)
  const confirmDialogRef = useRef<HTMLDialogElement>(null)
  const locked = disabled || uploading
  const unfinished = queue.some(item => item.status !== 'uploaded')
  const uploadable = queue.filter(item => item.status !== 'uploaded' && !fileError(item.file))
  const uploadedCount = queue.filter(item => item.status === 'uploaded').length
  const failedCount = queue.filter(item => item.status === 'error').length
  const generalLabelHints = labelSuggestions.filter(label => label !== 'Fiche Blondeau')

  useEffect(() => {
    if (confirmFilenames) confirmDialogRef.current?.showModal()
  }, [confirmFilenames])

  useEffect(() => {
    if (!unfinished) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unfinished])

  function addFiles(files: FileList | File[], category: DocumentCategory) {
    if (disabled || busyRef.current) return
    const additions = Array.from(files, file => {
      const error = fileError(file)
      return {
        id: crypto.randomUUID(),
        file,
        label: '',
        access: { ...categoryAccess[category] },
        category,
        status: error ? 'error' as const : 'queued' as const,
        error,
      }
    })
    setQueue(previous => [
      ...previous,
      ...additions,
    ])
  }

  function updateItem(id: string, change: Partial<QueuedDocument>) {
    setQueue(previous => previous.map(item => item.id === id ? { ...item, ...change } : item))
  }

  async function upload(useFilenames = false) {
    if (disabled || busyRef.current || uploadable.length === 0) return
    if (!useFilenames && uploadable.some(item => !item.label.trim())) {
      setConfirmFilenames(true)
      return
    }
    for (const item of uploadable) {
      const result = parseDocumentAccess(item.access)
      if ('error' in result) {
        setValidationError(`${item.file.name}: ${result.error}`)
        return
      }
    }
    setValidationError('')
    if (useFilenames) {
      setQueue(previous => previous.map(item =>
        item.status !== 'uploaded' && !fileError(item.file) && !item.label.trim()
          ? { ...item, label: item.file.name }
          : item
      ))
    }
    busyRef.current = true
    setUploading(true)
    onBusyChange(true)
    try {
      // Keep requests sequential to preserve document order and limit server memory usage.
      for (const item of uploadable) {
        updateItem(item.id, { status: 'uploading', error: undefined })
        try {
          const form = new FormData()
          form.append('file', item.file)
          form.append('label', item.label.trim() || item.file.name)
          form.append('visibility', item.access.visibility)
          form.append('link_category', item.category)
          if (item.access.recipient_contact_id) {
            form.append('recipient_contact_id', item.access.recipient_contact_id)
          }
          const response = await fetch(`/api/artworks/${artworkId}/sharepoint-documents`, {
            method: 'POST',
            credentials: 'include',
            body: form,
          })
          if (!response.ok) {
            let message = `Failed to upload document (HTTP ${response.status}).`
            if (response.headers.get('content-type')?.includes('application/json')) {
              const body: unknown = await response.json()
              if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
                message = body.error
              }
            }
            throw new Error(message)
          }
          const document: unknown = await response.json()
          if (!isUploadedDocument(document, artworkId)) {
            throw new Error('Document upload was not confirmed. Check the document list before retrying.')
          }
          onUploaded(document)
          updateItem(item.id, { status: 'uploaded' })
        } catch (error) {
          console.error('SHAREPOINT DOCUMENT UPLOAD ERROR:', item.file.name, error)
          updateItem(item.id, {
            status: 'error',
            error: error instanceof Error ? error.message : 'Failed to upload document.',
          })
        }
      }
    } finally {
      busyRef.current = false
      setUploading(false)
      onBusyChange(false)
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      {DOCUMENT_CATEGORIES.map(category => {
        const categoryLabel = DOCUMENT_CATEGORY_LABELS[category]
        const items = queue.filter(item => item.category === category)
        return (
          <section key={category} aria-label={`${categoryLabel} documents`} style={{ marginBottom: 20 }}>
            <h5 style={{ fontSize: '1.14rem', fontWeight: 600, margin: '0 0 8px' }}>
              {categoryLabel}
              {category === 'general' && generalLabelHints.length > 0 && (
                <span style={{ fontWeight: 400, fontSize: '0.8em' }}> ({generalLabelHints.join(', ')}, etc.)</span>
              )}
            </h5>
            <DocumentVisibilityFields
              label={categoryLabel}
              value={categoryAccess[category]}
              clients={clients}
              disabled={locked}
              onChange={access => {
                setCategoryAccess(previous => ({ ...previous, [category]: access }))
                setValidationError('')
                setQueue(previous => previous.map(item =>
                  item.category !== category || item.status === 'uploaded' ? item : { ...item, access: { ...access } }
                ))
              }}
            />
            <label
              className="artwork-document-drop-zone"
              onDragOver={event => {
                event.preventDefault()
                if (!locked) setDragging(category)
              }}
              onDragLeave={event => {
                if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(null)
              }}
              onDrop={event => {
                event.preventDefault()
                setDragging(null)
                addFiles(event.dataTransfer.files, category)
              }}
              style={{
                display: 'block',
                cursor: locked ? 'not-allowed' : 'pointer',
                marginTop: 12,
                padding: 14,
                borderRadius: 6,
                border: `2px dashed ${dragging === category ? '#0b5d2a' : '#999'}`,
                backgroundColor: dragging === category ? '#eaf6ee' : '#fff',
              }}
            >
              Drop files here or click to select multiple files
              <input
                type="file"
                aria-label={`Select ${categoryLabel} documents`}
                multiple
                disabled={locked}
                style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}
                onChange={event => {
                  if (event.target.files) addFiles(event.target.files, category)
                  event.target.value = ''
                }}
              />
            </label>
            {items.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {items.map(item => (
                  <li key={item.id} style={{ padding: '8px 0', borderBottom: '1px solid #ccc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <span style={{ overflowWrap: 'anywhere' }}><strong>File:</strong> {item.file.name}</span>
                      <DocumentLabelInput
                        id={item.id}
                        fileName={item.file.name}
                        value={item.label}
                        disabled={locked || item.status === 'uploaded'}
                        suggestions={labelSuggestions}
                        onChange={label => updateItem(item.id, { label })}
                      />
                      {item.status !== 'queued' && (
                        <span>
                          {item.status === 'uploading' ? 'Uploading...' :
                            item.status === 'uploaded' ? 'Uploaded' : 'Failed'}
                        </span>
                      )}
                      {item.status !== 'uploaded' && (
                        <button
                          type="button"
                          className="edit-button"
                          aria-label={`Remove ${item.file.name}`}
                          disabled={locked}
                          onClick={() => setQueue(previous => previous.filter(entry => entry.id !== item.id))}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    {item.error && <p role="alert" style={{ color: '#a00000', margin: '4px 0' }}>{item.error}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
      {queue.length > 0 && (
        <>
          {validationError && <p role="alert" style={{ color: '#a00000' }}>{validationError}</p>}
          <p role="status" aria-live="polite">
            {uploadedCount} of {queue.length} files uploaded.
            {failedCount > 0 && ` ${failedCount} failed.`}
            {uploading && ' Upload in progress. Keep this page open.'}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="edit-button"
              style={{ zoom: 1.3 }}
              disabled={locked || uploadable.length === 0}
              onClick={() => void upload()}
            >
              {uploading ? 'Uploading...' : failedCount > 0 ? 'Upload / retry remaining files' : 'Upload files'}
            </button>
            <button
              type="button"
              className="edit-button"
              disabled={locked}
              onClick={() => setQueue([])}
            >
              Clear list
            </button>
          </div>
        </>
      )}
      {confirmFilenames && (
        <dialog ref={confirmDialogRef} role="alertdialog" aria-labelledby="empty-document-labels-title"
          aria-describedby="empty-document-labels-message" onCancel={() => setConfirmFilenames(false)}
          style={{ margin: 'auto', padding: 24, borderRadius: 8, maxWidth: '90vw' }}>
          <h2 id="empty-document-labels-title">Missing document labels</h2>
          <p id="empty-document-labels-message">Some documents have no label. Return to enter labels, or use the filenames for those documents.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="edit-button" autoFocus onClick={() => setConfirmFilenames(false)}>Return to labels</button>
            <button type="button" className="edit-button" onClick={() => {
              setConfirmFilenames(false)
              void upload(true)
            }}>Use filenames</button>
          </div>
        </dialog>
      )}
    </div>
  )
}
