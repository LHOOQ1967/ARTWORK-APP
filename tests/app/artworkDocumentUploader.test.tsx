// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ArtworkDocumentUploader from '@/components/artwork/ArtworkDocumentUploader'

let container: HTMLDivElement
let root: Root
const fetchMock = vi.fn()
const onUploaded = vi.fn()
const onBusyChange = vi.fn()
const clientA = '11111111-1111-4111-8111-111111111111'
const clientB = '22222222-2222-4222-8222-222222222222'
const suggestions = ['Fiche Blondeau', 'Facture', 'Facture Commission', 'Certificat', 'Condition Report Héritier', 'Résultat ventes', 'Dossier One Drive']

function file(name: string, size?: number) {
  const result = new File(['document'], name, { type: 'application/pdf' })
  if (size !== undefined) Object.defineProperty(result, 'size', { value: size })
  return result
}

function success(id = 'doc-1') {
  return Response.json({
    id, artwork_id: 'work-1', document_type: 'link',
    url: `/api/documents/${id}/open`, label: 'Document',
  })
}

async function render(disabled = false) {
  await act(async () => root.render(
    <ArtworkDocumentUploader artworkId="work-1" disabled={disabled} labelSuggestions={suggestions}
      clients={[{ id: clientA, label: 'Client A' }, { id: clientB, label: 'Client B' }]}
      onUploaded={onUploaded} onBusyChange={onBusyChange} />
  ))
}

async function selectFiles(files: File[], category = 'General') {
  const input = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'))
    .find(element => element.getAttribute('aria-label') === `Select ${category} documents`)!
  await act(async () => {
    Object.defineProperty(input, 'files', { configurable: true, value: files })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function button(text: string) {
  const result = Array.from(container.querySelectorAll('button')).find(item => item.textContent === text)
  if (!result) throw new Error(`Button not found: ${text}`)
  return result
}

async function click(text: string) {
  await act(async () => button(text).click())
  if ((text === 'Upload files' || text === 'Upload / retry remaining files') && container.querySelector('[role="alertdialog"]')) {
    await act(async () => button('Use filenames').click())
  }
}

async function label(name: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`[aria-label="Label for ${name}"]`)!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function select(name: string, value: string) {
  const input = Array.from(container.querySelectorAll<HTMLSelectElement>('select'))
    .find(element => element.getAttribute('aria-label') === name)!
  await act(async () => {
    input.value = value
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('multiple artwork document uploads', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true, value: function (this: HTMLDialogElement) { this.open = true },
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock.mockImplementation(async () => success(`doc-${fetchMock.mock.calls.length}`))
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('starts each label empty, including later selections, and saves entered labels', async () => {
    await render()
    expect(container.querySelector<HTMLInputElement>('input[type="file"]')?.multiple).toBe(true)
    await selectFiles([file('Certificate.pdf'), file('Invoice.pdf')])
    await selectFiles([file('Report.pdf')])
    const fileLabel = container.querySelector('li strong')!
    expect(fileLabel.textContent).toBe('File:')
    expect(fileLabel.parentElement?.textContent).toBe('File: Certificate.pdf')
    expect(container.textContent).not.toContain('Ready')
    for (const name of ['Certificate.pdf', 'Invoice.pdf', 'Report.pdf']) {
      expect(container.querySelector<HTMLInputElement>(`[aria-label="Label for ${name}"]`)?.value).toBe('')
    }
    const labelInput = container.querySelector<HTMLInputElement>('[aria-label="Label for Report.pdf"]')!
    expect(labelInput.placeholder).toBe('Select a label or name the document')
    expect(labelInput.style.backgroundColor).toBe('white')
    expect(labelInput.style.border).toBe('1px solid rgb(204, 204, 204)')
    await label('Certificate.pdf', '  Original certificate  ')
    await label('Invoice.pdf', '   ')
    expect(button('Upload files').style.zoom).toBe('1.3')
    await click('Upload files')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(
      Array(3).fill('/api/artworks/work-1/sharepoint-documents')
    )
    const forms = fetchMock.mock.calls.map(([, options]) => {
      expect(options.method).toBe('POST')
      expect(options.credentials).toBe('include')
      return options.body as FormData
    })

    expect(forms.map(form => form.get('label'))).toEqual(['Original certificate', 'Invoice.pdf', 'Report.pdf'])
    expect(forms.map(form => form.get('visibility'))).toEqual(['all_clients', 'all_clients', 'all_clients'])
    expect(forms.every(form => !form.has('recipient_contact_id'))).toBe(true)
    expect(forms.map(form => (form.get('file') as File).name)).toEqual(['Certificate.pdf', 'Invoice.pdf', 'Report.pdf'])
    expect(onUploaded).toHaveBeenCalledTimes(3)
    expect(container.querySelector('[role="status"]')?.textContent).toContain('3 of 3 files uploaded.')
    expect(onBusyChange.mock.calls).toEqual([[true], [false]])
    expect(button('Upload files').disabled).toBe(true)
  })

  it('blocks empty labels until the user returns or confirms filenames', async () => {
    await render()
    await selectFiles([file('Named.pdf'), file('Empty.pdf'), file('Whitespace.pdf')])
    await label('Named.pdf', 'My document')
    await label('Whitespace.pdf', '   ')
    await act(async () => button('Upload files').click())
    expect(container.querySelector<HTMLDialogElement>('[role="alertdialog"]')?.open).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onBusyChange).not.toHaveBeenCalled()
    await act(async () => button('Return to labels').click())
    expect(container.querySelector('[role="alertdialog"]')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    await label('Empty.pdf', 'Another document')
    await act(async () => button('Upload files').click())
    expect(fetchMock).not.toHaveBeenCalled()
    await act(async () => button('Use filenames').click())
    const forms = fetchMock.mock.calls.map(([, options]) => options.body as FormData)
    expect(forms.map(form => form.get('label'))).toEqual(['My document', 'Another document', 'Whitespace.pdf'])
    expect(container.querySelector<HTMLInputElement>('[aria-label="Label for Whitespace.pdf"]')?.value).toBe('Whitespace.pdf')
  })

  it('uploads directly when every label is provided', async () => {
    await render()
    await selectFiles([file('One.pdf')])
    await label('One.pdf', 'Artwork')
    await act(async () => button('Upload files').click())
    expect(container.querySelector('[role="alertdialog"]')).toBeNull()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('shows all compact suggestions and supports filtering, keyboard selection and free text', async () => {
    await render()
    await selectFiles([file('One.pdf'), file('Two.pdf')])
    const input = container.querySelector<HTMLInputElement>('[aria-label="Label for One.pdf"]')!
    const otherInput = container.querySelector<HTMLInputElement>('[aria-label="Label for Two.pdf"]')!
    await act(async () => input.focus())
    const options = container.querySelectorAll<HTMLElement>('[role="option"]')
    expect(Array.from(options, option => option.textContent)).toEqual(suggestions)
    expect(options[0].style.padding).toBe('4px 8px')
    expect(input.getAttribute('aria-expanded')).toBe('true')

    await label('One.pdf', 'facture')
    expect(Array.from(container.querySelectorAll('[role="option"]'), option => option.textContent)).toEqual(['Facture', 'Facture Commission'])
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
    expect(input.getAttribute('aria-activedescendant')).toBe(container.querySelector('[role="option"]')!.id)
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
    expect(input.value).toBe('Facture')
    expect(otherInput.value).toBe('')
    expect(container.querySelector('[role="listbox"]')).toBeNull()

    await act(async () => input.click())
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(suggestions.length)
    await act(async () => container.querySelectorAll<HTMLElement>('[role="option"]')[2].click())
    expect(input.value).toBe('Facture Commission')
    await act(async () => input.click())
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(container.querySelector('[role="listbox"]')).toBeNull()
    expect(input.value).toBe('Facture Commission')
    await label('One.pdf', 'Custom label')
    expect(container.querySelector('[role="listbox"]')).toBeNull()
    expect(input.value).toBe('Custom label')
  })

  it('hides the native file control while keeping the drop zone clickable and keyboard-focusable', async () => {
    await render()
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
    const dropZone = input.closest('label')!
    const click = vi.fn()
    input.addEventListener('click', click)
    expect(input.style.clip).toBe('rect(0px, 0px, 0px, 0px)')
    expect(input.hidden).toBe(false)
    await act(async () => dropZone.click())
    expect(click).toHaveBeenCalledOnce()
    input.focus()
    expect(document.activeElement).toBe(input)
  })

  it('shows three category zones with separate visibility selectors', async () => {
    await render()
    for (const category of ['General', 'Images', 'Exhibitions & Literature']) {
      const zone = Array.from(container.querySelectorAll('section'))
        .find(element => element.getAttribute('aria-label') === `${category} documents`)!
      const visibility = Array.from(zone.querySelectorAll('select'))
        .find(element => element.getAttribute('aria-label') === `${category} visibility`)!
      const dropZone = zone.querySelector('input[type="file"]')!.parentElement!
      expect(zone.querySelector('h5')?.style.fontSize).toBe('1.14rem')
      if (category === 'General') {
        expect(zone.querySelector('h5 span')?.textContent).toBe(` (${suggestions.filter(label => label !== 'Fiche Blondeau').join(', ')}, etc.)`)
        expect(zone.querySelector<HTMLSpanElement>('h5 span')?.style.fontWeight).toBe('400')
        expect(zone.querySelector<HTMLSpanElement>('h5 span')?.style.fontSize).toBe('0.8em')
      } else {
        expect(zone.querySelector('h5 span')).toBeNull()
      }
      expect(visibility.compareDocumentPosition(dropZone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(3)
    expect(container.querySelector('[aria-label="Upload batch category"]')).toBeNull()
    expect(container.textContent).not.toContain('Batch category and visibility apply')
    expect(container.textContent).not.toContain('Maximum 100 MB per file')
    expect(container.textContent).not.toContain('Files are saved to SharePoint immediately')
  })

  it('accepts all dropped files and ignores drops while disabled', async () => {
    await render()
    const drop = async (files: File[], category = 'General') => {
      const input = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'))
        .find(element => element.getAttribute('aria-label') === `Select ${category} documents`)!
      const target = input.closest('label')!
      await act(async () => {
        const event = new Event('drop', { bubbles: true, cancelable: true })
        Object.defineProperty(event, 'dataTransfer', { value: { files } })
        target.dispatchEvent(event)
      })
    }
    await drop([file('One.pdf'), file('Two.pdf')])
    await drop([file('Picture.jpg')], 'Images')
    expect(container.querySelectorAll('li')).toHaveLength(3)
    await render(true)
    await drop([file('Ignored.pdf')])
    expect(container.querySelectorAll('li')).toHaveLength(3)
    expect(button('Upload files').disabled).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    await render()
    await click('Upload files')
    const forms = fetchMock.mock.calls.map(([, options]) => options.body as FormData)
    expect(forms.map(form => form.get('link_category'))).toEqual(['general', 'general', 'images'])
  })

  it('captures file selections before the picker is reset', async () => {
    await render()
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
    await act(async () => {
      for (const name of ['First.pdf', 'Second.pdf']) {
        const files = [file(name)]
        Object.defineProperty(input, 'files', { configurable: true, value: files })
        input.dispatchEvent(new Event('change', { bubbles: true }))
        files.length = 0
      }
    })
    expect(container.querySelectorAll('li')).toHaveLength(2)
    await click('Upload files')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('uploads sequentially, reports progress and prevents changes or duplicate starts while busy', async () => {
    let resolveFirst!: (value: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { resolveFirst = resolve }))
    await render()
    await selectFiles([file('One.pdf'), file('Two.pdf')])
    await click('Upload files')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(button('Uploading...').disabled).toBe(true)
    expect(button('Clear list').disabled).toBe(true)
    expect(container.querySelector<HTMLInputElement>('input[type="file"]')?.disabled).toBe(true)
    expect(container.querySelector('[role="status"]')?.textContent).toContain('0 of 2 files uploaded.')
    expect(container.textContent).toContain('Upload in progress.')
    await selectFiles([file('Ignored.pdf')])
    expect(container.querySelectorAll('li')).toHaveLength(2)
    await act(async () => resolveFirst(success()))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[role="status"]')?.textContent).toContain('2 of 2 files uploaded.')
  })

  it('keeps successful files, continues after a failure and retries only failures with their labels', async () => {
    fetchMock.mockResolvedValueOnce(success('first'))
      .mockResolvedValueOnce(Response.json({ error: 'SharePoint upload failed' }, { status: 502 }))
      .mockResolvedValueOnce(success('third'))
    await render()
    await selectFiles([file('One.pdf'), file('Two.pdf'), file('Three.pdf')])
    await label('Two.pdf', 'Second document')
    await click('Upload files')
    expect(onUploaded).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('SharePoint upload failed')
    expect(container.querySelector('[role="status"]')?.textContent).toContain('2 of 3 files uploaded. 1 failed.')
    await click('Upload / retry remaining files')
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect((fetchMock.mock.calls[3][1].body as FormData).get('label')).toBe('Second document')
    expect(onUploaded).toHaveBeenCalledTimes(3)
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.querySelector('[role="status"]')?.textContent).toContain('3 of 3 files uploaded.')
  })

  it('rejects empty and oversized files but accepts the exact 100 MB boundary', async () => {
    await render()
    await selectFiles([
      file('Empty.pdf', 0),
      file('Oversized.pdf', 100 * 1024 * 1024 + 1),
      file('Boundary.pdf', 100 * 1024 * 1024),
    ])
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(2)
    expect(container.textContent).toContain('This file is empty.')
    expect(container.textContent).toContain('File too large. Maximum size: 100 MB.')
    await click('Upload / retry remaining files')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((fetchMock.mock.calls[0][1].body as FormData).get('label')).toBe('Boundary.pdf')
    expect(button('Upload / retry remaining files').disabled).toBe(true)
  })

  it.each([
    ['network error', () => Promise.reject(new Error('Network unavailable')), 'Network unavailable'],
    ['non-JSON error', () => Promise.resolve(new Response('Gateway failure', { status: 413 })), 'HTTP 413'],
    ['unconfirmed response', () => Promise.resolve(Response.json(null)), 'not confirmed'],
    ['wrong artwork response', () => Promise.resolve(Response.json({
      id: 'wrong', artwork_id: 'other', document_type: 'link', url: '/document',
    })), 'not confirmed'],
  ])('surfaces a %s without reporting success and unlocks the controls', async (_name, response, message) => {
    fetchMock.mockImplementationOnce(response)
    await render()
    await selectFiles([file('Report.pdf')])
    await click('Upload files')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(message)
    expect(onUploaded).not.toHaveBeenCalled()
    expect(onBusyChange.mock.calls).toEqual([[true], [false]])
    expect(button('Upload / retry remaining files').disabled).toBe(false)
    expect(console.error).toHaveBeenCalled()
  })

  it('removes pending files, clears the list without deleting uploads and accepts another batch', async () => {
    await render()
    await selectFiles([file('Remove.pdf'), file('Keep.pdf')])
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Remove Remove.pdf"]')!.click())
    await click('Upload files')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await click('Clear list')
    expect(container.querySelector('li')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(onUploaded).toHaveBeenCalledTimes(1)
    await selectFiles([file('Next.pdf')])
    await click('Upload files')
    expect(onUploaded).toHaveBeenCalledTimes(2)
  })

  it('warns on leaving with unfinished files and removes the warning after successful uploads', async () => {
    await render()
    await selectFiles([file('Report.pdf')])
    const before = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(before)
    expect(before.defaultPrevented).toBe(true)
    await click('Upload files')
    const after = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
  })

  it('uses each zone category and visibility for its files with one upload action', async () => {
    await render()
    await select('General visibility', 'selected_client')
    await select('General client', clientA)
    await select('Images visibility', 'internal')
    await select('Exhibitions & Literature visibility', 'selected_client')
    await select('Exhibitions & Literature client', clientB)
    await selectFiles([file('One.pdf')])
    await selectFiles([file('Two.jpg')], 'Images')
    await selectFiles([file('Three.pdf')], 'Exhibitions & Literature')
    expect(container.querySelector('[aria-label="One.pdf visibility"]')).toBeNull()
    expect(container.querySelector('[aria-label="Category for Two.jpg"]')).toBeNull()
    expect(Array.from(container.querySelectorAll('button')).filter(item => item.textContent === 'Upload files')).toHaveLength(1)
    await click('Upload files')
    const forms = fetchMock.mock.calls.map(([, options]) => options.body as FormData)
    expect(forms.map(form => form.get('link_category'))).toEqual(['general', 'images', 'exhibitions_literature'])
    expect(forms.map(form => form.get('visibility'))).toEqual(['selected_client', 'internal', 'selected_client'])
    expect(forms.map(form => form.get('recipient_contact_id'))).toEqual([clientA, null, clientB])
  })

  it('applies changed zone visibility to its pending and later files only', async () => {
    await render()
    await selectFiles([file('First.pdf')])
    await selectFiles([file('Second.jpg')], 'Images')
    await select('General visibility', 'internal')
    await selectFiles([file('Third.pdf')])
    await click('Upload files')
    const forms = fetchMock.mock.calls.map(([, options]) => options.body as FormData)
    expect(forms.map(form => form.get('visibility'))).toEqual(['internal', 'all_clients', 'internal'])
  })

  it('requires a recipient before uploading selected-client files', async () => {
    await render()
    await selectFiles([file('One.pdf')])
    await select('General visibility', 'selected_client')
    await click('Upload files')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Select a client')
    await select('General client', clientA)
    await click('Upload files')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('changes visibility for remaining files without altering confirmed uploads', async () => {
    fetchMock.mockResolvedValueOnce(success('first'))
      .mockResolvedValueOnce(Response.json({ error: 'Unavailable' }, { status: 502 }))
    await render()
    await selectFiles([file('One.pdf'), file('Two.pdf')])
    await click('Upload files')
    await select('General visibility', 'internal')
    await click('Upload / retry remaining files')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect((fetchMock.mock.calls[2][1].body as FormData).get('visibility')).toBe('internal')
    expect((fetchMock.mock.calls[0][1].body as FormData).get('visibility')).toBe('all_clients')
  })
})
