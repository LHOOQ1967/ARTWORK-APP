export type DocumentVisibility = 'all_clients' | 'internal' | 'selected_client'

export type DocumentAccess = {
  visibility: DocumentVisibility
  recipient_contact_id: string | null
}

export type DocumentClientOption = { id: string; label: string }

export const DEFAULT_DOCUMENT_ACCESS: DocumentAccess = {
  visibility: 'all_clients',
  recipient_contact_id: null,
}

export const DOCUMENT_VISIBILITY_LABELS: Record<DocumentVisibility, string> = {
  all_clients: 'All artwork clients',
  internal: 'Internal only',
  selected_client: 'Selected client',
}

export function parseDocumentAccess(value: {
  visibility?: unknown
  recipient_contact_id?: unknown
}): { access: DocumentAccess } | { error: string } {
  const visibility = value.visibility === undefined ? 'all_clients' : value.visibility
  if (visibility !== 'all_clients' && visibility !== 'internal' && visibility !== 'selected_client') {
    return { error: 'Invalid document visibility' }
  }
  const recipient = value.recipient_contact_id ?? null
  if (visibility === 'selected_client') {
    if (typeof recipient !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recipient)) {
      return { error: 'Select a client for this document' }
    }
  } else if (recipient !== null) {
    return { error: 'A recipient is only allowed for Selected client visibility' }
  }
  return { access: { visibility, recipient_contact_id: recipient } }
}

export async function saveDocumentVisibility(artworkId: string, documentId: string, access: DocumentAccess) {
  const result = parseDocumentAccess(access)
  if ('error' in result) throw new Error(result.error)
  const response = await fetch(`/api/artworks/${artworkId}/documents/${documentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result.access),
  })
  const body: unknown = await response.json()
  if (!response.ok) {
    throw new Error(body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error : 'Failed to save document visibility')
  }
  if (!body || typeof body !== 'object' || !('id' in body) || body.id !== documentId ||
    !('visibility' in body) || body.visibility !== access.visibility ||
    !('recipient_contact_id' in body) || body.recipient_contact_id !== access.recipient_contact_id) {
    throw new Error('Document visibility update was not confirmed')
  }
}
