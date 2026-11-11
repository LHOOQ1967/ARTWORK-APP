'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import type { ArtworkDocument, ArtworkWithRelations } from '@/app/(protected)/types/artwork'
import type { ArtworkImageCrop, BlondeauSheetFields } from '@/lib/blondeauSheet'
import { findArtworkImageBounds, parseBlondeauSheetText } from '@/lib/blondeauSheet'
import { importBlondeauSheet, type BlondeauSheetDraft } from '@/lib/imports/importBlondeauSheet'

type ImportableField = 'title' | 'medium' | 'signature' | 'edition'
type CropRect = ArtworkImageCrop
type PagePreview = { page: number; imageUrl: string; width: number; height: number; suggestedCrop: CropRect | null }

const MAX_FILE_SIZE = 100 * 1024 * 1024
const MAX_PAGES = 20
const MAX_TOTAL_PIXELS = 80_000_000
const FIELDS: Array<{ key: ImportableField; label: string }> = [
  { key: 'title', label: 'Title' },
  { key: 'medium', label: 'Medium' },
  { key: 'signature', label: 'Signature' },
  { key: 'edition', label: 'Edition' },
]

function asYear(value: string) {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1000 && parsed <= 2100 ? parsed : undefined
}

function displayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return 'Not set'
  return String(value)
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function detectArtworkCrop(canvas: HTMLCanvasElement): CropRect | null {
  const sample = document.createElement('canvas')
  const scale = Math.min(1, 600 / canvas.width, 900 / canvas.height)
  sample.width = Math.max(1, Math.round(canvas.width * scale))
  sample.height = Math.max(1, Math.round(canvas.height * scale))
  const context = sample.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(canvas, 0, 0, sample.width, sample.height)
  const pixels = context.getImageData(0, 0, sample.width, sample.height).data
  const bounds = findArtworkImageBounds(sample.width, sample.height, pixels)
  if (!bounds) return null
  return {
    x: Math.floor(bounds.x / scale),
    y: Math.floor(bounds.y / scale),
    width: Math.min(canvas.width - Math.floor(bounds.x / scale), Math.ceil(bounds.width / scale)),
    height: Math.min(canvas.height - Math.floor(bounds.y / scale), Math.ceil(bounds.height / scale)),
  }
}

function cropCanvas(canvas: HTMLCanvasElement, rect: CropRect) {
  const crop = document.createElement('canvas')
  crop.width = Math.round(rect.width)
  crop.height = Math.round(rect.height)
  const context = crop.getContext('2d')
  if (!context) return Promise.resolve<Blob | null>(null)
  context.drawImage(canvas, rect.x, rect.y, rect.width, rect.height, 0, 0, crop.width, crop.height)
  return new Promise<Blob | null>(resolve => crop.toBlob(resolve, 'image/png'))
}

type BlondeauSheetImporterProps = {
  disabled?: boolean
  onBusyChange: (busy: boolean) => void
} & ({
  artwork: ArtworkWithRelations
  onImported: (fields: Partial<BlondeauSheetFields>, documents: ArtworkDocument[]) => void
  onPrepared?: never
} | {
  artwork?: never
  onImported?: never
  onPrepared: (draft: BlondeauSheetDraft) => void
})

export default function BlondeauSheetImporter({
  artwork,
  disabled = false,
  onBusyChange,
  onImported,
  onPrepared,
}: BlondeauSheetImporterProps) {
  const [file, setFile] = useState<File | null>(null)
  const [fields, setFields] = useState<BlondeauSheetFields>({
    title: null,
    medium: null,
    signature: null,
    edition: null,
    year_execution: null,
    year_execution_start: null,
    height_cm: null,
    width_cm: null,
    depth_cm: null,
  })
  const [dragging, setDragging] = useState(false)
  const [pages, setPages] = useState<PagePreview[]>([])
  const [selectedFields, setSelectedFields] = useState<Partial<Record<ImportableField | 'dates' | 'dimensions', boolean>>>({})
  const [importImage, setImportImage] = useState(false)
  const [cropPage, setCropPage] = useState<number | null>(null)
  const [cropRect, setCropRect] = useState<CropRect | null>(null)
  const [cropDraft, setCropDraft] = useState<CropRect | null>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [cropPreviewUrl, setCropPreviewUrl] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const cropStart = useRef<{ page: number; x: number; y: number } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const busy = disabled || extracting || uploading

  useEffect(() => () => {
    if (cropPreviewUrl) URL.revokeObjectURL(cropPreviewUrl)
  }, [cropPreviewUrl])

  const yearValue = useMemo(() => ({
    start: fields.year_execution_start === null ? '' : String(fields.year_execution_start),
    end: fields.year_execution === null ? '' : String(fields.year_execution),
  }), [fields.year_execution, fields.year_execution_start])
  const dateIsDifferent =
    fields.year_execution !== null &&
    (fields.year_execution !== (artwork?.year_execution ?? null) ||
      fields.year_execution_start !== (artwork?.year_execution_start ?? null))
  const dimensionsLabel = (height: number | null | undefined, width: number | null | undefined, depth: number | null | undefined) => {
    if (height == null || width == null) return 'Not set'
    const values = [height, width, depth].filter((value): value is number => value != null)
    return `${values.join(' x ')} cm`
  }
  const dimensionsAreDifferent = fields.height_cm !== (artwork?.height_cm ?? null) ||
    fields.width_cm !== (artwork?.width_cm ?? null) ||
    fields.depth_cm !== (artwork?.depth_cm ?? null)

  function setTextField(key: ImportableField, value: string) {
    setFields(previous => ({ ...previous, [key]: value || null }))
    setSelectedFields(previous => ({ ...previous, [key]: Boolean(onPrepared && value.trim()) }))
  }

  function resetCrop() {
    setCropRect(null)
    setCropDraft(null)
    setCropFile(null)
    setCropPreviewUrl('')
  }

  async function extractPdf(selectedFile: File) {
    if (busy) return
    setError('')
    setSuccess('')
    setStatus('')
    setFile(null)
    setPages([])
    setFields({
      title: null, medium: null, signature: null, edition: null,
      year_execution: null, year_execution_start: null,
      height_cm: null, width_cm: null, depth_cm: null,
    })
    setSelectedFields({})
    setImportImage(false)
    setCropPage(null)
    resetCrop()

    if (selectedFile.size === 0) {
      setError('The selected file is empty.')
      return
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError('The PDF is too large. Maximum size: 100 MB.')
      return
    }
    if (selectedFile.type !== 'application/pdf' && !selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Select a PDF file.')
      return
    }

    setExtracting(true)
    onBusyChange(true)
    setStatus('Reading PDF pages in your browser…')
    try {
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
      const pdf = await pdfjs.getDocument({ data: await selectedFile.arrayBuffer() }).promise
      if (pdf.numPages > MAX_PAGES) {
        throw new Error(`This PDF has ${pdf.numPages} pages. The maximum supported number is ${MAX_PAGES}.`)
      }

      const previewPages: PagePreview[] = []
      const renderedPages: HTMLCanvasElement[] = []
      let firstPageCropFile: File | null = null
      const texts: string[] = []
      const scale = 2
      let totalPixels = 0
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        setStatus(`Rendering page ${pageNumber} of ${pdf.numPages}…`)
        const page = await pdf.getPage(pageNumber)
        const viewport = page.getViewport({ scale })
        const width = Math.ceil(viewport.width)
        const height = Math.ceil(viewport.height)
        totalPixels += width * height
        if (width > 8000 || height > 8000 || totalPixels > MAX_TOTAL_PIXELS) {
          throw new Error('This PDF is too large to safely preview in the browser.')
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Your browser could not render a PDF page.')
        await page.render({ canvas, canvasContext: context, viewport }).promise
        renderedPages.push(canvas)
        const suggestedCrop = pageNumber === 1 ? detectArtworkCrop(canvas) : null
        previewPages.push({
          page: pageNumber,
          imageUrl: canvas.toDataURL('image/jpeg', 0.88),
          width: canvas.width,
          height: canvas.height,
          suggestedCrop,
        })
        if (pageNumber === 1 && suggestedCrop) {
          const blob = await cropCanvas(canvas, suggestedCrop)
          if (blob) firstPageCropFile = new File([blob], 'blondeau-artwork.png', { type: 'image/png' })
        }

        const textContent = await page.getTextContent()
        const pageText = textContent.items.reduce((text, item) => {
          if (!('str' in item) || typeof item.str !== 'string') return text
          return `${text}${item.str}${'hasEOL' in item && item.hasEOL ? '\n' : ' '}`
        }, '').replace(/[ \t]+\n/g, '\n').trim()
        texts.push(pageText)
      }
      setPages(previewPages)
      setFile(selectedFile)
      setCropPage(previewPages[0]?.page ?? null)
      const autoCrop = previewPages[0]?.suggestedCrop ?? null
      setCropRect(autoCrop)
      setCropDraft(null)
      setCropFile(firstPageCropFile)
      setCropPreviewUrl(firstPageCropFile ? URL.createObjectURL(firstPageCropFile) : '')

      let recognizedText = texts.join('\n').trim()
      const initialFields = parseBlondeauSheetText(recognizedText)
      const initialFieldCount = Object.values(initialFields).filter(value => value !== null).length
      if (recognizedText.length < 40 || initialFieldCount < 3) {
        setStatus('Recognizing text locally in your browser…')
        const { createWorker } = await import('tesseract.js')
        const worker = await createWorker('fra+eng', 1, {
          logger: message => {
            if (message.status === 'recognizing text') {
              setStatus(`Recognizing text locally: ${Math.round(message.progress * 100)}%`)
            }
          },
        })
        try {
          const recognizedPages: string[] = []
          for (let index = 0; index < renderedPages.length; index += 1) {
            setStatus(`Recognizing page ${index + 1} of ${renderedPages.length} locally…`)
            const result = await worker.recognize(renderedPages[index])
            recognizedPages.push(result.data.text)
          }
          const ocrText = recognizedPages.join('\n')
          const ocrFieldCount = Object.values(parseBlondeauSheetText(ocrText)).filter(value => value !== null).length
          if (ocrFieldCount >= initialFieldCount) recognizedText = ocrText
        } finally {
          await worker.terminate()
        }
      }
      const detected = parseBlondeauSheetText(recognizedText)
      setFields(detected)
      if (onPrepared) {
        setSelectedFields({
          title: detected.title !== null,
          medium: detected.medium !== null,
          signature: detected.signature !== null,
          edition: detected.edition !== null,
          dates: detected.year_execution !== null,
          dimensions: detected.height_cm !== null && detected.width_cm !== null,
        })
      }
      setStatus('')
    } catch (cause) {
      console.error('BLONDEAU PDF EXTRACTION ERROR:', cause)
      setFile(selectedFile)
      setError(cause instanceof Error ? cause.message : 'Could not read the PDF.')
      setStatus('')
    } finally {
      setExtracting(false)
      onBusyChange(false)
    }
  }

  function pointerCoordinates(event: React.PointerEvent<HTMLDivElement>, page: PagePreview) {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(page.width, (event.clientX - bounds.left) * page.width / bounds.width)),
      y: Math.max(0, Math.min(page.height, (event.clientY - bounds.top) * page.height / bounds.height)),
    }
  }

  function startCrop(event: React.PointerEvent<HTMLDivElement>, page: PagePreview) {
    if (!importImage || page.page !== 1) return
    const point = pointerCoordinates(event, page)
    cropStart.current = { page: page.page, ...point }
    setCropPage(page.page)
    setCropRect(null)
    setCropDraft({ x: point.x, y: point.y, width: 0, height: 0 })
    setCropFile(null)
    setCropPreviewUrl('')
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveCrop(event: React.PointerEvent<HTMLDivElement>, page: PagePreview) {
    if (!cropStart.current || cropStart.current.page !== page.page) return
    const point = pointerCoordinates(event, page)
    const start = cropStart.current
    setCropDraft({
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    })
  }

  async function finishCrop(event: React.PointerEvent<HTMLDivElement>, page: PagePreview) {
    if (!cropStart.current || cropStart.current.page !== page.page) return
    const point = pointerCoordinates(event, page)
    const start = cropStart.current
    const rect = {
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    }
    cropStart.current = null
    setCropDraft(rect)
    if (!rect || rect.width < 24 || rect.height < 24) {
      setError('Select a larger area around the artwork image.')
      return
    }

    const image = new window.Image()
    image.src = page.imageUrl
    try {
      await image.decode()
    } catch {
      setError('Could not prepare the selected image crop.')
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(rect.width)
    canvas.height = Math.round(rect.height)
    const context = canvas.getContext('2d')
    if (!context) {
      setError('Your browser could not prepare the selected image crop.')
      return
    }
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) {
      setError('Could not create an image from the selected area.')
      return
    }
    setError('')
    setCropRect(rect)
    setCropFile(new File([blob], 'blondeau-artwork.png', { type: 'image/png' }))
    setCropPreviewUrl(URL.createObjectURL(blob))
  }

  async function importSheet() {
    if (!file || busy) return
    if (importImage && !cropFile) {
      setError('Select the artwork image area in the PDF, or turn off image import.')
      return
    }

    const fieldsToApply: Partial<BlondeauSheetFields> = {}
    for (const { key } of FIELDS) {
      if (selectedFields[key] && fields[key] !== null) fieldsToApply[key] = fields[key]
    }
    if (selectedFields.dates && fields.year_execution !== null) {
      fieldsToApply.year_execution = fields.year_execution
      fieldsToApply.year_execution_start = fields.year_execution_start
    }
    if (selectedFields.dimensions && fields.height_cm !== null && fields.width_cm !== null) {
      fieldsToApply.height_cm = fields.height_cm
      fieldsToApply.width_cm = fields.width_cm
      fieldsToApply.depth_cm = fields.depth_cm
    }

    if (selectedFields.dates && fields.year_execution_start !== null &&
      fields.year_execution !== null && fields.year_execution_start > fields.year_execution) {
      setError('The start year must not be after the end year.')
      return
    }
    const draft = { pdf: file, fields: fieldsToApply, image: importImage ? cropFile : null }
    if (onPrepared) {
      onPrepared(draft)
      return
    }

    setUploading(true)
    onBusyChange(true)
    setError('')
    setSuccess('')
    try {
      const documents = await importBlondeauSheet(artwork.id, draft)
      onImported(fieldsToApply, documents)
      setSuccess('The Blondeau sheet was imported.')
      setFile(null)
      setPages([])
      setCropPage(null)
      resetCrop()
      setSelectedFields({})
      setImportImage(false)
    } catch (cause) {
      console.error('BLONDEAU SHEET IMPORT ERROR:', cause)
      setError(cause instanceof Error ? cause.message : 'The Blondeau sheet could not be imported.')
    } finally {
      setUploading(false)
      onBusyChange(false)
      setStatus('')
    }
  }

  const different = (key: ImportableField) =>
    normalizeText(fields[key]) !== normalizeText(artwork?.[key] as string | null | undefined)

  return (
    <section
      aria-labelledby={onPrepared ? 'blondeau-import-instruction' : 'blondeau-import-heading'}
      onDragOver={event => {
        event.preventDefault()
        event.dataTransfer.dropEffect = busy ? 'none' : 'copy'
        if (!busy) setDragging(true)
      }}
      onDragLeave={event => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false)
      }}
      onDrop={event => {
        event.preventDefault()
        setDragging(false)
        if (busy) return
        const files = event.dataTransfer.files
        if (files.length !== 1) {
          setError('Drop one PDF factsheet at a time.')
          return
        }
        void extractPdf(files[0])
      }}
      style={{ margin: '16px 0', padding: 16, background: dragging && !busy ? '#f0f7f2' : '#fff', border: dragging && !busy ? '1px dashed #0b5d2a' : '1px solid #999', borderRadius: 6 }}
    >
      {!onPrepared && <h4 id="blondeau-import-heading" style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 'bold', textAlign: 'center' }}>Import Blondeau factsheet</h4>}
      <button
        id="blondeau-import-instruction"
        type="button"
        disabled={busy}
        onClick={() => fileInput.current?.click()}
        style={{ display: 'block', width: onPrepared ? '100%' : undefined, margin: '0 0 12px', padding: 0, border: 0, background: 'transparent', color: 'inherit', font: 'inherit', textAlign: onPrepared ? 'center' : 'left', cursor: busy ? 'not-allowed' : 'pointer' }}
      >
        {onPrepared ? 'Select or move a factsheet to create a new artwork.' : 'Select or move a factsheet to compare its details.'}
      </button>
        <input
          ref={fileInput}
          type="file"
          hidden
          accept="application/pdf,.pdf"
          disabled={busy}
          aria-label="Select Blondeau PDF"
          onChange={event => {
            const selected = event.target.files?.[0]
            event.target.value = ''
            if (selected) void extractPdf(selected)
          }}
        />

      {status && <p role="status" aria-live="polite">{status}</p>}
      {error && <p role="alert" style={{ color: '#a00' }}>{error}</p>}
      {success && <p role="status" style={{ color: '#176b35' }}>{success}</p>}

      {file && !extracting && (
        <>
          <p>PDF: {file.name}</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {FIELDS.map(({ key, label }) => {
              const isDifferent = different(key)
              return (
                <fieldset key={key} style={{ border: '1px solid #ccc', padding: 10, borderRadius: 4 }}>
                  <legend style={{ fontWeight: 'bold', textAlign: 'left' }}>{label}</legend>
                  {artwork && <p>Current ArtMuse: <em>{displayValue(artwork[key] as string | null | undefined)}</em></p>}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ flexShrink: 0 }}>Detected in factsheet:</span>
                    <input
                      type="text"
                      value={fields[key] ?? ''}
                      disabled={busy}
                      onChange={event => setTextField(key, event.target.value)}
                      style={{ flex: 1, minWidth: 0, padding: 6, boxSizing: 'border-box', border: fields[key] === null ? '1px solid #ccc' : undefined, borderRadius: 4, fontStyle: 'italic' }}
                    />
                  </label>
                  {fields[key] === null
                    ? <p>No value detected. Enter a value above if needed.</p>
                    : isDifferent
                      ? <label><input type="checkbox" checked={Boolean(selectedFields[key])} disabled={busy} onChange={event => setSelectedFields(previous => ({ ...previous, [key]: event.target.checked }))} /> Apply this change</label>
                      : <p role="status"><strong>Matches the current value.</strong></p>}
                </fieldset>
              )
            })}

            <fieldset style={{ border: '1px solid #ccc', padding: 10, borderRadius: 4 }}>
              <legend style={{ fontWeight: 'bold', textAlign: 'left' }}>Dimensions (cm)</legend>
              {artwork && <p>Current ArtMuse: <em>{dimensionsLabel(artwork.height_cm, artwork.width_cm, artwork.depth_cm)}</em></p>}
              <p>Detected in factsheet: <em>{dimensionsLabel(fields.height_cm, fields.width_cm, fields.depth_cm)}</em></p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {([
                  ['height_cm', 'Height'],
                  ['width_cm', 'Width'],
                  ['depth_cm', 'Depth'],
                ] as const).map(([key, label]) => (
                  <label key={key}>
                    <span>{label}</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={fields[key] ?? ''}
                      disabled={busy}
                      style={{ display: 'block', borderRadius: 4, padding: 6, fontStyle: 'italic' }}
                      onChange={event => {
                        const value = event.target.value === '' ? null : Number(event.target.value)
                        const parsed = value !== null && Number.isFinite(value) && value > 0 ? value : null
                        setFields(previous => ({ ...previous, [key]: parsed }))
                        setSelectedFields(previous => ({
                          ...previous,
                          dimensions: key === 'height_cm'
                            ? parsed !== null && fields.width_cm !== null
                            : key === 'width_cm'
                              ? fields.height_cm !== null && parsed !== null
                              : fields.height_cm !== null && fields.width_cm !== null,
                        }))
                      }}
                    />
                  </label>
                ))}
              </div>
              {fields.height_cm === null || fields.width_cm === null
                ? <p>No dimensions detected. Enter height and width above if needed.</p>
                : artwork && dimensionsAreDifferent
                  ? <label><input type="checkbox" checked={Boolean(selectedFields.dimensions)} disabled={busy} onChange={event => setSelectedFields(previous => ({ ...previous, dimensions: event.target.checked }))} /> Apply these dimensions</label>
                  : onPrepared
                    ? <label><input type="checkbox" checked={Boolean(selectedFields.dimensions)} disabled={busy} onChange={event => setSelectedFields(previous => ({ ...previous, dimensions: event.target.checked }))} /> Include these dimensions</label>
                    : <p role="status"><strong>Matches the current dimensions.</strong></p>}
            </fieldset>

            <fieldset style={{ border: '1px solid #ccc', padding: 10, borderRadius: 4 }}>
              <legend style={{ fontWeight: 'bold', textAlign: 'left' }}>Execution date</legend>
              {artwork && <p>Current ArtMuse: <em>{artwork.year_execution_start
                ? `${artwork.year_execution_start}–${artwork.year_execution ?? ''}`
                : displayValue(artwork.year_execution)}</em></p>}
              <p>Detected in factsheet: <em>{fields.year_execution === null
                ? 'Not set'
                : fields.year_execution_start === null
                  ? fields.year_execution
                  : `${fields.year_execution_start}–${fields.year_execution}`}</em></p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <label>
                  <span>Start year (optional)</span>
                  <input
                    type="number" min="1000" max="2100" value={yearValue.start} disabled={busy}
                    style={{ border: yearValue.start === '' ? '1px solid #ccc' : undefined, borderRadius: 4, padding: 6, fontStyle: 'italic' }}
                    onChange={event => {
                      const parsed = asYear(event.target.value)
                      setFields(previous => ({ ...previous, year_execution_start: parsed ?? null }))
                      setSelectedFields(previous => ({ ...previous, dates: Boolean(onPrepared) }))
                    }}
                  />
                </label>
                <label>
                  <span>End year</span>
                  <input
                    type="number" min="1000" max="2100" value={yearValue.end} disabled={busy}
                    style={{ border: yearValue.end === '' ? '1px solid #ccc' : undefined, borderRadius: 4, padding: 6, fontStyle: 'italic' }}
                    onChange={event => {
                      const parsed = asYear(event.target.value)
                      setFields(previous => ({ ...previous, year_execution: parsed ?? null }))
                      setSelectedFields(previous => ({ ...previous, dates: Boolean(onPrepared) }))
                    }}
                  />
                </label>
              </div>
              {fields.year_execution === null
                ? <p>No date detected. Enter a year above if needed.</p>
                : dateIsDifferent
                  ? <label><input type="checkbox" checked={Boolean(selectedFields.dates)} disabled={busy} onChange={event => setSelectedFields(previous => ({ ...previous, dates: event.target.checked }))} /> Apply this date</label>
                  : <p role="status"><strong>Matches the current date.</strong></p>}
              {fields.year_execution_start !== null && fields.year_execution !== null && fields.year_execution_start > fields.year_execution &&
                <p role="alert" style={{ color: '#a00' }}>The start year must not be after the end year.</p>}
            </fieldset>
          </div>

          <fieldset style={{ marginTop: 16, border: '1px solid #ccc', padding: 10, borderRadius: 4 }}>
            <legend style={{ margin: '0 auto', fontWeight: 'bold', textAlign: 'center' }}>Artwork image</legend>
            <label>
              <input type="checkbox" checked={importImage} disabled={busy || pages.length === 0} onChange={event => {
                setImportImage(event.target.checked)
                setError('')
              }} />
              Import an artwork image from this PDF
            </label>
            {importImage && (
              <>
                <p>The large image on the first PDF page is selected automatically. Adjust the crop if needed; only this area will be added to ArtMuse.</p>
                {pages.slice(0, 1).map(page => {
                  const visibleCrop = cropPage === page.page ? cropDraft ?? cropRect : null
                  return (
                    <div key={page.page} style={{ marginTop: 12 }}>
                      <strong>Page {page.page}</strong>
                      <div
                        role="img"
                        aria-label={`PDF page ${page.page}; drag to select the artwork image`}
                        onPointerDown={event => startCrop(event, page)}
                        onPointerMove={event => moveCrop(event, page)}
                        onPointerUp={event => void finishCrop(event, page)}
                        style={{ position: 'relative', maxWidth: '100%', width: 'fit-content', touchAction: 'none', cursor: 'crosshair' }}
                      >
                        <Image
                          src={page.imageUrl}
                          alt={`Blondeau PDF page ${page.page}`}
                          width={page.width}
                          height={page.height}
                          unoptimized
                          draggable={false}
                          style={{ display: 'block', maxWidth: '100%', maxHeight: 700, width: 'auto', userSelect: 'none' }}
                        />
                        {visibleCrop && (
                          <div style={{
                            position: 'absolute',
                            left: `${visibleCrop.x / page.width * 100}%`,
                            top: `${visibleCrop.y / page.height * 100}%`,
                            width: `${visibleCrop.width / page.width * 100}%`,
                            height: `${visibleCrop.height / page.height * 100}%`,
                            border: '2px solid #0b5d2a',
                            background: 'rgba(11, 93, 42, 0.12)',
                            pointerEvents: 'none',
                          }} />
                        )}
                      </div>
                    </div>
                  )
                })}
                {cropPreviewUrl && <p>Selected image preview: <Image src={cropPreviewUrl} alt="Selected artwork crop" width={240} height={240} unoptimized style={{ display: 'block', maxWidth: 240, maxHeight: 240, objectFit: 'contain', marginTop: 8 }} /></p>}
              </>
            )}
          </fieldset>

          <button type="button" className="edit-button" disabled={busy || pages.length === 0 || (importImage && !cropFile)} onClick={() => void importSheet()} style={{ marginTop: 16 }}>
            {uploading ? 'Importing…' : onPrepared ? 'Continue to artwork creation' : 'Import PDF and selected changes'}
          </button>
        </>
      )}
    </section>
  )
}
