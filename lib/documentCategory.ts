export const DOCUMENT_CATEGORIES = ['general', 'images', 'exhibitions_literature'] as const
export type DocumentCategory = typeof DOCUMENT_CATEGORIES[number]

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  general: 'General',
  images: 'Images',
  exhibitions_literature: 'Exhibitions & Literature',
}

export function isDocumentCategory(value: unknown): value is DocumentCategory {
  return value === 'general' || value === 'images' || value === 'exhibitions_literature'
}

export function groupDocumentLinks<T extends { link_category?: DocumentCategory }>(documents: T[]) {
  return DOCUMENT_CATEGORIES.map(category => ({
    category,
    label: DOCUMENT_CATEGORY_LABELS[category],
    documents: documents.filter(document => (document.link_category ?? 'general') === category),
  }))
}

export async function saveDocumentLinkCategory(artworkId: string, documentId: string, category: DocumentCategory) {
  const response = await fetch(`/api/artworks/${artworkId}/documents/${documentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ link_category: category }),
  })
  const body: unknown = await response.json()
  if (!response.ok) {
    throw new Error(body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error : 'Failed to save link category')
  }
  if (!body || typeof body !== 'object' || !('id' in body) || body.id !== documentId ||
    !('link_category' in body) || body.link_category !== category) {
    throw new Error('Link category update was not confirmed')
  }
}
