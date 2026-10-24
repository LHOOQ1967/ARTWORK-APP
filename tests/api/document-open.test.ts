import { NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { documentReturnPath, iphoneDocumentViewerUrl } from '@/lib/documentViewer'
import DocumentViewerPage from '@/app/(protected)/documents/[id]/view/page'

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  maybeSingle: vi.fn(),
  downloadDocument: vi.fn(),
}))
vi.mock('@/lib/apiAuth', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/sharepoint', () => ({ downloadDocument: mocks.downloadDocument }))

import { GET } from '@/app/api/documents/[id]/open/route'

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile'
const document = {
  url: '/api/documents/doc-1/open', storage_provider: 'sharepoint',
  artwork_id: 'art-1', sharepoint_drive_id: 'drive-1', sharepoint_item_id: 'item-1',
  file_name: 'Report.pdf', mime_type: 'application/pdf',
}
function request(query = '', userAgent = iphone) {
  return new Request(`https://artmuse.ch/api/documents/doc-1/open${query}`, {
    headers: { 'user-agent': userAgent, accept: 'text/html,application/pdf' },
  })
}
const context = { params: Promise.resolve({ id: 'doc-1' }) }

describe('iPhone document reader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUser.mockResolvedValue({
      supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }) },
    })
    mocks.maybeSingle.mockResolvedValue({ data: document, error: null })
    mocks.downloadDocument.mockImplementation(() => Promise.resolve(new Response('PDF content')))
  })

  it('sends an iPhone document navigation to the reader with an artwork return link', async () => {
    const response = await GET(request(), context)
    const destination = new URL(response.headers.get('location')!)
    expect(destination.pathname).toBe('/documents/doc-1/view')
    expect(destination.searchParams.get('returnTo')).toBe('/artworks/print/art-1')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.downloadDocument).not.toHaveBeenCalled()
  })

  it('uses the original referring page when available', () => {
    const req = new Request(request(), { headers: {
      'user-agent': iphone, accept: 'text/html',
      referer: 'https://artmuse.ch/artworks/print/art-1?client=2',
    } })
    expect(iphoneDocumentViewerUrl(req, 'doc-1', 'art-1')?.searchParams.get('returnTo'))
      .toBe('/artworks/print/art-1?client=2')
  })

  it('does not redirect a programmatic API fetch', () => {
    const req = new Request('https://artmuse.ch/api/documents/doc-1/open', { headers: { 'user-agent': iphone } })
    expect(iphoneDocumentViewerUrl(req, 'doc-1', 'art-1')).toBeNull()
  })

  it('returns market documents to Market when no referring page is available', () => {
    expect(iphoneDocumentViewerUrl(request(), 'doc-1', null)?.searchParams.get('returnTo')).toBe('/market')
  })

  it('ignores an external referring page', () => {
    const req = new Request(request(), { headers: {
      'user-agent': iphone, accept: 'text/html', referer: 'https://example.com/other',
    } })
    expect(iphoneDocumentViewerUrl(req, 'doc-1', 'art-1')?.searchParams.get('returnTo'))
      .toBe('/artworks/print/art-1')
  })

  it.each(['?embedded=1', ''])('keeps inline delivery for embedded iPhone files or desktop (%s)', async query => {
    const response = await GET(request(query, query ? iphone : 'Desktop Safari'), context)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('content-disposition')).toContain('inline;')
    expect(await response.text()).toBe('PDF content')
  })

  it('delivers downloads as attachments without a reader redirect', async () => {
    const response = await GET(request('?download=1'), context)
    expect(response.headers.get('content-disposition')).toContain('attachment;')
    expect(await response.text()).toBe('PDF content')
  })

  it('preserves legacy external redirects', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { ...document, storage_provider: 'legacy', url: 'https://example.com/file.pdf' }, error: null })
    expect((await GET(request(), context)).headers.get('location')).toBe('https://example.com/file.pdf')
  })

  it('requires authorization before returning the reader', async () => {
    mocks.requireUser.mockResolvedValue({ response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) })
    expect((await GET(request(), context)).status).toBe(401)
    expect(mocks.maybeSingle).not.toHaveBeenCalled()
  })

  it('does not expose inaccessible documents', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
    expect((await GET(request(), context)).status).toBe(404)
    expect(mocks.downloadDocument).not.toHaveBeenCalled()
  })

  it('reports document download failures', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mocks.downloadDocument.mockRejectedValue(new Error('Unavailable'))
      expect((await GET(request('?embedded=1'), context)).status).toBe(502)
      expect(log).toHaveBeenCalled()
    } finally {
      log.mockRestore()
    }
  })

  it.each(['https://evil.test', '//evil.test', '/\\evil.test', '/api/documents/doc-1/open', '/documents/doc-1/view'])(
    'rejects unsafe or looping return paths: %s', path => {
      expect(documentReturnPath(path)).toBe('/artworks')
    }
  )

  it('renders a persistent return link outside the preview and a separate download action', async () => {
    const html = renderToStaticMarkup(await DocumentViewerPage({
      params: Promise.resolve({ id: 'doc-1' }),
      searchParams: Promise.resolve({ returnTo: '/artworks/print/art-1' }),
    }))
    expect(html).toContain('href="/artworks/print/art-1"')
    expect(html).toContain('Back to ArtMuse')
    expect(html.indexOf('Back to ArtMuse')).toBeLessThan(html.indexOf('<iframe'))
    expect(html).toContain('/api/documents/doc-1/open?embedded=1')
    expect(html).toContain('/api/documents/doc-1/open?download=1')
  })
})
