'use client'

import { useEffect, useRef, useState } from 'react'

export type AlbumImage = { id: string; url: string; label: string; downloadUrl?: string }

export default function ArtworkImageAlbum({ images, initialId, onClose }: {
  images: AlbumImage[]
  initialId: string
  onClose: () => void
}) {
  const [index, setIndex] = useState(() => Math.max(0, images.findIndex(image => image.id === initialId)))
  const [failedId, setFailedId] = useState<string | null>(null)
  const [previousFocus] = useState(() => typeof document === 'undefined' ? null : document.activeElement)
  const dialog = useRef<HTMLDialogElement>(null)
  const touchStart = useRef<number | null>(null)
  const image = images[index]
  const move = (direction: number) => setIndex(previous => (previous + direction + images.length) % images.length)

  useEffect(() => {
    const element = dialog.current
    const overflow = document.body.style.overflow
    element?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      element?.close()
      document.body.style.overflow = overflow
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [previousFocus])

  if (!image) return null
  return (
    <dialog ref={dialog} aria-label="Image album" onCancel={onClose}
      onKeyDown={event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault()
          move(event.key === 'ArrowLeft' ? -1 : 1)
        }
      }}
      style={{
        position: 'fixed', inset: 0, margin: 'auto', width: '96vw', maxWidth: '96vw',
        height: '94dvh', maxHeight: '94dvh', padding: 16, border: 0, borderRadius: 8,
        backgroundColor: '#171717', color: '#fff',
      }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ flex: 1, overflowWrap: 'anywhere' }}>{image.label}</span>
          <span role="status" aria-live="polite">{index + 1} / {images.length}</span>
          <a href={image.downloadUrl || image.url} target="_blank" rel="noopener noreferrer"
            className="edit-button">{image.downloadUrl ? 'Download' : 'Open original'}</a>
          <button type="button" className="edit-button" onClick={onClose} autoFocus aria-label="Close image album">Close</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', gap: 8 }}
          onTouchStart={event => { touchStart.current = event.touches[0]?.clientX ?? null }}
          onTouchEnd={event => {
            const end = event.changedTouches[0]?.clientX
            if (touchStart.current !== null && end !== undefined && Math.abs(end - touchStart.current) > 50) {
              move(end < touchStart.current ? 1 : -1)
            }
            touchStart.current = null
          }}>
          <button type="button" className="edit-button" disabled={images.length < 2}
            aria-label="Previous image" onClick={() => move(-1)}>&lt;</button>
          {failedId === image.id ? (
            <p role="alert" style={{ flex: 1, textAlign: 'center' }}>
              This image cannot be displayed in your browser. Use {image.downloadUrl ? 'Download' : 'Open original'} to view it.
            </p>
          ) : (
            <img key={image.id} src={image.url} alt={image.label} onError={() => setFailedId(image.id)}
              style={{ flex: 1, minWidth: 0, width: 0, height: '100%', objectFit: 'contain' }} />
          )}
          <button type="button" className="edit-button" disabled={images.length < 2}
            aria-label="Next image" onClick={() => move(1)}>&gt;</button>
        </div>
      </div>
    </dialog>
  )
}
