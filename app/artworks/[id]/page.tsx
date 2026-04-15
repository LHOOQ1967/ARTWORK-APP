
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type Artwork = {
  id: string
  title: string
}

export default function ArtworkDetailPage() {
  const [isEditing, setIsEditing] = useState(false)
  const params = useParams() as { id?: string }
  const id = params?.id ?? null
  const [contacts, setContacts] = useState<Contact[]>([])
  const [artwork, setArtwork] = useState<Artwork | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const STATUS_OPTIONS = ['draft', 'viewed', 'negotiation', 'bought']
  const PRIORITY_OPTIONS = ['low', 'medium', 'high']
  const CURRENCY_OPTIONS = ['CHF', 'EUR', 'USD', 'GBP']
  const auctionContact = contacts.find(c => c.id === artwork?.auction_contact_id) || null



  





  useEffect(() => {
    if (!id) return

    async function loadArtwork() {
      try {
        const res = await fetch(`/api/artworks/${id}`, {
          credentials: 'include',
        })

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

  
useEffect(() => {
    async function loadContacts() {
      const res = await fetch('/api/contacts', {
        credentials: 'include',
      })

      if (res.ok) {
        setContacts(await res.json())
      } else {
        console.error('Failed to load contacts')
      }
    }

    loadContacts()
  }, [])


async function saveArtwork() {
  if (!artwork) return

  const res = await fetch(`/api/artworks/${artwork.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      title: artwork.title,
      medium: artwork.medium,
      year_execution: artwork.year_execution,
      location_of_work: artwork.location_of_work,
      status: artwork.status,
      priority: artwork.priority,
      asking_price: artwork.asking_price,
      currency: artwork.currency,
      auctions: artwork.auctions,
      auction_contact_id: artwork.auction_contact_id,
      sale_date: artwork.sale_date,
      sale_time: artwork.sale_time,
      auction_link: artwork.auction_link,
      estimate_low: artwork.estimate_low, 
      estimate_high: artwork.estimate_high,
      guarantee: artwork.guarantee
    }),
  })

  if (!res.ok) {
    alert('Failed to save')
    return
  }

  setIsEditing(false)
}


  if (!id || loading) {
    return <p style={{ padding: 40 }}>Loading artwork…</p>
  }

  if (error) {
    return <p style={{ padding: 40, color: 'red' }}>{error}</p>
  }

  if (!artwork) {
    return <p style={{ padding: 40 }}>Artwork not found</p>
  }

return (
  <main
    style={{
      padding: 40,
      minHeight: '100vh',
      backgroundColor: '#007a5e',
      color: 'white',
    }}
  >

<div style={{ marginBottom: 20 }}>
  <button
    onClick={() => setIsEditing(!isEditing)}
    style={{
      padding: '6px 12px',
      marginRight: 10,
      borderRadius: 4,
      border: '1px solid #ccc',
      cursor: 'pointer',
    }}
  >
    {isEditing ? 'Cancel' : 'Edit'}
  </button>

  {isEditing && (
    <button
      onClick={saveArtwork}
      style={{
        padding: '6px 12px',
        borderRadius: 4,
        border: '1px solid #ccc',
        cursor: 'pointer',
      }}
    >
      Save
    </button>
  )}
</div>

    {/* Section always visible */}
    <section
      style={{
        marginBottom: 30,
        padding: 20,
        backgroundColor: 'white',
        borderRadius: 6,
        color: 'black',
      }}
    >
      <h2 style={{ marginBottom: 15 }}>Artwork</h2>

  
<div style={{ marginBottom: 12 }}>
  <div style={{ color: '#777', fontSize: '0.9rem' }}>Title</div>

  {isEditing ? (
    <input
      type="text"
      value={artwork.title}
      onChange={(e) =>
        setArtwork({ ...artwork, title: e.target.value })
      }
    onKeyDown={(e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        saveArtwork()
      }
    }
  }
      autoFocus
      style={{
        fontSize: '1.2rem',
        fontWeight: 600,
        width: '100%',
        padding: '6px 8px',
        border: '1px solid #ccc',
        borderRadius: 4,
      }}
    />
  ) : (
    <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>
      {artwork.title || '—'}
    </div>
  )}
</div>


      <div>
        <div style={{ color: '#777', fontSize: '0.9rem' }}>Artist</div>
        <div>
          {artwork.artist
            ? [artwork.artist.first_name, artwork.artist.last_name]
                .filter(Boolean)
                .join(' ')
            : '—'}
        </div>
      </div>



<div style={{ marginTop: 12 }}>
  <div style={{ color: '#777', fontSize: '0.9rem' }}>Year</div>

  {isEditing ? (
    <input
      type="number"
      value={artwork.year_execution ?? ''}
      onChange={(e) =>
        setArtwork({
          ...artwork,
          year_execution: e.target.value
            ? Number(e.target.value)
            : null,
        })
      }
    onKeyDown={(e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        saveArtwork()
      }
    }
  }
      style={{
        width: 120,
        padding: '6px 8px',
        border: '1px solid #ccc',
        borderRadius: 4,
      }}
    />
  ) : (
    <div>
      {artwork.year_execution || '—'}
    </div>
  )}
</div>



<div style={{ marginTop: 12 }}>
  <div style={{ color: '#777', fontSize: '0.9rem' }}>Medium</div>

  {isEditing ? (
    <input
      type="text"
      value={artwork.medium || ''}
      onChange={(e) =>
        setArtwork({ ...artwork, medium: e.target.value })
      }
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          saveArtwork()
        }
      }}
      style={{
        width: '100%',
        padding: '6px 8px',
        border: '1px solid #ccc',
        borderRadius: 4,
      }}
    />
  ) : (
    <div>
      {artwork.medium || '—'}
    </div>
  )}
</div>



<div style={{ marginTop: 12 }}>
  <div style={{ color: '#777', fontSize: '0.9rem' }}>
    Dimensions (cm)
  </div>
  <div>
    {artwork.height_cm && artwork.width_cm
      ? `${artwork.height_cm} × ${artwork.width_cm}` +
        (artwork.depth_cm ? ` × ${artwork.depth_cm}` : '')
      : '—'}
  </div>
</div>


<div style={{ marginTop: 12 }}>
  <div style={{ color: '#777', fontSize: '0.9rem' }}>
    Current location
  </div>

  {isEditing ? (
    <input
      type="text"
      value={artwork.location_of_work || ''}
      onChange={(e) =>
        setArtwork({
          ...artwork,
          location_of_work: e.target.value,
        })
      }
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          saveArtwork()
        }
      }}
      style={{
        width: '100%',
        padding: '6px 8px',
        border: '1px solid #ccc',
        borderRadius: 4,
      }}
    />
  ) : (
    <div>
      {artwork.location_of_work || '—'}
    </div>
  )}
</div>
    </section>




<section
  style={{
    marginBottom: 30,
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 6,
    color: 'black',
  }}
>
  <h2 style={{ marginBottom: 15 }}>Market</h2>


<div style={{ marginBottom: 12 }}>
  <div style={{ color: '#777', fontSize: '0.9rem' }}>
    Asking price
  </div>

  {isEditing ? (
    <input
      type="number"
      value={artwork.asking_price ?? ''}
      onChange={(e) =>
        setArtwork({
          ...artwork,
          asking_price: e.target.value
            ? Number(e.target.value)
            : null,
        })
      }
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          saveArtwork()
        }
      }}
      style={{
        width: 160,
        padding: '6px 8px',
        border: '1px solid #ccc',
        borderRadius: 4,
      }}
    />
  ) : (
    <div>
      {artwork.asking_price !== null
        ? `${artwork.currency} ${new Intl.NumberFormat('fr-CH').format(
            artwork.asking_price
          )}`
        : '—'}
    </div>
  )}
</div>


<div>
  <div style={{ color: '#777', fontSize: '0.9rem' }}>
    Currency
  </div>

  {isEditing ? (
    <select
      value={artwork.currency || ''}
      onChange={(e) =>
        setArtwork({
          ...artwork,
          currency: e.target.value,
        })
      }
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          saveArtwork()
        }
      }}
      style={{
        padding: '6px 8px',
        border: '1px solid #ccc',
        borderRadius: 4,
        marginTop: 4,
      }}
    >
      <option value="">—</option>
      {CURRENCY_OPTIONS.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  ) : (
    <div>
      {artwork.currency || '—'}
    </div>
  )}
</div>
</section>


<section
  style={{
    marginBottom: 30,
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 6,
    color: 'black',
  }}
>
  <h2 style={{ marginBottom: 15 }}>Status & Priority</h2>


<div style={{ marginBottom: 12 }}>
  <div style={{ color: '#777', fontSize: '0.9rem' }}>Status</div>

  {isEditing ? (
    <select
      value={artwork.status || ''}
      onChange={(e) =>
        setArtwork({ ...artwork, status: e.target.value })
      }
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          saveArtwork()
        }
      }}
      style={{
        padding: '6px 8px',
        border: '1px solid #ccc',
        borderRadius: 4,
      }}
    >
      <option value="">—</option>
      {STATUS_OPTIONS.map((status) => (
        <option key={status} value={status}>
          {status}
        </option>
      ))}
    </select>
  ) : (
    <div>{artwork.status || '—'}</div>
  )}
</div>


<div>
  <div style={{ color: '#777', fontSize: '0.9rem' }}>Priority</div>

  {isEditing ? (
    <select
      value={artwork.priority || ''}
      onChange={(e) =>
        setArtwork({ ...artwork, priority: e.target.value })
      }
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          saveArtwork()
        }
      }}
      style={{
        padding: '6px 8px',
        border: '1px solid #ccc',
        borderRadius: 4,
      }}
    >
      <option value="">—</option>
      {PRIORITY_OPTIONS.map((priority) => (
        <option key={priority} value={priority}>
          {priority}
        </option>
      ))}
    </select>
  ) : (
    <div>{artwork.priority || '—'}</div>
  )}
</div>

</section>


<section
  style={{
    marginBottom: 30,
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 6,
    color: 'black',
  }}
>
  <h2 style={{ marginBottom: 15 }}>Auction</h2>

  {/* Auction planned — TOUJOURS visible */}
  <div style={{ marginBottom: 12 }}>
    <div style={{ color: '#777', fontSize: '0.9rem' }}>
      Auction planned
    </div>

    {isEditing ? (
      <select
        value={artwork.auctions ? 'yes' : 'no'}
        onChange={(e) =>
          setArtwork({
            ...artwork,
            auctions: e.target.value === 'yes',
          })
        }
        style={{
          padding: '6px 8px',
          border: '1px solid #ccc',
          borderRadius: 4,
        }}
      >
        <option value="no">No</option>
        <option value="yes">Yes</option>
      </select>
    ) : (
      <div>{artwork.auctions ? 'Yes' : 'No'}</div>
    )}
  </div>

  {/* DÉTAILS — visibles uniquement si auctions === true */}
  {artwork.auctions && (
    <>


<div style={{ marginBottom: 12 }}>
  <div style={{ color: '#777', fontSize: '0.9rem' }}>
    Auction house
  </div>

  {isEditing ? (
    <select
      value={artwork.auction_contact_id || ''}
      onChange={(e) =>
        setArtwork({
          ...artwork,
          auction_contact_id: e.target.value || null,
        })
      }
      style={{
        padding: '6px 8px',
        border: '1px solid #ccc',
        borderRadius: 4,
      }}
    >
      <option value="">—</option>
      {contacts.map((c) => (
        <option key={c.id} value={c.id}>
          {c.company_name ||
            [c.first_name, c.last_name]
              .filter(Boolean)
              .join(' ')}
        </option>
      ))}
    </select>
  ) : (
    <div>
      {auctionContact
        ? auctionContact.company_name ||
          [auctionContact.first_name, auctionContact.last_name]
            .filter(Boolean)
            .join(' ')
        : '—'}
    </div>
  )}
</div>


<div style={{ marginBottom: 12 }}>
  <div style={{ color: '#777', fontSize: '0.9rem' }}>
    Sale date
  </div>

  {isEditing ? (
    <input
      type="date"
      value={artwork.sale_date || ''}
      onChange={(e) =>
        setArtwork({
          ...artwork,
          sale_date: e.target.value || null,
        })
      }
      style={{
        padding: '6px 8px',
        border: '1px solid #ccc',
        borderRadius: 4,
      }}
    />
  ) : (
    <div>
      {artwork.sale_date
        ? new Date(artwork.sale_date).toLocaleDateString('fr-CH')
        : '—'}
    </div>
  )}
</div>


<div style={{ marginBottom: 12 }}>
  <div style={{ color: '#777', fontSize: '0.9rem' }}>
    Sale time
  </div>

  {isEditing ? (
    <input
      type="time"
      value={artwork.sale_time || ''}
      onChange={(e) =>
        setArtwork({
          ...artwork,
          sale_time: e.target.value || null,
        })
      }
      style={{
        padding: '6px 8px',
        border: '1px solid #ccc',
        borderRadius: 4,
      }}
    />
  ) : (
    <div>{artwork.sale_time || '—'}</div>
  )}
</div>


<div style={{ marginBottom: 12 }}>
  <div style={{ color: '#777', fontSize: '0.9rem' }}>
    Auction website
  </div>

  {isEditing ? (
    <input
      type="url"
      value={artwork.auction_link || ''}
      onChange={(e) =>
        setArtwork({
          ...artwork,
          auction_link: e.target.value || null,
        })
      }
      style={{
        width: '100%',
        padding: '6px 8px',
        border: '1px solid #ccc',
        borderRadius: 4,
      }}
    />
  ) : artwork.auction_link ? (
    <a href={artwork.auction_link} target="_blank">
      Open link
    </a>
  ) : (
    '—'
  )}
</div>


<div style={{ marginBottom: 12 }}>
  <div style={{ color: '#777', fontSize: '0.9rem' }}>
    Estimate
  </div>

  {isEditing ? (
    <div style={{ display: 'flex', gap: 8 }}>
      <input
        type="number"
        placeholder="Low"
        value={artwork.estimate_low ?? ''}
        onChange={(e) =>
          setArtwork({
            ...artwork,
            estimate_low: e.target.value
              ? Number(e.target.value)
              : null,
          })
        }
      />
      <input
        type="number"
        placeholder="High"
        value={artwork.estimate_high ?? ''}
        onChange={(e) =>
          setArtwork({
            ...artwork,
            estimate_high: e.target.value
              ? Number(e.target.value)
              : null,
          })
        }
      />
      <select
        value={artwork.auction_currency || ''}
        onChange={(e) =>
          setArtwork({
            ...artwork,
            auction_currency: e.target.value || null,
          })
        }
      >
        <option value="">—</option>
        {CURRENCY_OPTIONS.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  ) : (
    <div>
      {artwork.estimate_low && artwork.estimate_high
        ? `${artwork.auction_currency} ${artwork.estimate_low} – ${artwork.estimate_high}`
        : '—'}
    </div>
  )}
</div>


<div>
  <div style={{ color: '#777', fontSize: '0.9rem' }}>
    Guarantee
  </div>

  {isEditing ? (
    <select
      value={artwork.guarantee ? 'yes' : 'no'}
      onChange={(e) =>
        setArtwork({
          ...artwork,
          guarantee: e.target.value === 'yes',
        })
      }
    >
      <option value="no">No</option>
      <option value="yes">Yes</option>
    </select>
  ) : (
    <div>{artwork.guarantee ? 'Yes' : 'No'}</div>
  )}
</div>

    </>
  )}
</section>

  </main>
)
}