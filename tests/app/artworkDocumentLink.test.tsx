import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ArtworkDocumentLink from '@/components/artwork/ArtworkDocumentLink'
import { documentFileType } from '@/lib/documentFileType'

describe('factsheet file formats and downloads', () => {
  it.each([
    [{ file_name: 'report.PDF' }, 'PDF'],
    [{ file_name: 'photo.jpeg' }, 'JPG'],
    [{ file_name: 'scan.tiff' }, 'TIF'],
    [{ mime_type: 'image/tiff', file_name: 'scan' }, 'TIF'],
    [{ mime_type: 'application/pdf; charset=utf-8' }, 'PDF'],
    [{ url: 'https://example.test/scan.JPG?token=123#page' }, 'JPG'],
    [{ label: 'archive.zip' }, 'ZIP'],
    [{ url: 'https://example.test/folder' }, 'LINK'],
    [{ url: 'https://example.test/%broken', file_name: 'photo.png' }, 'PNG'],
  ])('detects the format of %j', (metadata, expected) => {
    expect(documentFileType(metadata)).toBe(expected)
  })

  it('downloads SharePoint files through the authenticated endpoint, not a direct SharePoint URL', () => {
    const html = renderToStaticMarkup(<ArtworkDocumentLink document={{
      id: 'doc', label: 'Condition report', file_name: 'report.pdf',
      url: '/api/documents/doc/open', storage_provider: 'sharepoint',
    }} />)
    expect(html).toContain('aria-label="PDF file"')
    expect(html).toContain('>PDF</span>')
    expect(html.indexOf('Condition report</a>')).toBeLessThan(html.indexOf('aria-label="PDF file"'))
    expect(html.indexOf('aria-label="PDF file"')).toBeLessThan(html.indexOf('class="document-download-action"'))
    expect(html).toContain('padding:0;line-height:1.4')
    expect(html).toContain('href="/api/documents/doc/open?download=1"')
    expect(html).toContain('download="report.pdf"')
    expect(html).toContain('aria-label="Download Condition report"')
    expect(html).not.toContain('>Download</a>')
    expect(html).toContain('width="14" height="14"')
    expect(html).toContain('class="document-download-action"')
  })

  it('recognizes authenticated document links even without storage metadata', () => {
    const html = renderToStaticMarkup(<ArtworkDocumentLink document={{
      id: 'doc', label: 'Photo.jpg', url: '/api/documents/doc/open',
    }} />)
    expect(html).toContain('aria-label="JPG file"')
    expect(html).toContain('/api/documents/doc/open?download=1')
  })

  it('does not promise a forced download for external links', () => {
    const html = renderToStaticMarkup(<ArtworkDocumentLink document={{
      id: 'external', label: 'Archive', url: 'https://example.test/folder',
    }} />)
    expect(html).toContain('aria-label="External link"')
    expect(html).toContain('aria-label="Open source for Archive"')
    expect(html).not.toContain('>Open source</a>')
    expect(html).not.toContain('download=')
    expect(html).not.toContain('/api/documents/external')
  })
})
