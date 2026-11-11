// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SothebysLotImporter from '@/components/artwork/SothebysLotImporter'
import ChristiesLotImporter from '@/components/artwork/ChristiesLotImporter'
import PhillipsLotImporter from '@/components/artwork/PhillipsLotImporter'
import { parsedLot, sourceUrl } from '../fixtures/sothebysLot'
import { parsedLot as christiesLot } from '../fixtures/christiesLot'
import { parsedLot as phillipsLot } from '../fixtures/phillipsLot'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), prepared: vi.fn(), busy: vi.fn() }))
vi.mock('@/lib/fetchWithAuth', () => ({ fetchWithAuth: mocks.fetch }))
let container: HTMLDivElement
let root: Root

async function click(text: string) {
  await act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent === text)!.click())
}

describe.each([
  { house: "Sotheby's", provider: 'sothebys', Importer: SothebysLotImporter, parsedLot, sourceUrl },
  { house: "Christie's", provider: 'christies', Importer: ChristiesLotImporter, parsedLot: christiesLot, sourceUrl: christiesLot.source_url },
  { house: 'Phillips', provider: 'phillips', Importer: PhillipsLotImporter, parsedLot: phillipsLot, sourceUrl: phillipsLot.source_url },
])('$house import preview', ({ house, provider, Importer, parsedLot, sourceUrl }) => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    mocks.fetch.mockResolvedValue(Response.json(parsedLot))
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root.render(<Importer disabled={false} onBusyChange={mocks.busy} onPrepared={mocks.prepared} />))
    const input = container.querySelector<HTMLInputElement>('input[type="url"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, sourceUrl)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('previews every gallery image and carries only selected images into creation', async () => {
    await click(`Read ${house} lot`)
    expect(container.querySelectorAll('img')).toHaveLength(parsedLot.images.length)
    expect(container.textContent).toContain(String(parsedLot.estimate_low))
    expect(container.textContent).toContain(`${parsedLot.sale_date} ${parsedLot.sale_time}`)
    expect(container.textContent).toContain(`Sale date and time (local — ${parsedLot.location})`)
    expect(container.textContent).not.toContain('Europe/Zurich')
    expect(container.textContent).toContain('Videos are ignored.')
    expect(container.querySelector('video, iframe')).toBeNull()
    expect(mocks.fetch).toHaveBeenCalledWith(`/api/artwork-imports/${provider}`, expect.objectContaining({
      body: JSON.stringify({ url: sourceUrl }),
    }))
    expect(mocks.prepared).not.toHaveBeenCalled()
    await act(async () => container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1].click())
    await click('Continue to artwork creation')
    expect(mocks.prepared).toHaveBeenCalledWith({ ...parsedLot, images: parsedLot.images.filter((_, index) => index !== 1) })
    expect(mocks.busy.mock.calls).toEqual([[true], [false]])
  })

  it('reports blocked pages without offering creation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.fetch.mockResolvedValueOnce(Response.json({ error: `${house} requires browser verification.` }, { status: 502 }))
    await click(`Read ${house} lot`)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('browser verification')
    expect(container.textContent).not.toContain('Continue to artwork creation')
  })

  it('displays the mapped office and explicit manual-address warning', async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({
      ...parsedLot, contact_defaults: { contact_id: provider, location_address_id: null, city: null, warning: 'Select the location address manually.' },
    }))
    await click(`Read ${house} lot`)
    expect(container.textContent).toContain(`Proposed by, auction house and location: ${house}`)
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Select the location address manually.')
  })

  it('rejects malformed defaults before allowing creation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.fetch.mockResolvedValueOnce(Response.json({ ...parsedLot, contact_defaults: { contact_id: 123 } }))
    await click(`Read ${house} lot`)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('could not be confirmed')
    expect(container.textContent).not.toContain('Continue to artwork creation')
  })
})
