'use client'

import { useState } from 'react'
import Image from 'next/image'
import { fetchWithAuth } from '@/lib/fetchWithAuth'
import { auctionHouseNames, isAuctionLot, record, type AuctionLot, type AuctionProvider } from '@/lib/imports/auction'

export type AuctionLotImporterProps = {
  disabled: boolean
  onBusyChange: (busy: boolean) => void
  onPrepared: (lot: AuctionLot) => void
}

export default function AuctionLotImporter({ provider, disabled, onBusyChange, onPrepared }: AuctionLotImporterProps & {
  provider: AuctionProvider
}) {
  const house = auctionHouseNames[provider]
  const placeholders = {
    sothebys: 'https://www.sothebys.com/en/buy/auction/...',
    christies: 'https://www.christies.com/en/lot/lot-...',
    phillips: 'https://www.phillips.com/detail/artist/...',
  }
  const [url, setUrl] = useState('')
  const [lot, setLot] = useState<AuctionLot | null>(null)
  const [selectedImages, setSelectedImages] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function readLot() {
    if (busy || disabled) return
    setError('')
    setLot(null)
    setBusy(true)
    onBusyChange(true)
    try {
      const response = await fetchWithAuth(`/api/artwork-imports/${provider}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
      })
      const body: unknown = await response.json()
      if (!response.ok) throw new Error(record(body) && typeof body.error === 'string' ? body.error : `Import failed (HTTP ${response.status}).`)
      if (!isAuctionLot(body)) {
        throw new Error(`The ${house} lot response could not be confirmed.`)
      }
      const result = body
      setLot(result)
      setSelectedImages(result.images.map(image => image.url))
    } catch (cause) {
      console.error(`${house} IMPORT ERROR:`, cause)
      setError(cause instanceof Error ? cause.message : `Could not read the ${house} lot.`)
    } finally {
      setBusy(false)
      onBusyChange(false)
    }
  }

  return (
    <div>
      <p>Paste an English {house} auction lot link. Review the artwork and auction details, then select the images to copy into ArtMuse. Videos are ignored.</p>
      <label style={{ display: 'block' }}>
        {house} auction lot URL
        <input type="url" value={url} disabled={disabled || busy} style={{ display: 'block', width: '100%', padding: 8, margin: '8px 0' }}
          placeholder={placeholders[provider]}
          onChange={event => { setUrl(event.target.value); setLot(null); setError('') }} />
      </label>
      <button type="button" className="edit-button" disabled={disabled || busy || !url.trim()} onClick={() => void readLot()}>
        {busy ? 'Reading lot…' : `Read ${house} lot`}
      </button>
      {error && <p role="alert" style={{ color: '#a00' }}>{error}</p>}
      {lot && (
        <div>
          <h3>{lot.artist_name} — {lot.title}</h3>
          <p>{[lot.medium, lot.signature, lot.year_start ? `${lot.year_start}–${lot.year}` : lot.year].filter(Boolean).join(' · ')}</p>
          <p>Dimensions: {[lot.height_cm, lot.width_cm, lot.depth_cm].filter(value => value !== null).join(' × ') || 'Not detected'}{lot.height_cm !== null ? ' cm' : ''}</p>
          <p>{lot.auction_title} · {lot.location} · Lot {lot.lot ?? 'Not detected'}</p>
          <p>Estimate: {lot.estimate_low ?? 'Not published'} – {lot.estimate_high ?? 'Not published'} {lot.auction_currency}</p>
          <p>Sale date and time (local{lot.location ? ` — ${lot.location}` : ''}): {lot.sale_date ?? 'Not published'} {lot.sale_time ?? ''}</p>
          <p>Proposed by, auction house and location: {house}{lot.contact_defaults?.city ? ` — ${lot.contact_defaults.city}` : ''}. Verify all detected details in the creation form. Provenance, exhibitions and catalogue text are not imported.</p>
          {lot.contact_defaults?.warning && <p role="alert">{lot.contact_defaults.warning}</p>}
          {lot.images.length === 0 && <p role="status">No gallery images were detected.</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, margin: '16px 0' }}>
            {lot.images.map((image, index) => (
              <label key={image.url} style={{ width: 180 }}>
                <Image src={image.url} alt={`${house} lot image ${index + 1}`} width={180} height={180} unoptimized style={{ objectFit: 'contain' }} />
                <input type="checkbox" checked={selectedImages.includes(image.url)} disabled={disabled || busy}
                  onChange={event => setSelectedImages(previous => event.target.checked ? [...previous, image.url] : previous.filter(url => url !== image.url))} />
                Import image {index + 1}
              </label>
            ))}
          </div>
          <p>The source link and selected images will be saved with the new artwork. Keep this page open until saving completes.</p>
          <button type="button" className="edit-button" disabled={disabled || busy}
            onClick={() => onPrepared({ ...lot, images: lot.images.filter(image => selectedImages.includes(image.url)) })}>
            Continue to artwork creation
          </button>
        </div>
      )}
    </div>
  )
}
