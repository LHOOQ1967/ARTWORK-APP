// @vitest-environment jsdom
import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ImportLabelPage from '@/app/(protected)/artworks/import-label/page'
import ImportBlondeauPage from '@/app/(protected)/artworks/import-blondeau/page'
import type BlondeauSheetImporter from '@/components/artwork/BlondeauSheetImporter'
import type { ArtworkFieldsLayout } from '@/components/artwork/ArtworkFieldsLayout'
import type SothebysLotImporter from '@/components/artwork/SothebysLotImporter'
import { parsedLot } from '../fixtures/sothebysLot'
import { parsedLot as christiesLot } from '../fixtures/christiesLot'
import { parsedLot as phillipsLot } from '../fixtures/phillipsLot'

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  fetch: vi.fn(),
  push: vi.fn(),
  from: vi.fn(),
  redirect: vi.fn(),
  selectedContact: vi.fn(),
  omitInitialContact: false,
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, back: vi.fn() }), redirect: mocks.redirect }))
vi.mock('@/lib/supabaseBrowser', () => ({ supabase: { from: mocks.from } }))
vi.mock('@/lib/fetchWithAuth', () => ({ fetchWithAuth: (...args: unknown[]) => mocks.fetch(...args) }))
vi.mock('@/components/artwork/SothebysLotImporter', () => ({
  default: ({ onPrepared }: ComponentProps<typeof SothebysLotImporter>) => (
    <button onClick={() => onPrepared({
      ...parsedLot,
      contact_defaults: { contact_id: 'sothebys', location_address_id: 'new-york', city: 'New York', warning: null },
    })}>Prepare Sotheby&apos;s lot</button>
  ),
}))
vi.mock('@/components/artwork/ChristiesLotImporter', () => ({
  default: ({ onPrepared }: ComponentProps<typeof SothebysLotImporter>) => (
    <button onClick={() => onPrepared({
      ...christiesLot,
      contact_defaults: { contact_id: 'christies', location_address_id: 'new-york', city: 'New York', warning: null },
    })}>Prepare Christie&apos;s lot</button>
  ),
}))
vi.mock('@/components/artwork/PhillipsLotImporter', () => ({
  default: ({ onPrepared }: ComponentProps<typeof SothebysLotImporter>) => (
    <button onClick={() => onPrepared({
      ...phillipsLot,
      contact_defaults: { contact_id: 'phillips', location_address_id: 'new-york', city: 'New York', warning: null },
    })}>Prepare Phillips lot</button>
  ),
}))
vi.mock('@/components/artwork/BlondeauSheetImporter', () => ({
  default: ({ onPrepared }: ComponentProps<typeof BlondeauSheetImporter>) => (
    <button onClick={() => onPrepared?.({
      pdf: new File(['%PDF-1.7'], 'factsheet.pdf', { type: 'application/pdf' }),
      image: new File(['image'], 'crop.png', { type: 'image/png' }),
      fields: {
        title: 'Portrait', medium: 'Oil on canvas', signature: 'Signed', edition: 'AP',
        year_execution_start: 1910, year_execution: 1912,
      },
    })}>Prepare factsheet</button>
  ),
}))
vi.mock('@/components/artwork/ArtworkFieldsLayout', () => ({
  ArtworkFieldsLayout: ({ artwork, setArtwork, isEditing, contactOptions }: ComponentProps<typeof ArtworkFieldsLayout>) => (
    <div>
      <span data-testid="selected-contact">{contactOptions?.find(contact => contact.id === artwork.proposed_by_id)?.company_name}</span>
      <p>{artwork.title} / {artwork.medium} / {artwork.signature} / {artwork.edition} / {artwork.year_execution_start}-{artwork.year_execution}</p>
      <button disabled={!isEditing} onClick={() => setArtwork({ ...artwork, artist_id: 'artist-1', title: 'Reviewed portrait' })}>
        Review artwork
      </button>
    </div>
  ),
}))

let container: HTMLDivElement
let root: Root

async function click(text: string) {
  const button = Array.from(container.querySelectorAll('button')).find(item => item.textContent === text)
  expect(button, `Button "${text}"`).toBeDefined()
  await act(async () => button!.click())
}

describe('creating an artwork from a Blondeau factsheet', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.omitInitialContact = false
    mocks.selectedContact.mockResolvedValue({ data: { id: 'sothebys', company_name: "Sotheby's" }, error: null })
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('fetch', mocks.fetch)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    sessionStorage.clear()
    mocks.insert.mockReturnValue({
      select: () => ({ single: async () => ({ data: { id: 'new-artwork' }, error: null }) }),
    })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'artworks') return { insert: mocks.insert }
      return {
        select: () => ({
          eq: () => ({ single: mocks.selectedContact }),
          or: () => ({ limit: async () => ({ data: [], error: null }) }),
          order: () => ({
            limit: async () => ({
              data: table === 'artists' ? [{ id: 'artist-1', first_name: 'Test', last_name: 'Artist' }] : mocks.omitInitialContact ? [] : [
                { id: 'sothebys', company_name: "Sotheby's" }, { id: 'christies', company_name: "Christie's" },
                { id: 'phillips', company_name: 'Phillips' },
              ],
              error: null,
            }),
          }),
        }),
      }
    })
    mocks.fetch.mockResolvedValue(Response.json({
      documents: [{ id: 'pdf-doc', artwork_id: 'new-artwork', document_type: 'link', url: '/pdf' }],
    }))
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    sessionStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  async function prepare() {
    await act(async () => root.render(<ImportLabelPage />))
    expect(container.querySelector('h1')!.textContent).toBe('Import artwork')
    const heading = container.querySelector<HTMLElement>('#blondeau-section-heading')!
    expect(Array.from(container.querySelectorAll('h2'), item => item.textContent?.trim())).toEqual([
      "1. Christie's",
      "2. Sotheby's",
      '3. Phillips',
      '4. Import Blondeau Factsheet',
      '5. Label photo',
      '6. Analysis',
      '7. Detected results and corrections',
    ])
    const auctionGrid = container.querySelector<HTMLElement>('[aria-label="Auction imports"]')!
    expect(auctionGrid.style.display).toBe('grid')
    expect(auctionGrid.style.gridTemplateColumns).toBe('repeat(auto-fit, minmax(min(100%, 320px), 1fr))')
    expect(auctionGrid.querySelectorAll(':scope > section')).toHaveLength(3)
    expect(auctionGrid.nextElementSibling).toBe(heading.closest('section'))
    const photoHeading = container.querySelectorAll('h2')[4]
    expect(heading.getAttribute('style')).toBe(photoHeading.getAttribute('style'))
    expect(heading.closest('section')!.getAttribute('style')).toBe(photoHeading.closest('section')!.getAttribute('style'))
    expect(container.querySelector('input[accept="image/*"]')).not.toBeNull()
    expect(container.querySelector('a[href="/artworks/import-blondeau"]')).toBeNull()
    await click('Prepare factsheet')
    expect(container.textContent).toContain('Portrait / Oil on canvas / Signed / AP / 1910-1912')
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.fetch).not.toHaveBeenCalled()
    await click('Review artwork')
  }

  it('redirects the former separate page to the combined import page', () => {
    ImportBlondeauPage()
    expect(mocks.redirect).toHaveBeenCalledWith('/artworks/import-label')
  })

  it('loads the selected Sotheby\'s contact even when absent from the initial 200 contacts', async () => {
    mocks.omitInitialContact = true
    await act(async () => root.render(<ImportLabelPage />))
    await click("Prepare Sotheby's lot")
    expect(mocks.selectedContact).toHaveBeenCalledOnce()
    expect(container.querySelector('[data-testid="selected-contact"]')?.textContent).toBe("Sotheby's")
  })

  it('saves reviewed fields, then attaches the PDF and crop to the new artwork', async () => {
    await prepare()
    await click('Save')
    await act(async () => vi.advanceTimersByTimeAsync(450))
    expect(mocks.insert).toHaveBeenCalledOnce()
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Reviewed portrait', artist_id: 'artist-1', medium: 'Oil on canvas',
      signature: 'Signed', edition: 'AP', year_execution_start: 1910, year_execution: 1912,
    }))
    expect(mocks.fetch).toHaveBeenCalledWith('/api/artworks/new-artwork/blondeau-imports', expect.objectContaining({
      method: 'POST', credentials: 'include',
    }))
    const form: FormData = mocks.fetch.mock.calls[0][1].body
    expect(form.get('pdf')).toHaveProperty('name', 'factsheet.pdf')
    expect(form.get('image')).toHaveProperty('name', 'crop.png')
    expect(form.get('fields')).toBe('{}')
    expect(mocks.push).toHaveBeenCalledWith('/artworks/print/new-artwork')
  })

  it('retries failed document import without inserting another artwork', async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ error: 'SharePoint unavailable' }, { status: 502 }))
    await prepare()
    await click('Save')
    expect(container.textContent).toContain('The artwork was created, but its factsheet could not be attached.')
    expect(container.textContent).toContain('SharePoint unavailable')
    expect(mocks.push).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLButtonElement>('button[disabled]')?.textContent).toBe('Review artwork')
    await click('Retry document import')
    await act(async () => vi.advanceTimersByTimeAsync(450))
    expect(mocks.insert).toHaveBeenCalledOnce()
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    expect(mocks.push).toHaveBeenCalledWith('/artworks/print/new-artwork')
  })

  it('does not upload files when artwork creation fails', async () => {
    mocks.insert.mockReturnValue({
      select: () => ({ single: async () => ({ data: null, error: { message: 'Creation denied' } }) }),
    })
    await prepare()
    await click('Save')
    expect(container.textContent).toContain('Creation denied')
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('does not restore an unrelated manual creation draft over the factsheet', async () => {
    sessionStorage.setItem('artmuse_artwork_new_draft_manual', JSON.stringify({
      version: 1, artwork: { title: 'Unrelated artwork' },
    }))
    await prepare()
    expect(container.textContent).not.toContain('Unrelated artwork')
  })

  const auctions = [
    { house: "Sotheby's", provider: 'sothebys', lot: parsedLot },
    { house: "Christie's", provider: 'christies', lot: christiesLot },
    { house: 'Phillips', provider: 'phillips', lot: phillipsLot },
  ]
  it.each(auctions)('creates a $house artwork with estimates, dimensions, date, contacts and multiple images', async ({ house, provider, lot }) => {
    mocks.fetch.mockResolvedValue(Response.json({ artwork_id: 'new-artwork', document_ids: ['source', ...lot.images.map((_, index) => `image-${index}`)] }))
    await act(async () => root.render(<ImportLabelPage />))
    await click(`Prepare ${house} lot`)
    expect(container.textContent).toContain(`${lot.title} / ${lot.medium} / ${lot.signature ?? ''}`)
    expect(container.textContent).toContain(`${lot.images.length} selected image(s)`)
    await click('Review artwork')
    await click('Save')
    await act(async () => vi.advanceTimersByTimeAsync(450))
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Reviewed portrait', artist_id: 'artist-1', auctions: true,
      medium: lot.medium, signature: lot.signature,
      estimate_low: lot.estimate_low, estimate_high: lot.estimate_high, auction_currency: 'USD',
      height_cm: lot.height_cm, width_cm: lot.width_cm, depth_cm: lot.depth_cm, year_execution: lot.year,
      sale_date: lot.sale_date, sale_time: lot.sale_time, lot: lot.lot, auction_link: lot.source_url,
      proposed_by_id: provider, auction_contact_id: provider,
      location_contact_id: provider, location_address_id: 'new-york',
      notes: lot.notes,
    }))
    expect(mocks.fetch).toHaveBeenCalledWith(`/api/artworks/new-artwork/${provider}-imports`, expect.objectContaining({
      body: JSON.stringify({ url: lot.source_url, images: lot.images.map(image => image.url) }),
    }))
    expect(mocks.push).toHaveBeenCalledWith('/artworks/print/new-artwork')
  })

  it.each(auctions)('retries $house image attachments without creating another artwork', async ({ house, lot }) => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ error: 'Image unavailable' }, { status: 502 }))
      .mockResolvedValue(Response.json({ artwork_id: 'new-artwork', document_ids: ['source', ...lot.images.map((_, index) => `image-${index}`)] }))
    await act(async () => root.render(<ImportLabelPage />))
    await click(`Prepare ${house} lot`)
    await click('Save')
    expect(container.textContent).toContain('Image unavailable')
    expect(mocks.push).not.toHaveBeenCalled()
    await click('Retry document import')
    await act(async () => vi.advanceTimersByTimeAsync(450))
    expect(mocks.insert).toHaveBeenCalledOnce()
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    expect(mocks.push).toHaveBeenCalledWith('/artworks/print/new-artwork')
  })
})
