import type { ArtworkDocument } from '@/app/(protected)/types/artwork'
import type { BlondeauSheetFields } from '@/lib/blondeauSheet'

export type BlondeauSheetDraft = {
  pdf: File
  image: File | null
  fields: Partial<BlondeauSheetFields>
}

export async function importBlondeauSheet(artworkId: string, draft: BlondeauSheetDraft): Promise<ArtworkDocument[]> {
  const form = new FormData()
  form.append('pdf', draft.pdf)
  form.append('fields', JSON.stringify(draft.fields))
  if (draft.image) form.append('image', draft.image)

  const response = await fetch(`/api/artworks/${artworkId}/blondeau-imports`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  })
  const body: unknown = await response.json()
  if (!response.ok) {
    throw new Error(body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error : `Import failed (HTTP ${response.status}).`)
  }
  if (!body || typeof body !== 'object' || !('documents' in body) ||
    !Array.isArray(body.documents) || !body.documents.every(document =>
      document && typeof document === 'object' &&
      'id' in document && typeof document.id === 'string' &&
      'artwork_id' in document && document.artwork_id === artworkId &&
      'document_type' in document && typeof document.document_type === 'string' &&
      'url' in document && typeof document.url === 'string')) {
    throw new Error('The import could not be confirmed. Check the artwork documents before retrying.')
  }
  return body.documents as ArtworkDocument[]
}
