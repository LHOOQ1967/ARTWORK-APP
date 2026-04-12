
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Artwork = {
  id: string
  title: string
  status: string
  artists?: {
    last_name: string
  } | null
  contacts?: {
    company_name: string
  } | null
}

export default function ArtworksPage() {
  // ✅ DÉCLARATION DE artworks (CE QUI MANQUAIT)
  const [artworks, setArtworks] = useState<Artwork[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchArtworks = async () => {
      try {
        const res = await fetch('/api/artworks')
        const data = await res.json()

        if (!res.ok) {
          setError(data.error || 'Failed to load artworks')
          return
        }

        setArtworks(Array.isArray(data) ? data : [])
      } catch (err) {
        setError('Network error')
      } finally {
        setLoading(false)
      }
    }

    fetchArtworks()
  }, [])

  if (loading) {
    return <p style={{ padding: 40 }}>Loading artworks…</p>
  }

  if (error) {
    return <p style={{ padding: 40, color: 'red' }}>{error}</p>
  }

  return (
    <main style={{ padding: 40 }}>
      <h1>Artworks</h1>

      <Link href="/artworks/new">
        + New artwork
      </Link>

     
<ul>
  {artworks.map((a) => (
    <li key={a.id}>
      <Link href={`/artworks/${a.id}`}>
        <strong>{a.title}</strong>
      </Link>

      {' — '}
      {a.artists?.last_name ?? '—'}

      {' — '}
      {a.contacts?.company_name ?? '—'}

      {' '}
      <em>({a.status})</em>
    </li>
  ))}
</ul>
    </main>
  )
}
