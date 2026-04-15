
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import ImageUploader from '@/app/components/ImageUploader'
import { SortableImage } from '@/app/components/SortableImage'
import { DndContext, closestCenter, } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, arrayMove, } from '@dnd-kit/sortable'


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
  const buyerContact = artwork && contacts.find(c => c.id === artwork.buyer_contact_id) || null
  const destinationContact =   artwork && contacts.find(c => c.id === artwork.destination_contact_id) || null
  const proposedByContact = artwork && contacts.find(c => c.id === artwork.proposed_by_id) || null



type Document = {
  id: string
  artwork_id: string
  document_type: 'onedrive' | 'image'
  label: string | null
  url: string
  position: number
}


  const [documents, setDocuments] = useState<Document[]>([])
  const [newDocType, setNewDocType] = useState<'onedrive' | 'image'>('onedrive')
  const [newDocLabel, setNewDocLabel] = useState('')
  const [newDocUrl, setNewDocUrl] = useState('')

  
function handleDragEnd(event: any) {
  const { active, over } = event
  if (!over || active.id === over.id) return

  setDocuments(prev => {
    const images = prev
      .filter(d => d.document_type === 'image')
      .sort((a, b) => a.position - b.position)

    const oldIndex = images.findIndex(i => i.id === active.id)
    const newIndex = images.findIndex(i => i.id === over.id)

    const reordered = arrayMove(images, oldIndex, newIndex)

    const updatedImages = reordered.map((img, index) => ({
      ...img,
      position: index,
    }))

    // TODO: PATCH backend pour persister les positions

    return [
      ...prev.filter(d => d.document_type !== 'image'),
      ...updatedImages,
    ]
  })
}




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

    if (!res.ok) {
      const text = await res.text()
      console.error('Failed to load contacts:', res.status, text)
      return
    }

    const data = await res.json()
    setContacts(data)
  }

  loadContacts()
}, [])


useEffect(() => {
  if (!artwork?.id) return

  async function loadDocuments() {
    const res = await fetch(`/api/artworks/${artwork.id}/documents`, {
      credentials: 'include',
    })

    if (res.ok) {
      setDocuments(await res.json())
    }
  }

  loadDocuments()
}, [artwork?.id])


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
      guarantee: artwork.guarantee,
      bought: artwork.bought,
      buyer_contact_id: artwork.buyer_contact_id,
      cost_amount: artwork.cost_amount,
      cost_currency: artwork.cost_currency,
      destination_contact_id: artwork.destination_contact_id,
      date_proposition: artwork.date_proposition,
      proposed_by_id: artwork.proposed_by_id,
      view_date: artwork.view_date,
      condition: artwork.condition,
      certificate: artwork.certificate,
      certificate_location: artwork.certificate_location,
      check_seller: artwork.check_seller,
      notes: artwork.notes,
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


async function addDocument() {
  if (!artwork || !newDocUrl) return

  const res = await fetch(`/api/artworks/${artwork.id}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      document_type: newDocType,
      label: newDocLabel || null,
      url: newDocUrl,
    }),
  })

  if (res.ok) {
    const created = await res.json()
    setDocuments([...documents, created])
    setNewDocLabel('')
    setNewDocUrl('')
  }
}


async function deleteDocument(id: string) {
  await fetch(`/api/documents/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })

  setDocuments(documents.filter(d => d.id !== id))
}


const images = documents
  .filter(d => d.document_type === 'image')
  .sort((a, b) => a.position - b.position)

console.log('DEBUG: before return')



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

<section
  style={{
    marginBottom: 30,
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 6,
    color: 'black',
  }}
>
  {/* Date proposition */}
  <div style={{ marginBottom: 12 }}>
    <div style={{ color: '#777', fontSize: '0.9rem' }}>
      Date proposed
    </div>

    {isEditing ? (
      <input
        type="date"
        value={artwork.date_proposition || ''}
        onChange={(e) =>
          setArtwork({
            ...artwork,
            date_proposition: e.target.value || null,
          })
        }
      />
    ) : (
      <div>
        {artwork.date_proposition
          ? new Date(artwork.date_proposition).toLocaleDateString('fr-CH')
          : '—'}
      </div>
    )}
  </div>

  {/* Proposed by */}
  <div style={{ marginBottom: 12 }}>
    <div style={{ color: '#777', fontSize: '0.9rem' }}>
      Proposed by
    </div>

    {isEditing ? (
      <select
        value={artwork.proposed_by_id || ''}
        onChange={(e) =>
          setArtwork({
            ...artwork,
            proposed_by_id: e.target.value || null,
          })
        }
      >
        <option value="">—</option>
        {contacts.map(c => (
          <option key={c.id} value={c.id}>
            {c.company_name ||
              [c.first_name, c.last_name].filter(Boolean).join(' ')}
          </option>
        ))}
      </select>
    ) : (
      <div>
        {proposedByContact
          ? proposedByContact.company_name ||
            [proposedByContact.first_name, proposedByContact.last_name]
              .filter(Boolean)
              .join(' ')
          : '—'}
      </div>
    )}
  </div>

</section>

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

      <div>
        <div style={{ color: '#777', fontSize: '0.9rem', }}>Artist</div>
        <div>
          {artwork.artist
            ? [artwork.artist.first_name, artwork.artist.last_name]
                .filter(Boolean)
                .join(' ')
            : '—'}
            
        </div>
      </div> 

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
        width: 120,
        padding: '6px 8px',
        border: '1px solid #ccc',
        borderRadius: 4,
        }}
    />
  ) : (
    <div style={{ fontSize: '1rem' }}>
      {artwork.title || '—'}
    </div>
  )}
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

  {/* Viewing date */}
  <div>
    <div style={{ color: '#777', fontSize: '0.9rem' }}>
      Viewed on
    </div>

    {isEditing ? (
      <input
        type="date"
        value={artwork.view_date || ''}
        onChange={(e) =>
          setArtwork({
            ...artwork,
            view_date: e.target.value || null,
          })
        }
      />
    ) : (
      <div>
        {artwork.view_date
          ? new Date(artwork.view_date).toLocaleDateString('fr-CH')
          : '—'}
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
  <h2 style={{ marginBottom: 15 }}>Auction</h2>

  {/* Auction planned — TOUJOURS visible */}
  <div style={{ marginBottom: 12 }}>
    <div style={{ color: '#777', fontSize: '0.9rem' }}>
      Auction
    </div>

    {isEditing ? (
      
<select
  value={artwork.auctions ? 'yes' : 'no'}
  onChange={(e) => {
    const isAuction = e.target.value === 'yes'

    setArtwork({
      ...artwork,
      auctions: isAuction,

      // ✅ CLEANUP AUTOMATIQUE SI AUCTION = NO
      auction_contact_id: isAuction ? artwork.auction_contact_id : null,
      sale_date: isAuction ? artwork.sale_date : null,
      sale_time: isAuction ? artwork.sale_time : null,
      auction_link: isAuction ? artwork.auction_link : null,
      estimate_low: isAuction ? artwork.estimate_low : null,
      estimate_high: isAuction ? artwork.estimate_high : null,
      auction_currency: isAuction ? artwork.auction_currency : null,
      guarantee: isAuction ? artwork.guarantee : false,
    })
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
>
  <option value="">—</option>
  {contacts.map((c) => (
    <option key={c.id} value={c.id}>
      {c.company_name ||
        [c.first_name, c.last_name].filter(Boolean).join(' ')}
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
  <h2 style={{ marginBottom: 15 }}>Acquisition</h2>


<div style={{ marginBottom: 12 }}>
  <div style={{ color: '#777', fontSize: '0.9rem' }}>
    Bought
  </div>

  {isEditing ? (
    <select
      value={artwork.bought ? 'yes' : 'no'}

onChange={(e) => {
  const isBought = e.target.value === 'yes'

  setArtwork({
    ...artwork,
    bought: isBought,

    // ✅ CLEANUP automatique
    buyer_contact_id: isBought ? artwork.buyer_contact_id : null,
    cost_amount: isBought ? artwork.cost_amount : null,
    cost_currency: isBought ? artwork.cost_currency : null,
    destination_contact_id: isBought
      ? artwork.destination_contact_id
      : null,
  })
}}

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
    <div>{artwork.bought ? 'Yes' : 'No'}</div>
  )}
</div>



{/* ⬇️ CHAMPS APPLICABLES UNIQUEMENT SI BOUGHT = YES */}
{artwork.bought === true && (
  <>
    {/* Buyer */}
    <div style={{ marginBottom: 12 }}>
      <div style={{ color: '#777', fontSize: '0.9rem' }}>Buyer</div>

      {isEditing ? (
        <select
          value={artwork.buyer_contact_id || ''}
          onChange={(e) =>
            setArtwork({
              ...artwork,
              buyer_contact_id: e.target.value || null,
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
          {buyerContact
            ? buyerContact.company_name ||
              [buyerContact.first_name, buyerContact.last_name]
                .filter(Boolean)
                .join(' ')
            : '—'}
        </div>
      )}
    </div>

    {/* Cost */}
    <div style={{ marginBottom: 12 }}>
      <div style={{ color: '#777', fontSize: '0.9rem' }}>Cost</div>

      {isEditing ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            placeholder="Amount"
            value={artwork.cost_amount ?? ''}
            onChange={(e) =>
              setArtwork({
                ...artwork,
                cost_amount: e.target.value
                  ? Number(e.target.value)
                  : null,
              })
            }
          />

          <select
            value={artwork.cost_currency || ''}
            onChange={(e) =>
              setArtwork({
                ...artwork,
                cost_currency: e.target.value || null,
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
          {artwork.cost_amount
            ? `${artwork.cost_currency} ${new Intl.NumberFormat('fr-CH').format(
                artwork.cost_amount
              )}`
            : '—'}
        </div>
      )}
    </div>

    {/* Destination */}
    <div>
      <div style={{ color: '#777', fontSize: '0.9rem' }}>Destination</div>

      {isEditing ? (
        <select
          value={artwork.destination_contact_id || ''}
          onChange={(e) =>
            setArtwork({
              ...artwork,
              destination_contact_id:
                e.target.value || null,
            })
          }
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
          {destinationContact
            ? destinationContact.company_name ||
              [destinationContact.first_name, destinationContact.last_name]
                .filter(Boolean)
                .join(' ')
            : '—'}
        </div>
      )}
    </div>
  </>
)}
 
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
  <h2 style={{ marginBottom: 15 }}>Condition & Certificate</h2>

  {/* Condition */}
  <div style={{ marginBottom: 12 }}>
    <div style={{ color: '#777', fontSize: '0.9rem' }}>Condition</div>

    {isEditing ? (
      <textarea
        value={artwork.condition || ''}
        onChange={(e) =>
          setArtwork({ ...artwork, condition: e.target.value })
        }
        style={{ width: '100%' }}
      />
    ) : (
      <div>{artwork.condition || '—'}</div>
    )}
  </div>

  {/* Certificate */}
  <div style={{ marginBottom: 12 }}>
    <div style={{ color: '#777', fontSize: '0.9rem' }}>
      Certificate
    </div>

    {isEditing ? (
      <select
        value={artwork.certificate ? 'yes' : 'no'}
        onChange={(e) =>
          setArtwork({
            ...artwork,
            certificate: e.target.value === 'yes',
            certificate_location:
              e.target.value === 'yes'
                ? artwork.certificate_location
                : null,
          })
        }
      >
        <option value="no">No</option>
        <option value="yes">Yes</option>
      </select>
    ) : (
      <div>{artwork.certificate ? 'Yes' : 'No'}</div>
    )}
  </div>

  {/* Certificate location */}
  {artwork.certificate === true && (
    <div>
      <div style={{ color: '#777', fontSize: '0.9rem' }}>
        Certificate location
      </div>

      {isEditing ? (
        <input
          type="text"
          value={artwork.certificate_location || ''}
          onChange={(e) =>
            setArtwork({
              ...artwork,
              certificate_location: e.target.value || null,
            })
          }
        />
      ) : (
        <div>{artwork.certificate_location || '—'}</div>
      )}
    </div>
  )}
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
  <h2 style={{ marginBottom: 15 }}>Checks</h2>

  <div>
    <div style={{ color: '#777', fontSize: '0.9rem' }}>
      Seller checked
    </div>

    {isEditing ? (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={!!artwork.check_seller}
          onChange={(e) =>
            setArtwork({
              ...artwork,
              check_seller: e.target.checked,
            })
          }
        />
        <span>Seller verified</span>
      </label>
    ) : (
      <div>{artwork.check_seller ? 'Yes' : 'No'}</div>
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
  <h2 style={{ marginBottom: 15 }}>Notes</h2>

  {isEditing ? (
    <textarea
      value={artwork.notes || ''}
      onChange={(e) =>
        setArtwork({ ...artwork, notes: e.target.value })
      }
      style={{ width: '100%', minHeight: 100 }}
    />
  ) : (
    <div>{artwork.notes || '—'}</div>
  )}
</section>



<section
  style={{
    marginBottom: 30,
    padding: '20px 24px',
    backgroundColor: 'white',
    borderRadius: 8,
    color: 'black',
  }}
>
  <h2 style={{ marginBottom: 16 }}>Documents</h2>

  {/* LISTE DES DOCUMENTS (OneDrive uniquement) */}
  {documents.filter(d => d.document_type === 'onedrive').length === 0 ? (
    <div style={{ color: '#777', fontStyle: 'italic' }}>
      No documents
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {documents
        .filter(d => d.document_type === 'onedrive')
        .map(doc => (
          <div
            key={doc.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 12px',
              border: '1px solid #e0e0e0',
              borderRadius: 6,
              backgroundColor: '#fafafa',
            }}
          >
            {/* Label */}
            <div
              style={{
                flex: 1,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={doc.label || 'Untitled'}
            >
              {doc.label || 'Untitled'}
            </div>

            {/* Lien */}
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 14,
                color: '#0070f3',
                textDecoration: 'none',
              }}
            >
              Open
            </a>

            {/* Delete (mode édition) */}
            {isEditing && (
              <button
                onClick={() => deleteDocument(doc.id)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#999',
                  cursor: 'pointer',
                  fontSize: 16,
                }}
                title="Delete document"
              >
                ×
              </button>
            )}
          </div>
        ))}
    </div>
  )}

  {/* AJOUT DOCUMENT */}
  {isEditing && (
    <div
      style={{
        marginTop: 20,
        paddingTop: 16,
        borderTop: '1px dashed #ddd',
      }}
    >
      <h3 style={{ marginBottom: 8 }}>Add document</h3>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Label (optional)"
          value={newDocLabel}
          onChange={(e) => setNewDocLabel(e.target.value)}
          style={{ flex: 1 }}
        />

        <input
          type="url"
          placeholder="OneDrive URL"
          value={newDocUrl}
          onChange={(e) => setNewDocUrl(e.target.value)}
          style={{ flex: 2 }}
        />

        <button onClick={addDocument}>
          Add
        </button>
      </div>
    </div>
  )}
</section>





<section
  style={{
    marginBottom: 30,
    padding: '20px 24px',
    backgroundColor: 'white',
    borderRadius: 8,
    color: 'black',
  }}
>
  <h2 style={{ marginBottom: 16 }}>Images</h2>

  {images.length === 0 ? (
    <div style={{ color: '#777', fontStyle: 'italic' }}>
      No images
    </div>
  ) : (
    <DndContext
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={images.map(img => img.id)}
        strategy={rectSortingStrategy}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 12,
            marginBottom: 20,
          }}
        >
          {images.map(img => (
            <SortableImage
              key={img.id}
              image={img}
              isEditing={isEditing}
              onDelete={deleteDocument}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )}

  {isEditing && artwork && (
    <div
      style={{
        marginTop: 10,
        paddingTop: 16,
        borderTop: '1px dashed #ddd',
      }}
    >
      <ImageUploader
        artworkId={artwork.id}
        onUploaded={(doc) =>
          setDocuments(prev => [...prev, doc])
        }
      />
    </div>
  )}
</section>


  </main>
)
}




