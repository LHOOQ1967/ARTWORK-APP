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
    <ArtworkDocumentUploader artworkId="work-1" disabled={disabled} labelSuggestionsId="document-labels"
      clients={[{ id: clientA, label: 'Client A' }, { id: clientB, label: 'Client B' }]}
      onUploaded={onUploaded} onBusyChange={onBusyChange} />
  ))
}

async function selectFiles(files: File[]) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
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
}

async function label(name: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`[aria-label="Label for ${name}"]`)!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function select(name: string, value: string) {
  const input = container.querySelector<HTMLSelectElement>(`[aria-label="${name}"]`)!
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
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock.mockImplementation(async () => success(`doc-${fetchMock.mock.calls.length}`))
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

  it('selects multiple files, appends later selections and uses editable filename labels', async () => {
    await render()
    expect(container.querySelector<HTMLInputElement>('input[type="file"]')?.multiple).toBe(true)
    await selectFiles([file('Certificate.pdf'), file('Invoice.pdf')])
    await selectFiles([file('Report.pdf')])
    expect(container.querySelector('[aria-label="Label for Report.pdf"]')?.getAttribute('list')).toBe('document-labels')
    await label('Certificate.pdf', '  Original certificate  ')
    await label('Invoice.pdf', '   ')
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

  it('places batch category and visibility together below the file drop zone', async () => {
    await render()
    const dropZone = container.querySelector('input[type="file"]')!.parentElement!
    const category = container.querySelector('[aria-label="Upload batch category"]')!
    const visibility = container.querySelector('[aria-label="Upload batch visibility"]')!
    const row = category.parentElement!.parentElement!
    expect(row.contains(visibility)).toBe(true)
    expect(row.style.display).toBe('flex')
    expect(row.style.flexWrap).toBe('wrap')
    expect(dropZone.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('accepts all dropped files and ignores drops while disabled', async () => {
    await render()
    const drop = async (files: File[]) => {
      const target = container.querySelector('input[type="file"]')!.closest('label')!
      await act(async () => {
        const event = new Event('drop', { bubbles: true, cancelable: true })
        Object.defineProperty(event, 'dataTransfer', { value: { files } })
        target.dispatchEvent(event)
      })
    }
    await drop([file('One.pdf'), file('Two.pdf')])
    expect(container.querySelectorAll('li')).toHaveLength(2)
    await render(true)
    await drop([file('Ignored.pdf')])
    expect(container.querySelectorAll('li')).toHaveLength(2)
    expect(button('Upload files').disabled).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
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

  it('applies batch visibility and allows per-file client overrides', async () => {
    await render()
    await select('Upload batch visibility', 'selected_client')
    await select('Upload batch client', clientA)
    await selectFiles([file('One.pdf'), file('Two.pdf')])
    await select('Two.pdf client', clientB)
    await click('Upload files')
    const forms = fetchMock.mock.calls.map(([, options]) => options.body as FormData)
    expect(forms.map(form => form.get('visibility'))).toEqual(['selected_client', 'selected_client'])
    expect(forms.map(form => form.get('recipient_contact_id'))).toEqual([clientA, clientB])
  })

  it('applies batch categories, per-file overrides and later selections without changing access', async () => {
    await render()
    await selectFiles([file('First.pdf'), file('Second.jpg')])
    await select('Upload batch category', 'exhibitions_literature')
    await select('Category for Second.jpg', 'images')
    await selectFiles([file('Third.pdf')])
    await click('Upload files')
    const forms = fetchMock.mock.calls.map(([, options]) => options.body as FormData)
    expect(forms.map(form => form.get('link_category'))).toEqual([
      'exhibitions_literature', 'images', 'exhibitions_literature',
    ])
    expect(forms.every(form => form.get('visibility') === 'all_clients')).toBe(true)
  })

  it('requires a recipient before uploading selected-client files', async () => {
    await render()
    await selectFiles([file('One.pdf')])
    await select('One.pdf visibility', 'selected_client')
    await click('Upload files')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Select a client')
    await select('One.pdf client', clientA)
    await click('Upload files')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('changes visibility for remaining files without altering confirmed uploads', async () => {
    fetchMock.mockResolvedValueOnce(success('first'))
      .mockResolvedValueOnce(Response.json({ error: 'Unavailable' }, { status: 502 }))
    await render()
    await selectFiles([file('One.pdf'), file('Two.pdf')])
    await click('Upload files')
    await select('Upload batch visibility', 'internal')
    await click('Upload / retry remaining files')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect((fetchMock.mock.calls[2][1].body as FormData).get('visibility')).toBe('internal')
    expect(container.querySelector<HTMLSelectElement>('[aria-label="One.pdf visibility"]')?.value).toBe('all_clients')
  })
})
