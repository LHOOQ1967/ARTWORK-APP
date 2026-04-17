
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import ImageUploader from '@/app/components/ImageUploader'
import { SortableDocument } from '@/app/components/SortableDocument'
import { SortableImage } from '@/app/components/SortableImage'
import { DndContext, closestCenter, } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, rectSortingStrategy, arrayMove, } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { ArtworkSection } from '@/app/components/artwork/ArtworkSection'

import { EditModeProvider, useEditMode } from '@/app/contexts/EditModeContext'

export default function ArtworkDetailPage() {
  return (
    <EditModeProvider>
      <ArtworkDetailContent />
    </EditModeProvider>
  )
}



function ActionButton({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        backgroundColor: '#f3f3f3',
        border: '1px solid #ccc',
        borderRadius: 4,
        padding: '6px 12px',
        fontSize: '0.9rem',
        cursor: 'pointer',
        color: '#333',
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.backgroundColor = '#e9e9e9')
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.backgroundColor = '#f3f3f3')
      }
      onFocus={(e) =>
        (e.currentTarget.style.boxShadow = '0 0 0 2px #ddd')
      }
      onBlur={(e) =>
        (e.currentTarget.style.boxShadow = 'none')
      }
    >
      {children}
    </button>
  )
}


function HeaderActions() {
  const { isEditing, toggle } = useEditMode()

  return (
    <ActionButton
      onClick={() => {
      
        toggle()
      }}
      style={{
        padding: '6px 12px',
        marginRight: 10,
      }}
    >
      {isEditing ? 'Cancel' : 'Edit'}
    </ActionButton>
  )
}



function InlineRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '160px 1fr',
        alignItems: 'flex-start', // ✅ CRUCIAL
        gap: 12,
        marginBottom: 10,
      }}
    >
      <div
        style={{
          color: '#777',
          fontSize: '0.9rem',
          whiteSpace: 'nowrap',
          paddingTop: 2, // ✅ micro-alignement optique
        }}
      >
        {label}
      </div>

      {/* ✅ Forcer la colonne Value à être un bloc vertical */}
      <div style={{ minWidth: 0 }}>
        {children}
      </div>
    </div>
  )
}



function ArtworkDetailContent() {
  const { isEditing, setIsEditing, toggle } = useEditMode()
  const params = useParams() as { id?: string }
  const id = params?.id ?? null

  const [contacts, setContacts] = useState<Contact[]>([])
  const [artwork, setArtwork] = useState<Artwork | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openImage, setOpenImage] = useState<string | null>(null)

  const STATUS_OPTIONS = ['draft', 'viewed', 'negotiation', 'bought']
  const PRIORITY_OPTIONS = ['low', 'medium', 'high']
  const CURRENCY_OPTIONS = ['CHF', 'EUR', 'USD', 'GBP']

  const auctionContact =
    contacts.find(c => c.id === artwork?.auction_contact_id) || null

  const buyerContact =
    artwork && contacts.find(c => c.id === artwork.buyer_contact_id) || null

  const destinationContact =
    artwork &&
    contacts.find(c => c.id === artwork.destination_contact_id) ||
    null

  const proposedByContact =
    artwork && contacts.find(c => c.id === artwork.proposed_by_id) || null

  const [artists, setArtists] = useState<Artist[]>([])

  // 👉 le reste de ton code (useEffects, handlers, JSX, etc.)



type Artwork = {
  id: string
  title: string
}




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
  const [newProposalContactId, setNewProposalContactId] = useState('');
  const [newProposedAt, setNewProposedAt] = useState('');

  
async function handleImagesDragEnd(event: any) {
  const { active, over } = event
  if (!over || active.id === over.id) return

  const currentImages = documents
    .filter(d => d.document_type === 'image')
    .sort((a, b) => a.position - b.position)

  const oldIndex = currentImages.findIndex(img => img.id === active.id)
  const newIndex = currentImages.findIndex(img => img.id === over.id)

  if (oldIndex === -1 || newIndex === -1) return

  const reordered = arrayMove(currentImages, oldIndex, newIndex)

  const updatedImages = reordered.map((img, index) => ({
    ...img,
    position: index,
  }))

  setDocuments(prev => [
    ...prev.filter(d => d.document_type !== 'image'),
    ...updatedImages,
  ])

  try {
    await fetch('/api/documents/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        updatedImages.map(img => ({ id: img.id, position: img.position }))
      ),
    })
  } catch (err) {
    console.error(err)
  }
}
``



async function handleDocumentsDragEnd(event: any) {
  const { active, over } = event
  if (!over || active.id === over.id) return

  const currentDocs = documents
    .filter(d => d.document_type === 'onedrive')
    .sort((a, b) => a.position - b.position)

  const oldIndex = currentDocs.findIndex(d => d.id === active.id)
  const newIndex = currentDocs.findIndex(d => d.id === over.id)

  if (oldIndex === -1 || newIndex === -1) return

  const reordered = arrayMove(currentDocs, oldIndex, newIndex)

  const updatedDocs = reordered.map((doc, index) => ({
    ...doc,
    position: index,
  }))

  // UI immédiate
  setDocuments(prev => [
    ...prev.filter(d => d.document_type !== 'onedrive'),
    ...updatedDocs,
  ])

  // Persistance (même API que les images ✅)
  const payload = updatedDocs.map(doc => ({
    id: doc.id,
    position: doc.position,
  }))

  try {
    const res = await fetch('/api/documents/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      console.error(await res.text())
    }
  } catch (err) {
    console.error(err)
  }
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

        
setArtwork({
  ...data,
  artist_id: data.artist_id ?? data.artist?.id ?? null,
})

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

    console.log('CONTACTS LOADED:', data) // ✅ AJOUT ICI

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




useEffect(() => {
  async function loadArtists() {
    const res = await fetch('/api/artists/search?q=')
    if (res.ok) {
      const data = await res.json()
      console.log('ARTISTS LOADED:', data)
      setArtists(data)
    }
  }

  loadArtists()
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
      dimensions: artwork.dimensions,
      location_contact_id: artwork.location_contact_id,
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
      buyer_contact_id: artwork.buyer_contact_id,
      cost_amount: artwork.cost_amount,
      cost_currency: artwork.cost_currency,
      destination_contact_id: artwork.destination_contact_id,
      date_proposition: artwork.date_proposition,
      proposed_by_id: artwork.proposed_by_id,
      view_date: artwork.view_date,
      condition: artwork.condition,
      certificate: artwork.certificate,
      certificate_location_contact_id: artwork.certificate_location_contact_id,
      check_seller: artwork.check_seller,
      notes: artwork.notes,
      artist_id: artwork.artist_id,
      insurance_value: artwork.insurance_value,
      insurance_currency: artwork.insurance_currency,
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



async function addProposal() {
  if (!newProposalContactId) {
    alert('Please select a contact');
    return;
  }

  const res = await fetch(
    `/api/artworks/${artwork.id}/proposals`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact_id: newProposalContactId,
        proposed_at: newProposedAt || null,
      }),
    }
  );

  if (!res.ok) {
    const error = await res.json();
    console.error('Add proposal failed:', error);
    alert(error.error || 'Failed to add proposal');
    return;
  }

  // ✅ reload artwork
  const refreshed = await fetch(`/api/artworks/${artwork.id}`);
  setArtwork(await refreshed.json());

  // reset UI
  setNewProposalContactId('');
  setNewProposedAt('');
}


async function removeProposal(proposalId: string) {
  const confirmed = confirm('Remove this proposal?')
  if (!confirmed) return

  const res = await fetch(
    `/api/artworks/${artwork.id}/proposals/${proposalId}`,
    {
      method: 'DELETE',
    }
  )

  if (!res.ok) {
    const err = await res.json()
    alert(err.error || 'Failed to remove proposal')
    return
  }

  // ✅ Recharger l'artwork
  const refreshed = await fetch(`/api/artworks/${artwork.id}`)
  setArtwork(await refreshed.json())
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

const onedriveDocuments = documents
  .filter(d => d.document_type === 'onedrive')
  .sort((a, b) => a.position - b.position)

  
const editInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid #ccc',
  borderRadius: 4,
  fontSize: '0.95rem',
};

const isBought = artwork.status === 'bought'

return (
  <main
        style={{
      padding: 40,
      minHeight: '100vh',
      backgroundColor: '#007a5e',
      color: 'white',
    }}
  >
    
<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 20 }}>

<ActionButton
  onClick={() => { toggle()
  }}
>
  {isEditing ? 'Cancel' : 'Edit'}
</ActionButton>


  {isEditing && (
    <ActionButton
      onClick={saveArtwork}
      style={{
        padding: '6px 12px',
        borderRadius: 4,
        border: '1px solid #ccc',
        cursor: 'pointer',
      }}
    >
      Save
    </ActionButton>
  )}
</div>






<section
  style={{
    marginBottom: 30,
    padding: 16,
    backgroundColor: '#f7f7f7',
    borderRadius: 6,
    color: 'black',
  }}
>
  <h2 style={{ marginBottom: 15 }}>Proposal</h2>

  {/* Date proposed */}
  <InlineRow label="Date proposed">
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
        style={editInputStyle}
      />
    ) : artwork.date_proposition ? (
      new Date(artwork.date_proposition).toLocaleDateString('fr-CH')
    ) : (
      '—'
    )}
  </InlineRow>

  {/* Proposed by */}
  <InlineRow label="Proposed by">
    {isEditing ? (
      <select
        value={artwork.proposed_by_id || ''}
        onChange={(e) =>
          setArtwork({
            ...artwork,
            proposed_by_id: e.target.value || null,
          })
        }
        style={editInputStyle}
      >
        <option value="">—</option>
        {contacts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.company_name ||
              [c.first_name, c.last_name].filter(Boolean).join(' ')}
          </option>
        ))}
      </select>
    ) : proposedByContact ? (
      proposedByContact.company_name ||
      [proposedByContact.first_name, proposedByContact.last_name]
        .filter(Boolean)
        .join(' ')
    ) : (
      '—'
    )}
  </InlineRow>

  {/* Proposed to */}



<InlineRow label="Proposed to">
  {!artwork.artwork_proposals || artwork.artwork_proposals.length === 0 ? (
    <span style={{ color: '#777', fontStyle: 'italic' }}>
      Not proposed yet
    </span>
  ) : (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {artwork.artwork_proposals.map((p) => (
        <div
          key={p.id}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
          }}
        >
          {/* ✅ Nom + date */}
          <span style={{ fontWeight: 500 }}>
            {p.contact.company_name ||
              [p.contact.first_name, p.contact.last_name]
                .filter(Boolean)
                .join(' ')}
          </span>

          <span style={{ fontSize: '0.85rem', color: '#666' }}>
            ({new Date(p.proposed_at).toLocaleDateString('fr-CH')})
          </span>

          {/* ✅ Delete — EDIT ONLY */}
          {isEditing && (
            <button
              onClick={() => removeProposal(p.id)}
              style={{
                marginLeft: 6,
                border: 'none',
                background: 'none',
                color: '#999',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
              title="Remove proposal"
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  )}
</InlineRow>



  {/* Add proposal (EDIT ONLY) */}
  {isEditing && (
    <InlineRow label="">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select
          value={newProposalContactId}
          onChange={(e) => setNewProposalContactId(e.target.value)}
        >
          <option value="">— Select contact —</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.company_name ||
                [c.first_name, c.last_name].filter(Boolean).join(' ')}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={newProposedAt}
          onChange={(e) => setNewProposedAt(e.target.value)}
        />

        <button onClick={addProposal}>Add</button>
      </div>
    </InlineRow>
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
  
  {images.length === 0 ? (
    <div style={{ color: '#777', fontStyle: 'italic' }}>
      No images
    </div>
  ) : (
    <DndContext
      collisionDetection={closestCenter}
      onDragEnd={handleImagesDragEnd}
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
              onOpen={setOpenImage}
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
        borderTop: '2px dashed #ddd',
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
 
      <ArtworkSection
        artwork={artwork}
        isEditing={isEditing}
        setArtwork={setArtwork}
        artists={artists}
        contacts={contacts}
      />


<section
  style={{
    marginBottom: 30,
    padding: 20,
    backgroundColor: '#f7f7f7',
    borderRadius: 6,
    color: 'black',
  }}
>
  <h2 style={{ marginBottom: 15 }}>Auction</h2>

  {/* Auction Yes / No — sans label */}


<div
  style={{
    display: 'grid',
    gridTemplateColumns: '160px 1fr',
    alignItems: 'center',
    marginBottom: 12,
  }}
>
  {/* Colonne gauche */}
  <div>
    {isEditing ? (
      <select
        value={artwork.auctions ? 'yes' : 'no'}
        onChange={(e) => {
          const isAuction = e.target.value === 'yes'

          setArtwork({
            ...artwork,
            auctions: isAuction,
            auction_contact_id: isAuction
              ? artwork.auction_contact_id
              : null,
            sale_date: isAuction ? artwork.sale_date : null,
            sale_time: isAuction ? artwork.sale_time : null,
            auction_link: isAuction ? artwork.auction_link : null,
            estimate_low: isAuction ? artwork.estimate_low : null,
            estimate_high: isAuction ? artwork.estimate_high : null,
            auction_currency: isAuction
              ? artwork.auction_currency
              : null,
            guarantee: isAuction ? artwork.guarantee : false,
          })
        }}
        style={{ ...editInputStyle, width: 90 }}
      >
        <option value="no">No</option>
        <option value="yes">Yes</option>
      </select>
    ) : (
      <div>{artwork.auctions ? 'Yes' : 'No'}</div>
    )}
  </div>

  {/* Colonne droite — alignée exactement avec “Blondeau” */}
  <a
    href="https://buyerspremium.blondeau.ch/auction_time.php"
    target="_blank"
    rel="noopener noreferrer"
    style={{
      color: '#555',
      textDecoration: 'underline',
      fontSize: '0.85rem',
      cursor: 'pointer',
      width: 'fit-content',
    }}
  >
    Calculate auction time
  </a>
</div>


<div
  style={{
    borderTop: '1px solid #e5e5e53a',
    margin: '8px 0 12px 0',
  }}
/>


  {/* Auction details */}
  {artwork.auctions && (
    <>
      {/* Auction house */}
      <InlineRow label="Auction house">
        {isEditing ? (
          <select
            value={artwork.auction_contact_id || ''}
            onChange={(e) =>
              setArtwork({
                ...artwork,
                auction_contact_id: e.target.value || null,
              })
            }
            style={editInputStyle}
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
      </InlineRow>

      {/* Sale date */}
      <InlineRow label="Sale date">
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
            style={editInputStyle}
          />
        ) : (
          <div>
            {artwork.sale_date
              ? new Date(artwork.sale_date).toLocaleDateString('fr-CH')
              : '—'}
          </div>
        )}
      </InlineRow>

      {/* Sale time */}
      <InlineRow label="Sale time">
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
            style={editInputStyle}
          />
        ) : (
          <div>{artwork.sale_time || '—'}</div>
        )}
      </InlineRow>

      {/* Auction website */}

<InlineRow label="Auction website">
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
      style={editInputStyle}
    />
  ) : artwork.auction_link ? (
    <a
      href={artwork.auction_link}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: '#007a5e',
        textDecoration: 'underline',
        wordBreak: 'break-all',
      }}
    >
      {new URL(artwork.auction_link).hostname}
    </a>
  ) : (
    '—'
  )}
</InlineRow>


      {/* Estimate */}
      <InlineRow label="Estimate">
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
                <option key={c} value={c}>
                  {c}
                </option>
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
      </InlineRow>

      {/* Guarantee */}
      <InlineRow label="Guarantee">
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
      </InlineRow>
    </>
  )}
</section>

<section
  style={{
    marginBottom: 30,
    padding: 20,
    backgroundColor: '#f7f7f7',
    borderRadius: 6,
    color: 'black',
  }}
>
  <h2 style={{ marginBottom: 15 }}>Market</h2>

  {/* ✅ Currency — EDIT ONLY */}
  {isEditing && (
    <InlineRow label="Currency">
      <select
        value={artwork.currency || ''}
        onChange={(e) =>
          setArtwork({
            ...artwork,
            currency: e.target.value,
          })
        }
        style={editInputStyle}
      >
        <option value="">—</option>
        {CURRENCY_OPTIONS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </InlineRow>
  )}


  {/* Asking price */}
  <InlineRow label="Asking price">
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
        style={{ ...editInputStyle, width: 160 }}
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
  </InlineRow>


  {/* Priority */}
  <InlineRow label="Priority">
    {isEditing ? (
      <select
        value={artwork.priority || ''}
        onChange={(e) =>
          setArtwork({ ...artwork, priority: e.target.value })
        }
        style={editInputStyle}
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
  </InlineRow>

  {/* Status */}

<InlineRow label="Status">
  {isEditing ? (
    <select
      value={artwork.status || ''}
      onChange={(e) => {
        const newStatus = e.target.value

        setArtwork({
          ...artwork,
          status: newStatus,
        })
      }}
      style={editInputStyle}
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
</InlineRow>


</section>



<section
  style={{
    marginBottom: 30,
    padding: 20,
    backgroundColor: '#f7f7f7',
    borderRadius: 6,
    color: 'black',
  }}
>
  <h2 style={{ marginBottom: 15 }}>Acquisition</h2>

  {(() => {
    const isBought = artwork.status === 'bought'

    return (
      <>
        {!isBought && (
          <InlineRow label="Bought">
            <div>No</div>
          </InlineRow>
        )}

        {isBought && (
          <>
            <InlineRow label="Bought">
              <div>Yes</div>
            </InlineRow>

            {/* Buyer */}
            <InlineRow label="Buyer">
              {isEditing ? (
                <select
                  value={artwork.buyer_contact_id || ''}
                  onChange={(e) =>
                    setArtwork({
                      ...artwork,
                      buyer_contact_id: e.target.value || null,
                    })
                  }
                  style={editInputStyle}
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
                buyerContact
                  ? buyerContact.company_name ||
                    [buyerContact.first_name, buyerContact.last_name]
                      .filter(Boolean)
                      .join(' ')
                  : '—'
              )}
            </InlineRow>

            {/* Cost */}
            <InlineRow label="Cost">
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
                    style={{ ...editInputStyle, width: 140 }}
                  />

                  <select
                    value={artwork.cost_currency || ''}
                    onChange={(e) =>
                      setArtwork({
                        ...artwork,
                        cost_currency: e.target.value || null,
                      })
                    }
                    style={editInputStyle}
                  >
                    <option value="">—</option>
                    {CURRENCY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                artwork.cost_amount
                  ? `${artwork.cost_currency} ${new Intl.NumberFormat(
                      'fr-CH'
                    ).format(artwork.cost_amount)}`
                  : '—'
              )}
            </InlineRow>



            {/* Insurance */}
            <InlineRow label="Insurance">
              {isEditing ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="number"
                    placeholder="Amount"
                    value={artwork.insurance_value ?? ''}
                    onChange={(e) =>
                      setArtwork({
                        ...artwork,
                        insurance_value: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                    style={{ ...editInputStyle, width: 140 }}
                  />

                  <select
                    value={artwork.insurance_currency || ''}
                    onChange={(e) =>
                      setArtwork({
                        ...artwork,
                        insurance_currency: e.target.value || null,
                      })
                    }
                    style={editInputStyle}
                  >
                    <option value="">—</option>
                    {CURRENCY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              ) : artwork.insurance_value ? (
                `${artwork.insurance_currency} ${new Intl.NumberFormat(
                  'fr-CH'
                ).format(artwork.insurance_value)}`
              ) : (
                '—'
              )}
            </InlineRow>


            {/* Destination */}
            <InlineRow label="Destination">
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
                  style={editInputStyle}
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
                destinationContact
                  ? destinationContact.company_name ||
                    [destinationContact.first_name,
                      destinationContact.last_name]
                      .filter(Boolean)
                      .join(' ')
                  : '—'
              )}
            </InlineRow>
          </>
        )}
      </>
    )
  })()}
</section>

<section
  style={{
    marginBottom: 30,
    padding: 20,
    backgroundColor: '#f7f7f7',
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
    backgroundColor: '#f7f7f7',
    borderRadius: 8,
    color: 'black',
  }}
>
  <h2 style={{ marginBottom: 16 }}>Documents</h2>

  {documents.filter(d => d.document_type === 'onedrive').length === 0 ? (
    <div style={{ color: '#777', fontStyle: 'italic' }}>
      No documents
    </div>
  ) : (
    <DndContext
      collisionDetection={closestCenter}
      onDragEnd={handleDocumentsDragEnd}
    >
      <SortableContext
        items={documents
          .filter(d => d.document_type === 'onedrive')
          .sort((a, b) => a.position - b.position)
          .map(d => d.id)}
        strategy={verticalListSortingStrategy}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {documents
            .filter(d => d.document_type === 'onedrive')
            .sort((a, b) => a.position - b.position)
            .map(doc => (
              <SortableDocument
                key={doc.id}
                document={doc}
                isEditing={isEditing}
                onDelete={deleteDocument}
              />
            ))}
        </div>
      </SortableContext>
    </DndContext>
  )}

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
          onChange={e => setNewDocLabel(e.target.value)}
          style={{ flex: 1 }}
        />

        <input
          type="url"
          placeholder="OneDrive URL"
          value={newDocUrl}
          onChange={e => setNewDocUrl(e.target.value)}
          style={{ flex: 2 }}
        />

        <ActionButton onClick={addDocument}>
          Add
        </ActionButton>
      </div>
    </div>
  )}
</section>


{openImage && (
  <div
    onClick={() => setOpenImage(null)}
    style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      cursor: 'zoom-out',
    }}
  >
    <img
      src={openImage}
      alt=""
      style={{
        maxWidth: '90vw',
        maxHeight: '90vh',
        objectFit: 'contain',
        boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
      }}
      onClick={(e) => e.stopPropagation()}
    />
  </div>
)}
  </main>
)
}




