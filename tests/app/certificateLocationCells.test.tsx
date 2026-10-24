// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CertificateLocationCells, { useCertificateContactOptions } from '@/components/artwork/CertificateLocationCells'
import type { CertificateLocationRow } from '@/lib/certificateLocations'

const mocks = vi.hoisted(() => ({ from: vi.fn(), fetchWithAuth: vi.fn() }))
vi.mock('@/lib/supabaseBrowser', () => ({ supabase: { from: mocks.from } }))
vi.mock('@/lib/fetchWithAuth', () => ({ fetchWithAuth: mocks.fetchWithAuth }))
const contacts = [
  { id: 'office', company_name: 'Office', first_name: null, last_name: null },
  { id: 'client', company_name: 'Client', first_name: null, last_name: null },
]
const address = { id: 'safe', contact_id: 'office', label: 'Safe', address: null, city: 'Geneva', postal_code: null, country: null }
const clientAddress = { ...address, id: 'home', contact_id: 'client', label: 'Home' }
const row: CertificateLocationRow = {
  id: 'work', title: 'Painting', year_execution: null, year_execution_start: null, artist: null,
  certificate: true, certificate_location_contact_id: 'office', certificate_location_address_id: 'safe',
  certificate_contact: contacts[0], certificate_address: address,
}
let container: HTMLDivElement
let root: Root
let contactQuery: ReturnType<typeof query>
let addressQuery: ReturnType<typeof query>
const onSaved = vi.fn()
function query(data: unknown) {
  const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() }
  for (const key of ['select', 'eq', 'order'] as const) chain[key].mockReturnValue(chain)
  chain.range.mockResolvedValue({ data, error: null })
  return chain
}
function Table({ canEdit }: { canEdit: boolean }) {
  const contactOptions = useCertificateContactOptions(canEdit)
  return <table><tbody><tr>
    <CertificateLocationCells row={row} canEdit={canEdit} contactOptions={contactOptions} onSaved={onSaved} />
  </tr></tbody></table>
}
async function render(canEdit = true) {
  await act(async () => root.render(<Table canEdit={canEdit} />))
}
async function click(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(item => item.textContent === label)
  if (!button) throw new Error(`Button not found: ${label}`)
  await act(async () => button.click())
}
async function select(label: string, value: string) {
  const input = container.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!
  await act(async () => {
    input.value = value
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
function response(contactId: string | null, addressId: string | null, certificate = true) {
  return Response.json({ id: 'work', certificate, certificate_location_contact_id: contactId, certificate_location_address_id: addressId })
}

describe('inline certificate location editing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    contactQuery = query(contacts)
    addressQuery = query([address, clientAddress])
    mocks.from.mockImplementation(table => table === 'contacts' ? contactQuery : addressQuery)
    mocks.fetchWithAuth.mockResolvedValue(response('client', 'home'))
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  it('prefills contact and address and queries only the selected contact addresses', async () => {
    await render()
    expect(container.textContent).not.toContain('Edit certificate location')
    expect(container.textContent).not.toContain('Save')
    expect(container.querySelector<HTMLSelectElement>('[aria-label="Certificate contact"]')?.value).toBe('office')
    expect(container.querySelector<HTMLSelectElement>('[aria-label="Certificate address"]')?.value).toBe('safe')
    expect(addressQuery.eq).toHaveBeenCalledWith('contact_id', 'office')
  })
  it('clears the address on contact changes, saves both fields atomically and reports success', async () => {
    await render()
    await select('Certificate contact', 'client')
    expect(container.querySelector<HTMLSelectElement>('[aria-label="Certificate address"]')?.value).toBe('')
    expect(addressQuery.eq).toHaveBeenLastCalledWith('contact_id', 'client')
    await select('Certificate address', 'home')
    await click('Save')
    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/artworks/work', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ certificate_location_contact_id: 'client', certificate_location_address_id: 'home' }),
    }))
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
      certificate_contact: contacts[1], certificate_address: clientAddress,
    }), true)
    expect(container.textContent).toContain('Certificate location saved.')
    expect(container.querySelectorAll('select')).toHaveLength(2)
    expect(container.querySelector('button')).toBeNull()
  })
  it('saves an address-only change without changing the contact', async () => {
    mocks.fetchWithAuth.mockResolvedValue(response('office', null))
    await render()
    await select('Certificate address', '')
    await click('Save')
    expect(JSON.parse(mocks.fetchWithAuth.mock.calls[0][1].body)).toEqual({
      certificate_location_contact_id: 'office', certificate_location_address_id: null,
    })
  })
  it('clears both fields and removes a row that no longer meets the certificate criteria', async () => {
    mocks.fetchWithAuth.mockResolvedValue(response(null, null, false))
    await render()
    await select('Certificate contact', '')
    expect(container.querySelector<HTMLSelectElement>('[aria-label="Certificate address"]')?.disabled).toBe(true)
    await click('Save')
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ certificate_contact: null, certificate_address: null }), false)
  })
  it('cancels without writing or changing displayed values', async () => {
    await render()
    await select('Certificate contact', 'client')
    await click('Cancel')
    expect(mocks.fetchWithAuth).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Office')
    expect(container.textContent).toContain('Safe, Geneva')
    expect(container.querySelector<HTMLSelectElement>('[aria-label="Certificate contact"]')?.value).toBe('office')
  })
  it('keeps edits and displays server failures without reporting success', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.fetchWithAuth.mockResolvedValue(Response.json({ error: 'Certificate address must belong to the selected contact' }, { status: 400 }))
    await render()
    await select('Certificate address', '')
    await click('Save')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Certificate address must belong')
    expect(onSaved).not.toHaveBeenCalled()
    expect(container.querySelector('select')).not.toBeNull()
  })
  it('does not report success when no artwork update is confirmed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.fetchWithAuth.mockResolvedValue(Response.json(null))
    await render()
    await select('Certificate address', '')
    await click('Save')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('not confirmed')
    expect(onSaved).not.toHaveBeenCalled()
  })
  it.each(['contacts', 'contact_addresses'])('blocks saving and surfaces %s loading failures', async table => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const chain = table === 'contacts' ? contactQuery : addressQuery
    chain.range.mockResolvedValue({ data: null, error: { message: 'Permission denied' } })
    await render()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Unable to load')
    await select('Certificate contact', 'client')
    await click('Save')
    expect(mocks.fetchWithAuth).not.toHaveBeenCalled()
  })
  it('blocks repeat saves and Cancel while a save is pending', async () => {
    let resolve!: (value: Response) => void
    mocks.fetchWithAuth.mockReturnValue(new Promise<Response>(done => { resolve = done }))
    await render()
    await select('Certificate address', '')
    await click('Save')
    expect(container.querySelector<HTMLSelectElement>('select')?.disabled).toBe(true)
    const cancel = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Cancel')
    expect(cancel?.disabled).toBe(true)
    await act(async () => resolve(response('office', 'safe')))
    expect(mocks.fetchWithAuth).toHaveBeenCalledTimes(1)
  })
  it('rejects an address that does not belong to the selected contact before writing', async () => {
    await render()
    await select('Certificate address', 'home')
    await click('Save')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Select a valid certificate contact and address')
    expect(mocks.fetchWithAuth).not.toHaveBeenCalled()
  })
  it('ignores old address requests after changing contact', async () => {
    let resolve!: (value: { data: typeof address[]; error: null }) => void
    addressQuery.range.mockReturnValueOnce(new Promise(done => { resolve = done }))
      .mockResolvedValueOnce({ data: [clientAddress], error: null })
    await render()
    await select('Certificate contact', 'client')
    await act(async () => resolve({ data: [address], error: null }))
    const options = Array.from(container.querySelectorAll('[aria-label="Certificate address"] option'))
      .map(option => option.getAttribute('value'))
    expect(options).toEqual(['', 'home'])
  })
  it('offers no editing controls or option queries to Viewers', async () => {
    await render(false)
    expect(container.querySelector('button')).toBeNull()
    expect(container.textContent).toContain('Office')
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
