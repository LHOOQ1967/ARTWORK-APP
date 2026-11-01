// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TransportsPage from '@/app/(protected)/transports/page'

const mocks = vi.hoisted(() => ({ fetchWithAuth: vi.fn() }))
vi.mock('@/lib/fetchWithAuth', () => ({ fetchWithAuth: mocks.fetchWithAuth }))
vi.mock('@/contexts/ClientFilterContext', () => ({
  useClientFilter: () => ({ matchesClient: () => true }),
}))
vi.mock('@/components/ui/SearchSelect', () => ({ default: () => null }))

const transport = {
  id: 'transport-1', artwork_id: 'artwork-1', instruction_date: null,
  transport_date: null, arrival_date: null, instruction_contact_id: null,
  notes: '', final_invoice_pdf_url: 'https://example.com/old-invoice.pdf',
  artwork: { title: 'Artwork', artist: null }, image_url: null,
  quotes: [], origin: null, destination: null,
}
let container: HTMLDivElement
let root: Root
function load(canEdit = true, invoiceUrl = transport.final_invoice_pdf_url) {
  return Response.json({
    transports: [{ ...transport, final_invoice_pdf_url: invoiceUrl }],
    artworks: [], contacts: [], canEdit,
  })
}
async function selectFile() {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  await act(async () => {
    Object.defineProperty(input, 'files', {
      configurable: true, value: [new File(['invoice'], 'Transport.pdf', { type: 'application/pdf' })],
    })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
async function save() {
  const button = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Save')!
  await act(async () => button.click())
}

describe('transport final invoice upload UI', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it('replaces URL entry with a file picker and keeps legacy invoice access', async () => {
    mocks.fetchWithAuth.mockResolvedValueOnce(load())
    await act(async () => root.render(<TransportsPage />))
    expect(container.querySelector('input[type="url"]')).toBeNull()
    expect(container.textContent).toContain('Final invoice')
    expect(container.textContent).toContain('Add Invoice')
    expect(container.querySelector('a[href="https://example.com/old-invoice.pdf"]')?.textContent).toBe('Open final invoice')
  })

  it('saves a file with the transport fields as multipart and shows the new document link', async () => {
    const invoiceUrl = '/api/documents/invoice-1/open'
    mocks.fetchWithAuth.mockResolvedValueOnce(load())
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(load(true, invoiceUrl))
    await act(async () => root.render(<TransportsPage />))
    await selectFile()
    await save()
    const [url, options] = mocks.fetchWithAuth.mock.calls[1]
    expect(url).toBe('/api/transports/transport-1')
    expect(options.method).toBe('PATCH')
    expect(options.headers).toBeUndefined()
    expect(options.body).toBeInstanceOf(FormData)
    expect(options.body.get('file').name).toBe('Transport.pdf')
    expect(JSON.parse(options.body.get('transport'))).not.toHaveProperty('final_invoice_pdf_url')
    expect(container.querySelector(`a[href="${invoiceUrl}"]`)).not.toBeNull()
    expect(container.querySelector('[title="Transport.pdf"]')).toBeNull()
  })

  it('keeps the selected invoice after a failed save for retry', async () => {
    mocks.fetchWithAuth.mockResolvedValueOnce(load())
      .mockResolvedValueOnce(Response.json({ error: 'SharePoint upload failed.' }, { status: 502 }))
    await act(async () => root.render(<TransportsPage />))
    await selectFile()
    await save()
    expect(container.textContent).toContain('SharePoint upload failed.')
    expect(container.querySelector('[title="Transport.pdf"]')).not.toBeNull()
    expect(container.querySelector('a[href="https://example.com/old-invoice.pdf"]')).not.toBeNull()
  })

  it('does not clear the existing invoice during a save without a new file', async () => {
    mocks.fetchWithAuth.mockResolvedValueOnce(load())
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(load())
    await act(async () => root.render(<TransportsPage />))
    await save()
    const options = mocks.fetchWithAuth.mock.calls[1][1]
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(options.body)).not.toHaveProperty('final_invoice_pdf_url')
  })

  it('keeps invoice reading but hides upload and save controls for Viewers', async () => {
    mocks.fetchWithAuth.mockResolvedValueOnce(load(false))
    await act(async () => root.render(<TransportsPage />))
    expect(container.querySelector('input[type="file"]')).toBeNull()
    expect(container.textContent).not.toContain('Add Invoice')
    expect(container.querySelector('a[href="https://example.com/old-invoice.pdf"]')).not.toBeNull()
  })
})
