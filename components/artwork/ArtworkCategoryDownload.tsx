'use client'

import { useState } from 'react'
import { groupDocumentLinks, type DocumentCategory } from '@/lib/documentCategory'

export default function ArtworkCategoryDownload({ artworkId, documents }: {
  artworkId: string
  documents: { link_category?: DocumentCategory; storage_provider?: 'legacy' | 'sharepoint' }[]
}) {
  const [selected, setSelected] = useState<DocumentCategory[]>([])
  const groups = groupDocumentLinks(documents).filter(group => group.documents.length > 0)
  const selectedFiles = documents.filter(document =>
    selected.includes(document.link_category ?? 'general') && document.storage_provider === 'sharepoint'
  ).length
  const externalCount = documents.filter(document =>
    selected.includes(document.link_category ?? 'general') && document.storage_provider !== 'sharepoint'
  ).length
  const query = new URLSearchParams()
  for (const category of selected) query.append('category', category)
  return (
    <fieldset className="document-download-action" style={{ border: '1px solid #d0d5d1', borderRadius: 6, padding: 10, marginBottom: 12 }}>
      <legend>Download by category</legend>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        {groups.map(group => (
          <label key={group.category} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={selected.includes(group.category)}
              onChange={event => setSelected(previous => event.target.checked
                ? [...previous, group.category] : previous.filter(category => category !== group.category))} />
            {group.label}
          </label>
        ))}
        {selectedFiles > 0 ? (
          <a href={`/api/artworks/${encodeURIComponent(artworkId)}/documents/download?${query}`}
            target="_blank" rel="noopener noreferrer" className="edit-button">
            Download ZIP ({selectedFiles} files)
          </a>
        ) : <button type="button" className="edit-button" disabled>Download ZIP</button>}
      </div>
      <p style={{ fontSize: 12, margin: '6px 0 0' }}>
        Select categories to download their accessible SharePoint files in one ZIP. Keep the download open until it finishes.
      </p>
      {externalCount > 0 && <p role="status" style={{ fontSize: 12, margin: '6px 0 0' }}>
        {externalCount} external link(s) will not be included. Use Open source to download them separately.
      </p>}
    </fieldset>
  )
}
