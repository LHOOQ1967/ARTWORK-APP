
'use client'



import { ArtworkSection } from './ArtworkSection'
import { useEffect, useState } from 'react'
import { useEditMode } from '@/app/contexts/EditModeContext'
import ImageUploader from '@/app/components/ImageUploader'
import { DndContext, closestCenter } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { SortableImage } from '@/app/components/SortableImage'
import { SortableDocument } from '@/app/components/SortableDocument'
import { fetchWithAuth } from '@/lib/fetchWithAuth'


// ✅ types
type Props = {
  artworkId?: string | null
}


type Document = {
  id: string
  artwork_id: string
  document_type: 'onedrive' | 'image'
  label: string | null
  url: string
  position: number
}



// ✅ constante hors composant
const EMPTY_ARTWORK = {
  title: '',
  medium: null,
  year_execution: null,
  dimensions: null,
  signature: null,
  status: 'draft',
  priority: 'medium',
  auctions: false,
  asking_price: null,
  currency: 'CHF',
  artist_id: null,
  date_proposition: null,
}


function ActionButton({
  children,
  onClick,
  style,
}: {
  children: React.ReactNode
  onClick?: () => void
  style?: React.CSSProperties
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
        ...style,
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
      onBlur={(e) => (e.currentTarget.style.boxShadow = 'none')}
    >
      {children}
    </button>
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
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 10,
      }}
    >
      <div
        style={{
          color: '#777',
          fontSize: '0.9rem',
          whiteSpace: 'nowrap',
          paddingTop: 2,
        }}
      >
        {label}
      </div>

      <div style={{ minWidth: 0 }}>
        {children}
      </div>
    </div>
  )
}


export default function ArtworkDetailContent({ artworkId }: Props) {
  // ✅ ID & mode
  const id = artworkId ?? null
  const isNew = !id

  // ✅ edit mode
  const { isEditing, setIsEditing, toggle } = useEditMode()

  // ✅ state minimum vital
  const [artwork, setArtwork] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [artists, setArtists] = useState<Artist[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [openImage, setOpenImage] = useState<string | null>(null)
  const CURRENCY_OPTIONS = ['CHF', 'EUR', 'USD', 'GBP']
  
const [newDocType, setNewDocType] = useState<'onedrive' | 'image'>('onedrive')
  
const [newDocLabel, setNewDocLabel] = useState('')
const [newDocUrl, setNewDocUrl] = useState('')

  
const PRIORITY_OPTIONS = ['Information', 'medium', 'high']
const STATUS_OPTIONS = ['draft', 'viewed', 'negotiation', 'bought', 'archived']

  
const [newProposalContactId, setNewProposalContactId] = useState('')
const [newProposedAt, setNewProposedAt] = useState('')

const buyerContact =  artwork && contacts.find(c => c.id === artwork.buyer_contact_id) || null
const destinationContact =  artwork && contacts.find(c => c.id === artwork.destination_contact_id) || null
const proposedByContact =   artwork && contacts.find(c => c.id === artwork.proposed_by_id) || null

  

  // ✅ MODE CRÉATION
  useEffect(() => {
    if (isNew) {
      setArtwork(EMPTY_ARTWORK)
      setIsEditing(true)
      setLoading(false)
      return
    }
  }, [isNew, setIsEditing])

  // ✅ MODE ÉDITION
  useEffect(() => {
    if (!id) return

    async function loadArtwork() {
      try {
        const res = await fetchWithAuth(`/api/artworks/${id}`)
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
 
 


const [localArtwork, setLocalArtwork] =
  useState<Artwork>(artwork)



 
 
 useEffect(() => {
   if (!id) {
     setArtwork(EMPTY_ARTWORK)
     setIsEditing(true)
     setLoading(false)
     return
   }
 
   async function loadArtwork() {
     try {
       const res = await fetchWithAuth(`/api/artworks/${id}`)
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
     const res = await fetchWithAuth('/api/contacts', {
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
     const res = await fetchWithAuth(`/api/artworks/${artwork.id}/documents`, {
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
     const res = await fetchWithAuth('/api/artists/search?q=')
     if (res.ok) {
       const data = await res.json()
 
       setArtists(data)
     }
   }
 
   loadArtists()
 }, [])
 
 
 
 
 async function saveArtwork() {
   if (!artwork) return
 
   const payload = {
     title: artwork.title,
     medium: artwork.medium,
     signature: artwork.signature,
     year_execution: artwork.year_execution,
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
     auction_currency: artwork.auction_currency,
     sold_hammer: artwork.sold_hammer,
     sold_premium: artwork.sold_premium,
     underbidder: artwork.underbidder,
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
     height_cm: artwork.height_cm || null,
     width_cm: artwork.width_cm || null,
     depth_cm: artwork.depth_cm || null,
   }
 
   const res = await fetchWithAuth(
     isNew
       ? '/api/artworks'
       : `/api/artworks/${artwork.id}`,
     {
       method: isNew ? 'POST' : 'PATCH',
       headers: { 'Content-Type': 'application/json' },
       credentials: 'include',
       body: JSON.stringify(payload),
     }
   )
 
   if (!res.ok) {
     const text = await res.text()
     console.error('SAVE ARTWORK FAILED:', text)
     alert('Failed to save artwork')
     return
   }
 
   const saved = await res.json()
 
   if (isNew) {
     // ✅ Après création → aller vers la page complète de l’œuvre
     window.location.href = `/artworks/${saved.id}`
   } else {
     // ✅ Édition classique
     setIsEditing(false)
   }
 }
 
 
 
   if (loading) {
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
 
   const res = await fetchWithAuth(
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
   const refreshed = await fetchWithAuth(`/api/artworks/${artwork.id}`);
   setArtwork(await refreshed.json());
 
   // reset UI
   setNewProposalContactId('');
   setNewProposedAt('');
 }
 
 
 async function removeProposal(proposalId: string) {
   const confirmed = confirm('Remove this proposal?')
   if (!confirmed) return
 
   const res = await fetchWithAuth(
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
   const refreshed = await fetchWithAuth(`/api/artworks/${artwork.id}`)
   setArtwork(await refreshed.json())
 }
 
 
 
 async function addDocument() {
   if (!artwork || !newDocUrl) return
 
   const res = await fetchWithAuth(`/api/artworks/${artwork.id}/documents`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     credentials: 'include',
     body: JSON.stringify({
       document_type: newDocType,
       label: newDocLabel || null,
       url: newDocUrl,
       position: documents.filter(d => d.document_type === newDocType).length,
     }),
   })
 
   if (!res.ok) {
     const text = await res.text()
     console.error('ADD DOCUMENT FAILED:', res.status, text)
     alert(text)
     return
   }
 
   const created = await res.json()
   setDocuments([...documents, created])
   setNewDocLabel('')
   setNewDocUrl('')
 }
 
 
async function deleteArtwork() {
  if (!artwork?.id) return

  const confirmed = confirm(
    'Are you sure you want to delete this artwork?\nThis action is irreversible.'
  )

  if (!confirmed) return

  const res = await fetchWithAuth(`/api/artworks/${artwork.id}`, {
    method: 'DELETE',
    credentials: 'include',
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('DELETE ARTWORK FAILED:', text)
    alert('Failed to delete artwork')
    return
  }

  // ✅ Retour à la liste
  window.location.href = '/artworks'
}

 
 async function deleteDocument(id: string) {
   await fetchWithAuth(`/api/documents/${id}`, {
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
 
 
  if (loading) {
    return <p style={{ padding: 40 }}>Loading artwork…</p>
  }

  if (!artwork) {
    return <p style={{ padding: 40 }}>Artwork not found</p>
  }



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
    position: index + 1,
  }))

  // ✅ Mise à jour UI immédiate
  setDocuments(prev => [
    ...prev.filter(d => d.document_type !== 'image'),
    ...updatedImages,
  ])

  // ✅ Persistance backend
  try {
    await fetchWithAuth('/api/documents/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        updatedImages.map(img => ({
          id: img.id,
          position: img.position,
        }))
      ),
    })
  } catch (err) {
    console.error(err)
  }
}


async function handleDocumentsDragEnd(event: any) {
  const { active, over } = event

  /* 1️⃣ Sécurités DnD — indispensables */
  if (!over) return
  if (active.id === over.id) return

  /* 2️⃣ Documents concernés (onedrive uniquement) */
  const currentDocs = documents
    .filter(d => d.document_type === 'onedrive')
    .sort((a, b) => a.position - b.position)

  /* 3️⃣ Indices */
  const oldIndex = currentDocs.findIndex(d => d.id === active.id)
  const newIndex = currentDocs.findIndex(d => d.id === over.id)

  /* 4️⃣ Drop invalide (pas sur un doc) */
  if (oldIndex === -1 || newIndex === -1) return

  /* 5️⃣ Réorganisation */
  const reordered = arrayMove(currentDocs, oldIndex, newIndex)

  /* 6️⃣ Recalcul propre et stable des positions */
  const updatedDocs = reordered.map((doc, index) => ({
    ...doc,
    position: index + 1,
  }))

  /* 7️⃣ Mise à jour UI optimiste */
  setDocuments(prev => {
    const otherDocs = prev.filter(d => d.document_type !== 'onedrive')
    return [...otherDocs, ...updatedDocs]
  })

  /* 8️⃣ Persistance backend */
  try {
    const res = await fetchWithAuth('/api/documents/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        updatedDocs.map(d => ({
          id: d.id,
          position: d.position,
        }))
      ),
    })

    if (!res.ok) {
      console.error('Reorder documents failed:', await res.text())
    }
  } catch (err) {
    console.error('Reorder documents error:', err)
  }
}

const auctionContact = artwork.auction_house ?? null

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
 
 
{isEditing && !isNew && (
    <ActionButton
      onClick={deleteArtwork}
      style={{
        backgroundColor: '#cc0000',
        borderColor: '#cc0000',
        color: 'white',
      }}
    >
      Delete
    </ActionButton>
  )}
 
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
 
 
 
 
 
 {!isNew && (
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
 )}
 
 {!isNew && (
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
 )} 
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
             auction_currency: isAuction ? artwork.auction_currency : null,
             sold_hammer: isAuction ? artwork.sold_hammer : null,
             sold_premium: isAuction ? artwork.sold_premium : null,
             underbidder: isAuction ? artwork.guarantee : false,
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
       
 {(() => {
   try {
     return artwork.auction_link
       ? new URL(artwork.auction_link).hostname
       : '—'
   } catch {
     return '—'
   }
 })()}
 
     </a>
   ) : (
     '—'
   )}
 </InlineRow>

       {/* Estimate */}
       <InlineRow label="Estimate">
         {isEditing ? (
           <div style={{ display: 'flex', gap: 8 }}>
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

             <input
               type="number"
               placeholder="Low"
               value={artwork.estimate_low.toLocaleString('fr-CH') ?? ''}
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
               value={artwork.estimate_high.toLocaleString('fr-CH') ?? ''}
               onChange={(e) =>
                 setArtwork({
                   ...artwork,
                   estimate_high: e.target.value
                     ? Number(e.target.value)
                     : null,
                 })
               }
             />
             
           </div>
         ) :  
         (
<div>
          {artwork.auction_currency || ''} {artwork.estimate_low.toLocaleString('fr-CH')} – {artwork.estimate_high.toLocaleString('fr-CH')}
           </div>

         )}
       </InlineRow>
       {/* Result */}
       <InlineRow label="Result">
         {isEditing ? (
           <div style={{ display: 'flex', gap: 8 }}>
          
               Hammer:<input
               type="number"
               placeholder="Hammer"
               value={artwork.sold_hammer.toLocaleString('fr-CH') ?? ''}
               onChange={(e) =>
                 setArtwork({
                   ...artwork,
                   sold_hammer: e.target.value
                     ? Number(e.target.value)
                     : null,
                 })
               }
             />

                         Premium: <input
               type="number"
               placeholder="Premium"
               value={artwork.sold_premium.toLocaleString('fr-CH') ?? ''}
               onChange={(e) =>
                 setArtwork({
                   ...artwork,
                   sold_premium: e.target.value
                     ? Number(e.target.value)
                     : null,
                 })
               }
             />
             
           </div>
         ) :  
         (
<div> Hammer : {artwork.auction_currency || ''} {artwork.sold_hammer.toLocaleString('fr-CH')} / Premium {artwork.auction_currency || ''} {artwork.sold_premium.toLocaleString('fr-CH')}
           </div>

         )}
       </InlineRow>
       {/* Underbidder */}
       <InlineRow label="Undebidder">
         {isEditing ? (
           <select
             value={artwork.underbidder ? 'yes' : 'no'}
             onChange={(e) =>
               setArtwork({
                 ...artwork,
                 underbidder: e.target.value === 'yes',
               })
             }
           >
             <option value="no">No</option>
             <option value="yes">Yes</option>
           </select>
         ) : (
           <div>{artwork.underbidder ? 'Yes' : 'No'}</div>
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
               artwork.asking_price.toLocaleString('fr-CH')
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
 
<input
  type="number"
  placeholder="Amount"
  value={artwork.cost_amount ?? ''}
  onChange={(e) =>
    setArtwork({
      ...artwork,
      cost_amount: e.target.value === ''
        ? null
        : Number(e.target.value),
    })
  }/>


                 </div>
               ) : (
                 artwork.cost_amount
                   ? `${artwork.cost_currency.toLocaleString('fr-CH')} ${new Intl.NumberFormat(
                       'fr-CH'
                     ).format(artwork.cost_amount.toLocaleString('fr-CH'))}`
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
                 `${artwork.insurance_currency.toLocaleString('fr-CH')} ${new Intl.NumberFormat(
                   'fr-CH'
                 ).format(artwork.insurance_value.toLocaleString('fr-CH'))}`
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
 
 
 
 {!isNew && (
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
 )}
 
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
 } // ✅ TOUT TON CODE EXISTANT

