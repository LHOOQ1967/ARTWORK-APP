
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function ArtworkDetailPage() {
  const params = useParams()
  const router = useRouter()

  const id = typeof params.id === 'string' ? params.id : null

  const [artwork, setArtwork] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // ✅ NE RIEN FAIRE tant que id n’est pas une string
    if (!id) return

    const loadArtwork = async () => {
      const res = await fetch(`/api/artworks/${id}`)
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to load artwork')
        return
      }

      setArtwork(data)
    }

    loadArtwork()
  }, [id])

  if (!id) {
    return <p style={{ padding: 40 }}>Loading…</p>
  }

  if (error) {
    return <p style={{ padding: 40, color: 'red' }}>{error}</p>
  }

  if (!artwork) {
    return <p style={{ padding: 40 }}>Loading artwork…</p>
  }

  return (
    <main style={{ padding: 40, maxWidth: 900 }}>
      <h1>{artwork.title}</h1>

      <p>
        <strong>Artist:</strong>{' '}
        {artwork.artists?.last_name ?? '—'}
      </p>

      <p>
        <strong>Proposed by:</strong>{' '}
        {artwork.contacts?.company_name ?? '—'}
      </p>

      <p>
        <strong>Status:</strong> {artwork.status}
      </p>

      <p>
        <strong>Year:</strong> {artwork.year_execution ?? '—'}
      </p>

      <p>
        <strong>Medium:</strong> {artwork.medium ?? '—'}
      </p>

      <p>
        <strong>Dimensions:</strong>{' '}
        {artwork.height_cm} × {artwork.width_cm}
        {artwork.depth_cm ? ` × ${artwork.depth_cm}` : ''} cm
      </p>

      <p>
        <strong>Asking price:</strong>{' '}
        {artwork.asking_price
          ? `${artwork.asking_price} ${artwork.currency}`
          : '—'}
      </p>

      <section>
        <h2>Condition</h2>
        <p>{artwork.condition || '—'}</p>
      </section>

      <section>
        <h2>Provenance</h2>
        <p>{artwork.provenance || '—'}</p>
      </section>

      <section>
        <h2>Notes</h2>
        <p>{artwork.notes || '—'}</p>
      </section>

      <button onClick={() => router.push('/artworks')}>
        ← Back to list
      </button>
    </main>
  )
}
