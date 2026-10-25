// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SortableDocument } from '@/components/SortableDocument'
import type { ArtworkDocument } from '@/app/(protected)/types/artwork'

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({ setNodeRef: vi.fn(), setActivatorNodeRef: vi.fn(), attributes: {}, listeners: {} }),
}))
const clientId = '11111111-1111-4111-8111-111111111111'
const fetchMock = vi.fn()
const saved = vi.fn()
const categorySaved = vi.fn()
const onDelete = vi.fn()
let container: HTMLDivElement
let root: Root
let documentRow: ArtworkDocument

async function render(isEditing = true) {
  await act(async () => root.render(
    <SortableDocument artworkId="work" document={documentRow} isEditing={isEditing}
      clients={[{ id: clientId, label: 'Client A' }]} labelSuggestions={[]}
      onDelete={onDelete} onAccessSaved={saved} onCategorySaved={categorySaved} />
  ))
}

async function select(name: string, value: string) {
  const input = container.querySelector<HTMLSelectElement>(`[aria-label="${name}"]`)!
  await act(async () => {
    input.value = value
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function save() {
  const button = Array.from(container.querySelectorAll('button')).find(item => item.textContent === 'Save visibility')
  if (!button) throw new Error('Visibility save button not found')
  await act(async () => button.click())
}

describe('editing existing document visibility', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    documentRow = {
      id: 'doc', artwork_id: 'work', label: 'Report', document_type: 'link',
      url: '/api/documents/doc/open', visibility: 'all_clients', recipient_contact_id: null,
    }
    fetchMock.mockImplementation(async (_url, options) => Response.json({
      ...documentRow, ...JSON.parse(options.body),
    }))
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

  it('shows All artwork clients for existing documents without changing access on render', async () => {
    await render()
    expect(container.querySelector<HTMLSelectElement>('[aria-label="Report visibility"]')?.value).toBe('all_clients')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain('Save visibility')
  })

  it('groups bordered category and visibility fields on a wrapping row with right-aligned actions', async () => {
    await render()
    const fields = container.querySelector<HTMLDivElement>('.document-edit-fields')!
    expect(fields.style.display).toBe('flex')
    expect(fields.style.flexWrap).toBe('wrap')
    expect(fields.querySelector('[aria-label="Category for Report"]')?.classList.contains('document-edit-select')).toBe(true)
    expect(fields.querySelector('[aria-label="Report visibility"]')?.classList.contains('document-edit-select')).toBe(true)
    const actions = container.querySelector<HTMLDivElement>('[aria-label="Document actions"]')!
    expect(actions.parentElement).toBe(fields.parentElement)
    for (const select of fields.querySelectorAll('select')) {
      expect(select.style.border).toBe('1px solid rgb(200, 206, 202)')
      expect(select.style.backgroundColor).toBe('rgb(255, 255, 255)')
    }
    expect(actions.style.display).toBe('flex')
    expect(actions.style.marginLeft).toBe('auto')
    expect(actions.style.justifyContent).toBe('flex-end')
    expect(actions.querySelectorAll('button')).toHaveLength(2)
    expect(actions.querySelector('[aria-label="Reorder Report"]')).not.toBeNull()
    const remove = actions.querySelector<HTMLButtonElement>('[aria-label="Delete Report"]')!
    expect(remove.classList.contains('edit-button-danger')).toBe(true)
    expect(remove.type).toBe('button')
    await act(async () => remove.click())
    expect(onDelete).toHaveBeenCalledWith('doc')
  })

  it('saves category changes without altering visibility or labels', async () => {
    await render()
    await select('Category for Report', 'images')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ link_category: 'images' })
    expect(categorySaved).toHaveBeenCalledWith('doc', 'images')
    expect(saved).not.toHaveBeenCalled()
  })

  it('shows category failures without reporting a successful move', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'Write failed' }, { status: 400 }))
    await render()
    await select('Category for Report', 'images')
    expect(categorySaved).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Write failed')
    expect(container.querySelector<HTMLSelectElement>('[aria-label="Category for Report"]')?.value).toBe('general')
  })

  it('requires a client and saves both access fields without changing the label', async () => {
    await render()
    await select('Report visibility', 'selected_client')
    await save()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Select a client')
    expect(fetchMock).not.toHaveBeenCalled()
    await select('Report client', clientId)
    await save()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      visibility: 'selected_client', recipient_contact_id: clientId,
    })
    expect(saved).toHaveBeenCalledWith('doc', { visibility: 'selected_client', recipient_contact_id: clientId })
  })

  it('clears a previous recipient when switching to internal or shared visibility', async () => {
    documentRow = { ...documentRow, visibility: 'selected_client', recipient_contact_id: clientId }
    await render()
    await select('Report visibility', 'internal')
    await save()
    expect(saved).toHaveBeenCalledWith('doc', { visibility: 'internal', recipient_contact_id: null })
    expect(container.querySelector('[aria-label="Report client"]')).toBeNull()
  })

  it.each([
    ['server error', () => Response.json({ error: 'Access validation failed' }, { status: 400 }), 'Access validation failed'],
    ['unconfirmed change', () => Response.json({ ...documentRow, visibility: 'all_clients' }), 'not confirmed'],
  ])('surfaces %s without reporting success', async (_name, response, message) => {
    fetchMock.mockImplementationOnce(async () => response())
    await render()
    await select('Report visibility', 'internal')
    await save()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(message)
    expect(saved).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })

  it('keeps previously selected clients visible without widening access', async () => {
    documentRow = { ...documentRow, visibility: 'selected_client', recipient_contact_id: '22222222-2222-4222-8222-222222222222' }
    await render()
    expect(container.querySelector<HTMLSelectElement>('[aria-label="Report client"]')?.value).toBe(documentRow.recipient_contact_id)
    expect(container.textContent).toContain('Previously selected client')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not expose edit controls in read-only mode', async () => {
    documentRow = { ...documentRow, visibility: 'internal' }
    await render(false)
    expect(container.querySelector('select')).toBeNull()
    expect(container.textContent).toContain('Internal only')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
