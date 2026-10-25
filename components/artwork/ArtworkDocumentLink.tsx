import { documentFileType } from '@/lib/documentFileType'

type LinkDocument = {
  id: string
  url?: string | null
  label?: string | null
  file_name?: string | null
  mime_type?: string | null
  storage_provider?: 'legacy' | 'sharepoint'
}

export default function ArtworkDocumentLink({ document, onOpenImage }: {
  document: LinkDocument
  onOpenImage?: () => void
}) {
  const format = documentFileType(document)
  const storedFile = document.storage_provider === 'sharepoint' ||
    document.url === `/api/documents/${document.id}/open`
  const label = document.label || document.file_name || 'Open document'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 0, lineHeight: 1.4 }}>
      <a href={document.url ?? undefined} target="_blank" rel="noopener noreferrer"
        onClick={onOpenImage ? event => {
          if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
          event.preventDefault()
          onOpenImage()
        } : undefined}
        style={{ color: '#007a5e', textDecoration: 'underline', overflowWrap: 'anywhere', minWidth: 0 }}>
        {label}
      </a>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      <span role="img" aria-label={format === 'LINK' ? 'External link' : `${format} file`}
        title={format === 'LINK' ? 'External link' : `${format} file`}
        style={{
          display: 'inline-block', backgroundColor: '#f3f4f3', color: '#243a31', border: '1px solid #bfc9c3', borderRadius: 3,
          padding: '1px 4px', fontSize: 10, fontWeight: 700, lineHeight: '16px',
          letterSpacing: '0.2px', whiteSpace: 'nowrap',
        }}>
        {format}
      </span>
      {document.url && (
        <a
          className="document-download-action"
          href={storedFile ? `/api/documents/${encodeURIComponent(document.id)}/open?download=1` : document.url}
          download={storedFile ? document.file_name || '' : undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${storedFile ? 'Download' : 'Open source for'} ${label}`}
          title={storedFile ? 'Download file' : 'Open the external source to download; availability depends on the provider'}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
            border: '1px solid #bfc9c3', borderRadius: 5, backgroundColor: '#f3f4f3',
            color: '#243a31', textDecoration: 'none', width: 22, height: 22, lineHeight: 1,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {storedFile ? <path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4" /> :
              <path d="M7 17 17 7M7 7h10v10" />}
          </svg>
        </a>
      )}
      </span>
    </div>
  )
}
