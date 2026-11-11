// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BlondeauSheetImporter from '@/components/artwork/BlondeauSheetImporter'

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  fetch: vi.fn(),
  onImported: vi.fn(),
  onBusyChange: vi.fn(),
  onPrepared: vi.fn(),
}))

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: mocks.getDocument,
}))

let container: HTMLDivElement
let root: Root
const contextDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')!
const dataUrlDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toDataURL')!

function pdfFile() {
  const file = new File(['%PDF-1.7'], 'factsheet.pdf', { type: 'application/pdf' })
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(8) })
  return file
}

async function render(disabled = false) {
  await act(async () => root.render(
    <BlondeauSheetImporter
      artwork={{ id: 'work', title: 'Portrait', medium: 'Oil on canvas', year_execution: 1912 }}
      disabled={disabled}
      onImported={mocks.onImported}
      onBusyChange={mocks.onBusyChange}
    />
  ))
}

async function drop(files: File[]) {
  const event = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: { files } })
  await act(async () => {
    container.querySelector('section')!.dispatchEvent(event)
  })
  expect(event.defaultPrevented).toBe(true)
}

describe('Blondeau factsheet importer interface', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('fetch', mocks.fetch)
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => ({
        drawImage: vi.fn(),
        getImageData: () => ({ data: new Uint8ClampedArray(100 * 100 * 4).fill(255) }),
      }),
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
      configurable: true,
      value: () => 'data:image/jpeg;base64,preview',
    })
    mocks.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getViewport: () => ({ width: 100, height: 100 }),
          render: () => ({ promise: Promise.resolve() }),
          getTextContent: async () => ({
            items: ['Title: Portrait', 'Medium: Oil on canvas', 'Date: 1912', 'Dimensions: 40 x 30 x 2 cm']
              .map(str => ({ str, hasEOL: true })),
          }),
        }),
      }),
    })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', contextDescriptor)
    Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', dataUrlDescriptor)
    vi.unstubAllGlobals()
  })

  it('shows the centered bold heading and requested instruction', async () => {
    await render()
    const heading = container.querySelector('h4')!
    expect(heading.textContent).toBe('Import Blondeau factsheet')
    expect(heading.style.textAlign).toBe('center')
    expect(heading.style.fontWeight).toBe('bold')
    expect(container.textContent).toContain('Select or move a factsheet to compare its details.')
    expect(container.querySelector<HTMLInputElement>('input[type="file"]')!.hidden).toBe(true)
    expect(container.textContent).not.toContain('Select PDF')
  })

  it('loads a dropped PDF without importing and styles every comparison field', async () => {
    await render()
    await drop([pdfFile()])
    expect(mocks.getDocument).toHaveBeenCalledTimes(1)
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.onImported).not.toHaveBeenCalled()
    expect(container.textContent).toContain('PDF: factsheet.pdf')
    expect(container.querySelector('p strong')?.textContent).not.toBe('PDF:')
    expect(container.querySelector('details')).toBeNull()
    for (const legend of container.querySelectorAll('legend')) {
      expect(legend.style.textAlign).toBe(legend.textContent === 'Artwork image' ? 'center' : 'left')
      expect(legend.style.fontWeight).toBe('bold')
    }
    expect(container.textContent?.match(/Current ArtMuse:/g)).toHaveLength(6)
    expect(container.textContent?.match(/Detected in factsheet/g)).toHaveLength(6)
    expect(container.querySelectorAll('fieldset p em')).toHaveLength(8)
    for (const input of container.querySelectorAll<HTMLInputElement>('input[type="text"]')) {
      expect(input.parentElement!.style.display).toBe('flex')
      expect(input.parentElement!.querySelector('span')!.textContent).toBe('Detected in factsheet:')
      expect(input.style.fontStyle).toBe('italic')
    }
    expect(container.querySelectorAll('p[role="status"] strong')).toHaveLength(3)
    const signature = Array.from(container.querySelectorAll('fieldset'))
      .find(field => field.querySelector('legend')?.textContent === 'Signature')!
    expect(signature.textContent).toContain('No value detected.')
    expect(signature.querySelector('input')!.style.border).toBe('1px solid rgb(204, 204, 204)')
  })

  it('keeps PDF selection available as an alternative to dropping', async () => {
    await render()
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
    const click = vi.spyOn(input, 'click')
    await act(async () => {
      container.querySelector('button')!.click()
    })
    expect(click).toHaveBeenCalledOnce()
    click.mockRestore()
    Object.defineProperty(input, 'files', { value: [pdfFile()] })
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
    expect(mocks.getDocument).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('PDF: factsheet.pdf')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('still imports a PDF into an existing artwork', async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({
      documents: [{ id: 'pdf-doc', artwork_id: 'work', document_type: 'link', url: '/pdf' }],
    }))
    await render()
    await drop([pdfFile()])
    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find(button => button.textContent === 'Import PDF and selected changes')!.click()
    })
    expect(mocks.fetch).toHaveBeenCalledWith('/api/artworks/work/blondeau-imports', expect.objectContaining({ method: 'POST' }))
    expect(mocks.onImported).toHaveBeenCalledWith({}, [
      { id: 'pdf-doc', artwork_id: 'work', document_type: 'link', url: '/pdf' },
    ])
    expect(container.textContent).toContain('The Blondeau sheet was imported.')
  })

  it('rejects multiple dropped files explicitly', async () => {
    await render()
    await drop([pdfFile(), pdfFile()])
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Drop one PDF factsheet at a time.')
    expect(mocks.getDocument).not.toHaveBeenCalled()
  })

  it('validates dropped file types using the same PDF validation', async () => {
    await render()
    await drop([new File(['text'], 'notes.txt', { type: 'text/plain' })])
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Select a PDF file.')
    expect(mocks.getDocument).not.toHaveBeenCalled()
  })

  it('does not load dropped files when disabled', async () => {
    await render(true)
    await drop([pdfFile()])
    expect(mocks.getDocument).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLInputElement>('input[type="file"]')!.disabled).toBe(true)
  })

  it('prepares a new artwork with detected fields selected without uploading', async () => {
    await act(async () => root.render(
      <BlondeauSheetImporter onBusyChange={mocks.onBusyChange} onPrepared={mocks.onPrepared} />
    ))
    expect(container.querySelector('h4')).toBeNull()
    const instruction = container.querySelector('button')!
    expect(instruction.textContent).toBe('Select or move a factsheet to create a new artwork.')
    expect(instruction.style.textAlign).toBe('center')
    expect(instruction.style.width).toBe('100%')
    expect(container.querySelector('section')!.getAttribute('aria-labelledby')).toBe(instruction.id)
    const pdf = pdfFile()
    await drop([pdf])
    expect(container.textContent).not.toContain('Current ArtMuse:')
    const checkboxes = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
    expect(checkboxes.filter(input => input.checked)).toHaveLength(4)
    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find(button => button.textContent === 'Continue to artwork creation')!.click()
    })
    expect(mocks.onPrepared).toHaveBeenCalledWith({
      pdf,
      image: null,
      fields: {
        title: 'Portrait',
        medium: 'Oil on canvas',
        year_execution: 1912,
        year_execution_start: null,
        height_cm: 40,
        width_cm: 30,
        depth_cm: 2,
      },
    })
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('omits deselected values when preparing a new artwork', async () => {
    await act(async () => root.render(
      <BlondeauSheetImporter onBusyChange={mocks.onBusyChange} onPrepared={mocks.onPrepared} />
    ))
    await drop([pdfFile()])
    await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find(button => button.textContent === 'Continue to artwork creation')!.click()
    })
    expect(mocks.onPrepared.mock.calls[0][0].fields).not.toHaveProperty('title')
  })
})
