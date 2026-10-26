import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error The operational migration is a native Node.js module.
import { migrateCommissionInvoices } from '../../scripts/migrate-commission-invoices.mjs'

let directory: string
const url = 'https://example.sharepoint.com/sites/Collection/invoice.pdf'
const artwork = {
  id: 'art-1', title: 'Artwork', date_acquisition: '2026-01-01',
  cost_amount: 10000, cost_currency: 'USD', auctions: false,
  buyer: { company_name: 'Florac' },
}

function setup({ apply = false, copy = 'invoice', saveError = false } = {}) {
  let invoiceUrl = url
  let documents: { id: string; visibility: string; storage_provider: string }[] = []
  const sb = vi.fn(async (path: string, init?: RequestInit) => {
    const table = path.split('?')[0]
    if (init?.method === 'POST') {
      documents = JSON.parse(String(init.body))
      return Response.json(documents)
    }
    if (init?.method === 'PATCH') {
      if (saveError) return Response.json({ error: 'Failed' }, { status: 400 })
      invoiceUrl = JSON.parse(String(init.body)).invoice_url
      return Response.json([{ invoice_url: invoiceUrl }])
    }
    if (init?.method === 'DELETE') return new Response(null, { status: 204 })
    if (table === 'artwork_commission_invoices') {
      return Response.json([{ artwork_id: 'art-1', invoice_url: invoiceUrl }])
    }
    if (table === 'artworks') return Response.json([artwork])
    if (table === 'documents') return Response.json(documents)
    return Response.json([])
  })
  let downloads = 0
  const gfetch = vi.fn(async (_path: string, init?: RequestInit) => {
    if (init?.method === 'DELETE') return new Response(null, { status: 204 })
    return new Response(downloads++ === 0 ? 'invoice' : copy)
  })
  const deps = {
    apply, limit: Infinity, sb, gfetch,
    getSource: vi.fn(async () => ({
      id: 'source', name: 'Invoice.pdf', size: 7,
      file: { mimeType: 'application/pdf' }, parentReference: { driveId: 'source-drive' },
    })),
    upload: vi.fn(async () => ({
      id: 'copy', driveId: 'drive', name: 'Invoice.pdf', webUrl: 'https://example.sharepoint.com/copy',
    })),
    buildFolder: () => 'Artistes/Artist/Artwork',
    logFile: join(directory, 'migration.csv'),
    csv: (value: unknown) => JSON.stringify(String(value ?? '')),
  }
  return { deps, invoiceUrl: () => invoiceUrl }
}

describe('commission invoice migration', () => {
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'artmuse-commission-test-'))
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.exitCode = 0
    vi.restoreAllMocks()
    rmSync(directory, { recursive: true })
  })

  it('resolves sources without writing during a dry run', async () => {
    const { deps, invoiceUrl } = setup()
    await migrateCommissionInvoices(deps)
    expect(deps.getSource).toHaveBeenCalledOnce()
    expect(deps.upload).not.toHaveBeenCalled()
    expect(deps.sb.mock.calls.every(([, init]) => !init)).toBe(true)
    expect(invoiceUrl()).toBe(url)
  })

  it('verifies copied bytes, creates artwork documents and persists the invoice URL', async () => {
    const { deps, invoiceUrl } = setup({ apply: true })
    await migrateCommissionInvoices(deps)
    expect(invoiceUrl()).toMatch(/^\/api\/documents\/[0-9a-f-]+\/open$/)
    const insert = deps.sb.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(JSON.parse(String(insert[1]?.body))).toEqual([expect.objectContaining({
      artwork_id: 'art-1', legacy_url: url, visibility: 'all_clients', storage_provider: 'sharepoint',
    })])
    const log = readFileSync(deps.logFile, 'utf8')
    expect(log).toContain('SHA-256 verified')
    expect(log).toContain(url)
  })

  it.each([
    { copy: 'changed', saveError: false },
    { copy: 'invoice', saveError: true },
  ])('preserves the old link and cleans up on failure (%j)', async options => {
    const { deps, invoiceUrl } = setup({ apply: true, ...options })
    await migrateCommissionInvoices(deps)
    expect(invoiceUrl()).toBe(url)
    expect(deps.gfetch).toHaveBeenCalledWith('/drives/drive/items/copy', { method: 'DELETE' })
    expect(readFileSync(deps.logFile, 'utf8')).toContain('failed')
    expect(process.exitCode).toBe(1)
  })
})
