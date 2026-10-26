// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CommissionInvoiceFileInput from '@/components/CommissionInvoiceFileInput'
import CommissionsPage from '@/app/(protected)/commissions/page'

const mocks = vi.hoisted(() => ({ fetchWithAuth: vi.fn(), matchesClient: vi.fn(() => true) }))
vi.mock('@/lib/fetchWithAuth', () => ({ fetchWithAuth: mocks.fetchWithAuth }))
vi.mock('@/contexts/ClientFilterContext', () => ({
  useClientFilter: () => ({ matchesClient: mocks.matchesClient, isFilterActive: false }),
}))
vi.mock('xlsx-js-style', () => ({}))

let container: HTMLDivElement
let root: Root

function FileInput({ disabled = false }: { disabled?: boolean }) {
  const [file, setFile] = useState<File>()
  return <CommissionInvoiceFileInput label="Invoice file" file={file} disabled={disabled} onChange={setFile} />
}
function file(name = 'Invoice.pdf', size?: number) {
  const result = new File(['invoice'], name, { type: 'application/pdf' })
  if (size !== undefined) Object.defineProperty(result, 'size', { value: size })
  return result
}
async function selectFiles(files: File[], selector = 'input[type="file"]') {
  const input = container.querySelector<HTMLInputElement>(selector)!
  await act(async () => {
    Object.defineProperty(input, 'files', { configurable: true, value: files })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
async function clickButton(text: string) {
  const button = Array.from(container.querySelectorAll('button')).find(button => button.textContent === text)
  if (!button) throw new Error(`Missing button ${text}`)
  await act(async () => button.click())
}
async function date(value: string, selector = 'input[type="date"]') {
  const input = container.querySelector<HTMLInputElement>(selector)!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function dropFiles(files: File[]) {
  const zone = container.querySelector('input[type="file"]')!.parentElement!
  await act(async () => {
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: { files } })
    zone.dispatchEvent(event)
  })
}
const artwork = {
  id: 'art-1', title: 'Artwork', medium: null, year_execution: 2026,
  date_acquisition: '2026-01-01', cost_amount: 10000, cost_currency: 'USD',
  auctions: false, sold_hammer: null, auction_currency: null,
  buyer: { company_name: 'Florac', first_name: null, last_name: null },
  proposedBy: null, artist: null,
}
function loadResponse(existingUrl?: string, withCorrection = false) {
  return Response.json({
    artworks: withCorrection ? [artwork, {
      ...artwork, id: 'art-2', title: 'Second artwork',
      date_acquisition: '2026-02-01', cost_amount: 5000000,
    }] : [artwork],
    invoices: existingUrl ? [{
      artwork_id: 'art-1', invoiced_at: '2026-10-25', invoice_url: existingUrl,
    }] : [],
    correctionInvoices: [], fxRates: [], commissionRates: [],
  })
}

describe('commission invoice file input', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.matchesClient.mockReturnValue(true)
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it.each([
    ['a network failure', () => Promise.reject(new Error('Network unavailable')), 'Network unavailable'],
    ['an HTML error page', () => Promise.resolve(new Response('<html>Server error</html>', {
      status: 502, headers: { 'Content-Type': 'text/html' },
    })), 'HTTP 502'],
    ['an API error', () => Promise.resolve(Response.json({ error: 'Database unavailable' }, { status: 500 })), 'Database unavailable'],
    ['invalid data', () => Promise.resolve(Response.json({})), 'invalid commission data'],
  ])('stops loading and offers retry after %s', async (_label, response, message) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.fetchWithAuth.mockImplementationOnce(response).mockResolvedValueOnce(loadResponse())
    await act(async () => root.render(<CommissionsPage />))
    expect(container.textContent).not.toContain('Loading…')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(message)
    await clickButton('Retry loading commissions')
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.textContent).toContain('Artwork')
    expect(mocks.fetchWithAuth).toHaveBeenCalledTimes(2)
  })

  it('times out even if authentication never resolves, then permits a retry', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.fetchWithAuth.mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce(loadResponse())
    await act(async () => root.render(<CommissionsPage />))
    expect(container.textContent).toContain('Loading…')
    await act(async () => vi.advanceTimersByTimeAsync(30_000))
    expect(container.textContent).not.toContain('Loading…')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('timed out')
    expect(mocks.fetchWithAuth.mock.calls[0][1].signal.aborted).toBe(true)
    await clickButton('Retry loading commissions')
    expect(container.textContent).toContain('Artwork')
  })

  it('renders a compact single-line Add file invoice button and a single-file picker', async () => {
    await act(async () => root.render(<FileInput />))
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
    expect(input.multiple).toBe(false)
    expect(input.hidden).toBe(true)
    const button = container.querySelector('button')!
    expect(button.textContent).toBe('Add file invoice')
    expect(button.className).toContain('whitespace-nowrap')
    expect(button.parentElement?.className).toContain('inline-flex')
    const click = vi.spyOn(input, 'click')
    await clickButton('Add file invoice')
    expect(click).toHaveBeenCalledOnce()
  })

  it('replaces the selection instead of appending and allows clearing it', async () => {
    await act(async () => root.render(<FileInput />))
    await selectFiles([file('First.pdf')])
    await selectFiles([file('Second.pdf')])
    expect(container.textContent).toContain('Second.pdf')
    expect(container.textContent).not.toContain('First.pdf')
    await clickButton('x')
    expect(container.textContent).not.toContain('Second.pdf')
  })

  it('rejects a multiple-file drop and keeps the previous selection', async () => {
    await act(async () => root.render(<FileInput />))
    await selectFiles([file('Existing.pdf')])
    await dropFiles([file('First.pdf'), file('Second.pdf')])
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('only one')
    expect(container.textContent).toContain('Existing.pdf')
    expect(container.textContent).not.toContain('First.pdf')
  })

  it('accepts a single dropped file', async () => {
    await act(async () => root.render(<FileInput />))
    await dropFiles([file('Dropped.pdf')])
    expect(container.textContent).toContain('Dropped.pdf')
  })

  it.each([
    [0, 'This file is empty.'],
    [100 * 1024 * 1024 + 1, 'File too large. Maximum size: 100 MB.'],
  ])('rejects invalid file size %s', async (size, message) => {
    await act(async () => root.render(<FileInput />))
    await selectFiles([file('Invalid.pdf', size)])
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(message)
    expect(container.querySelector('[title="Invalid.pdf"]')).toBeNull()
  })

  it('accepts exactly 100 MB', async () => {
    await act(async () => root.render(<FileInput />))
    await selectFiles([file('Maximum.pdf', 100 * 1024 * 1024)])
    expect(container.textContent).toContain('Maximum.pdf')
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('blocks selection and drops while saving', async () => {
    await act(async () => root.render(<FileInput disabled />))
    expect(container.querySelector('button')?.disabled).toBe(true)
    expect(container.querySelector('input')?.disabled).toBe(true)
    await dropFiles([file('Ignored.pdf')])
    expect(container.textContent).not.toContain('Ignored.pdf')
  })

  it('saves the invoice date and exactly one selected file together', async () => {
    mocks.fetchWithAuth.mockResolvedValueOnce(loadResponse()).mockResolvedValueOnce(Response.json({
      invoice: {
        artwork_id: 'art-1', invoiced_at: '2026-10-26',
        invoice_url: '/api/documents/file-1/open',
      },
    }))
    await act(async () => root.render(<CommissionsPage />))
    await date('2026-10-26')
    await selectFiles([file()])
    expect(mocks.fetchWithAuth).toHaveBeenCalledTimes(1)
    await clickButton('Save')
    const [url, options] = mocks.fetchWithAuth.mock.calls[1]
    expect(url).toBe('/api/commissions')
    expect(options.headers).toBeUndefined()
    expect(options.body.getAll('file')).toHaveLength(1)
    expect(options.body.get('file').name).toBe('Invoice.pdf')
    expect(JSON.parse(options.body.get('invoice'))).toEqual({
      kind: 'artwork', artworkId: 'art-1', invoicedAt: '2026-10-26',
      invoiceUrl: '', commissionAmount: 800,
    })
    expect(container.querySelector('a[href="/api/documents/file-1/open"]')).not.toBeNull()
    expect(container.querySelector('[title="Invoice.pdf"]')).toBeNull()
  })

  it('keeps the existing URL when changing only the invoice date', async () => {
    const existingUrl = 'https://onedrive.example/invoice.pdf'
    mocks.fetchWithAuth.mockResolvedValueOnce(loadResponse(existingUrl)).mockResolvedValueOnce(Response.json({
      invoice: { artwork_id: 'art-1', invoiced_at: '2026-10-26', invoice_url: existingUrl },
    }))
    await act(async () => root.render(<CommissionsPage />))
    await date('2026-10-26')
    await clickButton('Save')
    const options = mocks.fetchWithAuth.mock.calls[1][1]
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(options.body).invoiceUrl).toBe(existingUrl)
    expect(container.querySelector(`a[href="${existingUrl}"]`)).not.toBeNull()
  })

  it('preserves the selected file after a failed save so it can be retried', async () => {
    mocks.fetchWithAuth.mockResolvedValueOnce(loadResponse()).mockResolvedValueOnce(Response.json(
      { error: 'SharePoint upload failed.' }, { status: 502 }
    ))
    await act(async () => root.render(<CommissionsPage />))
    await date('2026-10-26')
    await selectFiles([file()])
    await clickButton('Save')
    expect(container.textContent).toContain('SharePoint upload failed.')
    expect(container.querySelector('[title="Invoice.pdf"]')).not.toBeNull()
  })

  it('uses the same single-file control for annual corrections', async () => {
    mocks.fetchWithAuth.mockResolvedValueOnce(loadResponse('https://example.com/old.pdf', true))
      .mockResolvedValueOnce(Response.json({
        correctionInvoice: {
          calendar_year: 2026, company: 'Florac', invoiced_at: '2026-10-26',
          invoice_url: '/api/documents/correction-1/open',
        },
      }))
    await act(async () => root.render(<CommissionsPage />))
    await date('2026-10-26')
    await selectFiles([file('Correction.pdf')], '[aria-label="Correction invoice file for Florac"]')
    await clickButton('Save')
    const form = mocks.fetchWithAuth.mock.calls[1][1].body
    expect(form.getAll('file')).toHaveLength(1)
    expect(JSON.parse(form.get('invoice'))).toEqual({
      kind: 'correction', calendarYear: 2026, company: 'Florac',
      invoicedAt: '2026-10-26', invoiceUrl: '',
      artworkCommissions: [{ artworkId: 'art-1', commissionAmount: 700.0000000000001 }],
    })
  })
})
