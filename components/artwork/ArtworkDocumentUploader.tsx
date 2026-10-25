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
import DocumentCategorySelect from './DocumentCategorySelect'
import type { DocumentCategory } from '@/lib/documentCategory'

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

export default function ArtworkDocumentUploader({
  artworkId,
  labelSuggestionsId,
  clients = [],
  disabled = false,
  onUploaded,
  onBusyChange,
}: {
  artworkId: string
  labelSuggestionsId?: string
  clients?: DocumentClientOption[]
  disabled?: boolean
  onUploaded: (document: ArtworkDocument) => void
  onBusyChange: (busy: boolean) => void
}) {
  const [queue, setQueue] = useState<QueuedDocument[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [batchAccess, setBatchAccess] = useState<DocumentAccess>(DEFAULT_DOCUMENT_ACCESS)
  const [batchCategory, setBatchCategory] = useState<DocumentCategory>('general')
  const [validationError, setValidationError] = useState('')
  const busyRef = useRef(false)
  const locked = disabled || uploading
  const unfinished = queue.some(item => item.status !== 'uploaded')
  const uploadable = queue.filter(item => item.status !== 'uploaded' && !fileError(item.file))
  const uploadedCount = queue.filter(item => item.status === 'uploaded').length
  const failedCount = queue.filter(item => item.status === 'error').length

  useEffect(() => {
    if (!unfinished) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unfinished])

  function addFiles(files: FileList | File[]) {
    if (disabled || busyRef.current) return
    const additions = Array.from(files, file => {
      const error = fileError(file)
      return {
        id: crypto.randomUUID(),
        file,
        label: file.name,
        access: { ...batchAccess },
        category: batchCategory,
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

  async function upload() {
    if (disabled || busyRef.current || uploadable.length === 0) return
    for (const item of uploadable) {
      const result = parseDocumentAccess(item.access)
      if ('error' in result) {
        setValidationError(`${item.file.name}: ${result.error}`)
        return
      }
    }
    setValidationError('')
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
      <label
        onDragOver={event => {
          event.preventDefault()
          if (!locked) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={event => {
          event.preventDefault()
          setDragging(false)
          addFiles(event.dataTransfer.files)
        }}
        style={{
          display: 'block',
          cursor: locked ? 'not-allowed' : 'pointer',
          padding: 14,
          borderRadius: 6,
          border: `2px dashed ${dragging ? '#0b5d2a' : '#999'}`,
          backgroundColor: dragging ? '#eaf6ee' : '#fff',
        }}
      >
        Drop files here or click to select multiple files
        <input
          type="file"
          aria-label="Select documents"
          multiple
          disabled={locked}
          style={{ display: 'block', marginTop: 8, maxWidth: '100%' }}
          onChange={event => {
            if (event.target.files) addFiles(event.target.files)
            event.target.value = ''
          }}
        />
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <DocumentCategorySelect
          label="Upload batch category"
          value={batchCategory}
          disabled={locked}
          onChange={category => {
            setBatchCategory(category)
            setQueue(previous => previous.map(item => item.status === 'uploaded' ? item : { ...item, category }))
          }}
        />
        <DocumentVisibilityFields
          label="Upload batch"
          value={batchAccess}
          clients={clients}
          disabled={locked}
          onChange={access => {
            setBatchAccess(access)
            setValidationError('')
            setQueue(previous => previous.map(item =>
              item.status === 'uploaded' ? item : { ...item, access: { ...access } }
            ))
          }}
        />
      </div>
      <p style={{ fontSize: 13, marginTop: 6 }}>
        Batch category and visibility apply to all remaining files and new selections. You can adjust individual files below.
      </p>
      <p style={{ fontSize: 13, marginTop: 6 }}>
        Maximum 100 MB per file. Files are saved to SharePoint immediately, independently of Save.
        You can edit each label before uploading.
      </p>
      {queue.length > 0 && (
        <>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {queue.map(item => (
              <li key={item.id} style={{ padding: '8px 0', borderBottom: '1px solid #ccc' }}>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ overflowWrap: 'anywhere' }}>{item.file.name}</span>
                  <input
                    aria-label={`Label for ${item.file.name}`}
                    list={labelSuggestionsId}
                    value={item.label}
                    disabled={locked || item.status === 'uploaded'}
                    onChange={event => updateItem(item.id, { label: event.target.value })}
                    style={{ flex: '1 1 180px', minWidth: 0, padding: 6 }}
                  />
                  <span>
                    {item.status === 'queued' ? 'Ready' :
                      item.status === 'uploading' ? 'Uploading...' :
                        item.status === 'uploaded' ? 'Uploaded' : 'Failed'}
                  </span>
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
                <DocumentVisibilityFields
                  label={item.file.name}
                  value={item.access}
                  clients={clients}
                  disabled={locked || item.status === 'uploaded'}
                  onChange={access => updateItem(item.id, { access })}
                />
                <DocumentCategorySelect
                  label={`Category for ${item.file.name}`}
                  value={item.category}
                  disabled={locked || item.status === 'uploaded'}
                  onChange={category => updateItem(item.id, { category })}
                />
                {item.error && <p role="alert" style={{ color: '#a00000', margin: '4px 0' }}>{item.error}</p>}
              </li>
            ))}
          </ul>
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
              disabled={locked || uploadable.length === 0}
              onClick={upload}
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
    </div>
  )
}
