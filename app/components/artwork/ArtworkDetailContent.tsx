
'use client'



import { ArtworkSection } from './ArtworkSection'
import { useEffect, useState } from 'react'
import { useEditMode } from '@/app/contexts/EditModeContext'
import ImageUploader from '@/app/components/ImageUploader'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, rectSortingStrategy, arrayMove, } from '@dnd-kit/sortable'
import { SortableImage } from '@/app/components/SortableImage'
import { SortableDocument } from '@/app/components/SortableDocument'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'


// ✅ types
type Props = {
  artwork: Artwork
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

const CURRENCY_OPTIONS = ['CHF', 'EUR', 'USD', 'GBP', 'HKD']
const PRIORITY_OPTIONS = ['information', 'medium', 'high']
const STATUS_OPTIONS = [
  'draft',
  'viewed',
  'negotiation',
  'bought',
  'archived',
]
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
  sold_hammer: null,
  sold_premium: null,
  auction_currency: null,
  documents: [],
  artwork_proposals: []
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

function normalizeArtwork(a: any) {
  if (!a) return a

  return {
    ...a,

    estimate_low:
      a.estimate_low !== null && a.estimate_low !== ''
        ? Number(a.estimate_low)
        : null,

    estimate_high:
      a.estimate_high !== null && a.estimate_high !== ''
        ? Number(a.estimate_high)
        : null,

    cost_amount:
      a.cost_amount !== null && a.cost_amount !== ''
        ? Number(a.cost_amount)
        : null,

    sold_hammer:
      a.sold_hammer !== null && a.sold_hammer !== ''
        ? Number(a.sold_hammer)
        : null,

    sold_premium:
      a.sold_premium !== null && a.sold_premium !== ''
        ? Number(a.sold_premium)
        : null,
  }
}


export default function ArtworkDetailContent({ artworkId }: { artworkId: string }) {
  /* ======================
     ID & MODE
     ====================== */
  const id = decodeURIComponent(artworkId)
  const isNew = !id
const router = useRouter()
  /* ======================
     EDIT MODE
     ====================== */
  const { isEditing, setIsEditing } = useEditMode()

  /* ======================
     STATE
     ====================== */
  const [artwork, setArtwork] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openImage, setOpenImage] = useState<string | null>(null)
  const [newDocLabel, setNewDocLabel] = useState('')
  const [newDocUrl, setNewDocUrl] = useState('')
  const [newDocType, setNewDocType] = useState<'image' | 'onedrive'>('onedrive')
  const searchParams = useSearchParams()
  const editParam = searchParams.get('edit')
  

 

 
  /* ======================
     FORCE EDIT MODE
     ====================== */
  useEffect(() => {
    if (isNew) {
      setIsEditing(true)
    }
  }, [isNew, setIsEditing])


  /* ======================
     MODE CRÉATION
     ====================== */
  useEffect(() => {
    if (isNew) {
      setArtwork(EMPTY_ARTWORK)
      setIsEditing(true)
      setLoading(false)
    }
  }, [isNew, setIsEditing])

  /* ======================
     ✅ MODE ÉDITION – LOAD ARTWORK
     ====================== */
  useEffect(() => {
    if (!id) return

    let isMounted = true

    const loadArtwork = async () => {
      try {
        if (!isMounted) return

        setLoading(true)
        setError(null)

        const { data, error } = await supabase
          .from('artworks')
          .select(`
            *,
            artist:artists!artworks_artist_id_fkey (
              id,
              first_name,
              last_name
            ),
            documents:documents (
              id,
              document_type,
              label,
              url,
              position
            ),
            auctionContact:contacts!artworks_auction_contact_id_fkey (
              id,
              company_name,
              first_name,
              last_name
            ),
            proposedBy:contacts!artworks_proposed_by_id_fkey (
              id,
              company_name,
              first_name,
              last_name
            ),
            location:contacts!artworks_location_contact_fkey (
              id,
              company_name,
              first_name,
              last_name
            ),
            certificateLocation:contacts!artworks_certificate_location_contact_id_fkey (
              id,
              company_name,
              first_name,
              last_name
            ),
            buyer:contacts!artworks_buyer_contact_id_fkey (
              id,
              company_name,
              first_name,
              last_name
            ),
            destination:contacts!artworks_destination_contact_id_fkey (
              id,
              company_name,
              first_name,
              last_name
            ),
            artwork_proposals (
              id,
              proposed_at,
              contact:contacts (
                id,
                company_name,
                first_name,
                last_name
              )
            )
          `)
          .eq('id', id)
          .single()

        if (!isMounted) return

        if (error) {
          console.error(error)
          setError('Failed to load artwork')
          setArtwork(null)
        } else {
          setArtwork(data)
        }
      } catch (err) {
        if (!isMounted) return
        console.error('Unexpected error loading artwork:', err)
        setError('Unexpected error')
        setArtwork(null)
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadArtwork()

    return () => {
      isMounted = false
    }
  }, [id])



async function saveArtwork() {
  if (!artwork) return

  setLoading(true)
  setError(null)

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
    certificate_location_contact_id:
      artwork.certificate_location_contact_id,
    check_seller: artwork.check_seller,
    notes: artwork.notes,
    artist_id: artwork.artist_id,
    insurance_value: artwork.insurance_value,
    insurance_currency: artwork.insurance_currency,
    height_cm: artwork.height_cm || null,
    width_cm: artwork.width_cm || null,
    depth_cm: artwork.depth_cm || null,
  }

  try {
    if (isNew) {
      // ✅ CREATE
      const { data, error } = await supabase
        .from('artworks')
        .insert(payload)
        .select()
        .single()

      if (error || !data?.id) {
        console.error('CREATE artwork failed:', error)
        setError('Failed to create artwork')
        return
      }

      // ✅ Toujours vers PRINT
      router.push(`/artworks/print/${data.id}`)
    } else {
      // ✅ UPDATE
      const { error } = await supabase
        .from('artworks')
        .update(payload)
        .eq('id', artwork.id)

      if (error) {
        console.error('UPDATE artwork failed:', error)
        setError('Failed to update artwork')
        return
      }

      setIsEditing(false)
      router.push(`/artworks/print/${artwork.id}`)
    }
  } finally {
    setLoading(false)
  }
}




async function addProposal(
  contactId: string,
  proposedAt?: string | null
) {
  if (!artwork?.id || !contactId) {
    alert('Please select a contact')
    return
  }

  const { error: supabaseError } = await supabase
    .from('artwork_proposals')
    .insert({
      artwork_id: artwork.id,
      contact_id: contactId,
      proposed_at: proposedAt || null,
    })

  if (supabaseError) {
    console.error('Add proposal failed:', supabaseError)
    alert('Failed to add proposal')
    return
  }

  // ✅ Recharger les proposals (simple et sûr)
  const { data, error: reloadError } = await supabase
    .from('artwork_proposals')
    .select(`
      id,
      proposed_at,
      contact:contacts (
        id,
        company_name,
        first_name,
        last_name
      )
    `)
    .eq('artwork_id', artwork.id)

  if (!reloadError && data) {
    setArtwork(prev =>
      prev
        ? { ...prev, artwork_proposals: data }
        : prev
    )
  }
}

 
 

 

async function removeProposal(proposalId: string) {
  const confirmed = confirm('Remove this proposal?')
  if (!confirmed) return

  const { error: supabaseError } = await supabase
    .from('artwork_proposals')
    .delete()
    .eq('id', proposalId)

  if (supabaseError) {
    console.error('Remove proposal failed:', supabaseError)
    alert('Failed to remove proposal')
    return
  }

  // ✅ Mise à jour locale de l’état
  setArtwork(prev =>
    prev
      ? {
          ...prev,
          artwork_proposals: prev.artwork_proposals?.filter(
            p => p.id !== proposalId
          ),
        }
      : prev
  )
}

 
 
 

async function addDocument() {
  if (!artwork?.id || !newDocUrl) return

  const position =
    documents.filter(d => d.document_type === newDocType).length

  const { data, error: supabaseError } = await supabase
    .from('documents')
    .insert({
      artwork_id: artwork.id,
      document_type: newDocType,
      label: newDocLabel || null,
      url: newDocUrl,
      position,
    })
    .select()
    .single()

  if (supabaseError) {
    console.error('ADD DOCUMENT FAILED:', supabaseError)
    alert('Failed to add document')
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

  const { error: supabaseError } = await supabase
    .from('artworks')
    .delete()
    .eq('id', artwork.id)

  if (supabaseError) {
    console.error('DELETE ARTWORK FAILED:', supabaseError)
    alert('Failed to delete artwork')
    return
  }

  // ✅ Retour à la liste
  window.location.href = '/artworks'
}


 


async function deleteDocument(id: string) {
  if (!artwork?.id) return

  // ✅ suppression en base
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Delete document failed:', error)
    alert('Failed to delete image')
    return
  }

  // ✅ mise à jour locale via artwork (source de vérité)
  setArtwork(prev =>
    prev
      ? {
          ...prev,
          documents: prev.documents?.filter(d => d.id !== id) ?? [],
        }
      : prev
  )
}


 
 

const images =
  artwork?.documents
    ?.filter(d => d.document_type === 'image')
    .sort((a, b) => a.position - b.position) ?? []

 
 const onedriveDocuments = artwork?.documents
   .filter(d => d.document_type === 'onedrive')
   .sort((a, b) => a.position - b.position)
 
   
 const editInputStyle: React.CSSProperties = {
   width: '100%',
   padding: '6px 8px',
   border: '1px solid #ccc',
   borderRadius: 4,
   fontSize: '0.95rem',
 };
 
 
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

  // ✅ Mise à jour UI immédiate (optimistic update)
  setDocuments(prev => [
    ...prev.filter(d => d.document_type !== 'image'),
    ...updatedImages,
  ])

  // ✅ Persistance backend via Supabase
  try {
    const updates = updatedImages.map(img =>
      supabase
        .from('documents')
        .update({ position: img.position })
        .eq('id', img.id)
    )

    const results = await Promise.all(updates)

    const firstError = results.find(r => r.error)?.error
    if (firstError) {
      console.error('REORDER IMAGES FAILED:', firstError)
      alert('Failed to reorder images')
    }
  } catch (err) {
    console.error('REORDER IMAGES ERROR:', err)
  }
}


async function handleDocumentsDragEnd(event: any) {
  const { active, over } = event
  if (!over || active.id === over.id) return

  const currentDocs = documents
    .filter(d => d.document_type === 'onedrive')
    .sort((a, b) => a.position - b.position)

  const oldIndex = currentDocs.findIndex(doc => doc.id === active.id)
  const newIndex = currentDocs.findIndex(doc => doc.id === over.id)

  if (oldIndex === -1 || newIndex === -1) return

  const reordered = arrayMove(currentDocs, oldIndex, newIndex)

  const updatedDocs = reordered.map((doc, index) => ({
    ...doc,
    position: index + 1,
  }))

  // ✅ update UI immédiate (optimistic)
  setDocuments(prev => [
    ...prev.filter(d => d.document_type !== 'onedrive'),
    ...updatedDocs,
  ])

  // ✅ persistance backend
  try {
    const updates = updatedDocs.map(doc =>
      supabase
        .from('documents')
        .update({ position: doc.position })
        .eq('id', doc.id)
    )

    const results = await Promise.all(updates)
    const firstError = results.find(r => r.error)?.error

    if (firstError) {
      console.error('REORDER DOCUMENTS FAILED:', firstError)
      alert('Failed to reorder documents')
    }
  } catch (err) {
    console.error('REORDER DOCUMENTS ERROR:', err)
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

   const isBought = artwork.status === 'bought'
const auctionContact = artwork.auction_house ?? null
const proposedByContact = artwork.proposedBy ?? null
const buyerContact = artwork.buyer ?? null
const destinationContact = artwork.destination_contact ?? null



 return (
    
   <main
         style={{
       padding: 40,
       minHeight: '100vh',
       backgroundColor: '#006039',
       color: 'white',
     }}
   >
     
 <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 20 }}>
 


<ActionButton
  onClick={() => {
    if (isEditing) {
      // ✅ Cancel → redirection vers print
      if (artwork?.id) {
        router.push(`/artworks/print/${artwork.id}`)
      }
    } else {
      // ✅ Edit → activation du mode édition
      setIsEditing(true)
    }
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
  onUploaded={(uploadedDocument) => {
    setArtwork(prev =>
      prev
        ? {
            ...prev,
            documents: [...(prev.documents ?? []), uploadedDocument],
          }
        : prev
    )
  }}
/>

     </div>
   )}
 </section>
 )} 



<ArtworkSection
  artwork={artwork}
  isEditing={isEditing}
  setArtwork={setArtwork}
  addProposal={addProposal}
  removeProposal={removeProposal}
/>


 
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
 
   {artwork.documents.filter(d => d.document_type === 'onedrive').length === 0 ? (
     <div style={{ color: '#777', fontStyle: 'italic' }}>
       No documents
     </div>
   ) : (
     <DndContext
       collisionDetection={closestCenter}
       onDragEnd={handleDocumentsDragEnd}
     >
       <SortableContext
         items={artwork.documents
           .filter(d => d.document_type === 'onedrive')
           .sort((a, b) => a.position - b.position)
           .map(d => d.id)}
         strategy={verticalListSortingStrategy}
       >
         <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
           {artwork.documents
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
 } 

