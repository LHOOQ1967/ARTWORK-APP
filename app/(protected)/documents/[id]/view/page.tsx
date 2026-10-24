import Link from 'next/link'
import { documentReturnPath } from '@/lib/documentViewer'

export default async function DocumentViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ returnTo?: string | string[] }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const returnTo = documentReturnPath(typeof query.returnTo === 'string' ? query.returnTo : undefined)
  const documentUrl = `/api/documents/${encodeURIComponent(id)}/open`

  return (
    <section
      aria-label="Document viewer"
      style={{ position: 'fixed', inset: 0, zIndex: 1500, display: 'flex', flexDirection: 'column', background: '#f3f5f1' }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: 'max(16px, env(safe-area-inset-top)) 16px 16px', flexShrink: 0 }}>
        <Link href={returnTo} className="edit-button">Back to ArtMuse</Link>
        <h1 style={{ fontSize: '1rem', fontWeight: 600 }}>Document</h1>
        <a href={`${documentUrl}?download=1`} download className="edit-button">Download</a>
      </header>
      <p style={{ padding: '0 16px 12px', fontSize: '0.85rem' }}>
        If the preview is unavailable, download the document. Use Back to ArtMuse to return to the application.
      </p>
      <iframe
        src={`${documentUrl}?embedded=1`}
        title="Document preview"
        style={{ flex: 1, minHeight: 0, width: '100%', border: 0, background: 'white' }}
      />
    </section>
  )
}
