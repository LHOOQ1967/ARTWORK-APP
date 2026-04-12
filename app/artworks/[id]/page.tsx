
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type Artwork = {
  id: string
  date_proposition: string
  title: string
  medium: string
  year_execution: number
  height_cm: number
  width_cm: number
  depth_cm: number | null
  condition: string
  provenance: string
  exhibition_literature: string
  certificate: boolean
  certificate_location: string
  asking_price: number | null
  currency: string
  location_of_work: string
  check_seller: string
  priority: string
  status: string
  view_date: string | null
  notes: string
  artists?: { 
    first_name: string
    last_name: string
    year_of_birth: number
    year_of_death: number
   } | null
}

export default function ArtworkDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = typeof params.id === 'string' ? params.id : null

  const [artwork, setArtwork] = useState<Artwork | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return

    const loadArtwork = async () => {
      try {
        const res = await fetch(`/api/artworks/${id}`)
        const data = await res.json()

        if (!res.ok) {
          setError(data.error || 'Failed to load artwork')
          return
        }

        setArtwork(data)
      } catch {
        setError('Network error')
      } finally {
        setLoading(false)
      }
    }

    loadArtwork()
  }, [id])

  if (!id || loading) return <p style={{ padding: 40 }}>Loading artwork…</p>
  if (error) return <p style={{ padding: 40, color: 'red' }}>{error}</p>
  if (!artwork) return <p style={{ padding: 40 }}>Artwork not found</p>

  console.log('ARTWORK RAW:', artwork)

  return (
    <main
      style={{
        padding: 40,
        minHeight: '100vh',
        backgroundColor: '#007a5e',
      }}
    >
  

<div style={{ marginTop: 10, marginBottom: 10 }}>
  <GrayButton onClick={() => router.push(`/artworks/${id}/edit`)}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#eaeaea')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f5f5f5')}
    >
    Edit
  </GrayButton>
  {' '}
  <GrayButton onClick={() => router.push('/artworks')}>
    Back to list
  </GrayButton>
</div>

      {/* ✅ FIRST BOX : TITLE + ACTIONS */}
      
      {/* ✅ IDENTIFICATION */}
      <Section >
        <Row label="Date proposed" value={formatDate(artwork.date_proposition)} />
        <Row label="Artist" value={formatArtist(artwork.artist)} hideLabel />
        <Row label="Title" value={artwork.title} hideLabel />
         <Row label="Medium" value={artwork.medium} hideLabel />
         <Row label="Dimensions (cm)" value={`${artwork.height_cm} × ${artwork.width_cm}${artwork.depth_cm ? ` × ${artwork.depth_cm}` : ''}`}
        hideLabel />
        <Row label="Year" value={artwork.year_execution} hideLabel />
        <Row label="Status" value={artwork.status} />
        <Row label="Viewed on" value={formatDate(artwork.view_date)} />
        <Row label="Priority" value={artwork.priority} />
         <Row label="Condition" value={artwork.condition} />
      </Section>


      {/* ✅ MARKET (inchangé) */}
      <Section >
        <Row
          label="Asking price"
          value={
            artwork.asking_price
              ? `${artwork.currency} ${artwork.asking_price.toLocaleString('fr-CH')} `
              : '—'
          }
        />
        <Row label="Location of work" value={artwork.location_of_work} />
        <Row label="Seller checked" value={artwork.check_seller} />
      </Section>

      {/* ✅ PROVENANCE (inchangé) */}
      <Section title="Provenance & Documentation">
        <Row label="Provenance" value={artwork.provenance} multiline />
        <Row
          label="Exhibitions / Literature"
          value={artwork.exhibition_literature}
          multiline
        />
        <Row label="Certificate" value={artwork.certificate ? 'Yes' : 'No'} />
        <Row label="Certificate location" value={artwork.certificate_location} />
      </Section>

      {/* ✅ NOTES (inchangé) */}
      <Section title="Notes">
        <div>{artwork.notes || '—'}</div>
      </Section>
    </main>
  )
}

/* ---------- UI helpers ---------- */

function Section({
  title,
  children,
}: {
  title?: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        marginBottom: 30,
        padding: 20,
        backgroundColor: 'white',
        borderRadius: 6,
      }}
    >
      {title && <h2 style={{ marginBottom: 15 }}>{title}</h2>}
      {children}
    </div>
  )
}



function Row({
  label,
  value,
  multiline = false,
  hideLabel = false,
}: {
  label: string
  value: any
  multiline?: boolean
  hideLabel?: boolean
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      {!hideLabel && (
        <div
          style={{
            color: '#777',        // ✅ gris discret
            fontSize: '0.9rem',   // ✅ légèrement plus petit
            marginBottom: 2,
          }}
        >
          {label}
        </div>
      )}

      <div
        style={{
          color: '#000',          // ✅ valeur en noir
          whiteSpace: multiline ? 'pre-wrap' : 'normal',
        }}
      >
        {value || '—'}
      </div>
    </div>
  )
}




function GrayButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement>
) {
  const { children, ...rest } = props

  return (
    <button
      {...rest}
      style={{
        padding: '8px 16px',
        backgroundColor: '#f5f5f5',
        border: '2px solid #ccc',
        fontWeight: 600,
        borderRadius: 6,
        cursor: 'pointer',
        ...props.style,
      }}
    >
      {children}
    </button>
  )
}


function formatDate(date?: string | null) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('fr-CH')
}


function formatArtist(artist?: {
  first_name: string | null
  last_name: string
  year_of_birth: number | null
  year_of_death: number | null
}) {
  if (!artist) return '—'

  const name = [artist.first_name, artist.last_name]
    .filter(Boolean)
    .join(' ')

  const birth = artist.year_of_birth
  const death = artist.year_of_death

  if (birth && death) {
    return `${name} (${birth}–${death})`
  }

  if (birth && !death) {
    return `${name} (né ${birth})`
  }

  return name
}


function formatYear(date: string) {
  return new Date(date).getFullYear()
}
