
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
import type { ArtworkWithRelations, ArtworkProposal, ArtworkDocument } from '@/app/types/artwork'


function isUUID(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
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


function SectionBlock({ children }: { children: React.ReactNode }) {
  return (
    <section
      style={{
        backgroundColor: '#ffffff',
        color: '#000000',
        borderRadius: 8,
        padding: 24,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}
    >
      {children}
    </section>
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



export default function ArtworkDetailContent(
  {
    artworkId,
    isEditMode,
  }: {
    artworkId: string
    isEditMode: boolean
  }
) {

  if (!artworkId) {
    return <p>Missing artwork id</p>
  }


  /* ======================
     ID & MODE
     ====================== */
  const id = decodeURIComponent(artworkId)
 const router = useRouter()
  /* ======================
     EDIT MODE
     ====================== */
  const { isEditing, setIsEditing } = useEditMode()
  
useEffect(() => {
  setIsEditing(isEditMode)
}, [isEditMode, setIsEditing])


  /* ======================
     STATE
     ====================== */
  const [artwork, setArtwork] = useState<ArtworkWithRelations | null>(null)

  // ✅ Wrapper NON-NULL pour ArtworkSection
  const setArtworkNonNull = (
    updater: React.SetStateAction<ArtworkWithRelations>
  ) => {
    setArtwork(prev => {
      if (!prev) return prev
      return typeof updater === 'function'
        ? updater(prev)
        : updater
    })
  }


  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openImage, setOpenImage] = useState<string | null>(null)
  const [newDocLabel, setNewDocLabel] = useState('')
  const [newDocUrl, setNewDocUrl] = useState('')
  const [newDocType, setNewDocType] = useState<'image' | 'onedrive'>('onedrive')
  const [isAddingProposal, setIsAddingProposal] = useState(false)
  const [proposedToFilter, setProposedToFilter] = useState<string | 'all'>('all')



  
 
  /* ======================
     FORCE EDIT MODE
     ====================== */



  /* ======================
     MODE CRÉATION
     ====================== */


  /* ======================
     ✅ MODE ÉDITION – LOAD ARTWORK
     ====================== */

 
function logSupabaseError(context: string, error: any) {
  if (!error) return
  console.error(context, {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
  })
}
    


useEffect(() => {
  if (!id) return

  // ✅ Cas route non UUID (ex: "auctions", "new", etc.)
  if (!isUUID(id)) {
    setLoading(false)
    setArtwork(null)
    setError(null)
    return
  }

  let isMounted = true


const loadArtwork = async () => {
  try {
    setLoading(true)
    setError(null)



const { data, error } = await supabase
  .from('artworks')
  .select(`
    *,
    proposedBy:contacts!artworks_proposed_by_id_fkey (
      id,
      company_name,
      first_name,
      last_name
    ),
    documents (
      id,
      artwork_id,
      document_type,
      url,
      label,
      position
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



if (error) {if (error)  logSupabaseError('LOAD ARTWORK FAILED', error)
  setError('Failed to load artwork')
  setArtwork(null)
  return
}



    if (!data) {
      setError('Artwork not found')
      setArtwork(null)
      return
    }

    // ✅ normalisation éventuelle (si tu l’utilises ailleurs)
    setArtwork(data)
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
    lot: artwork.lot,
    sold_hammer: artwork.sold_hammer,
    sold_premium: artwork.sold_premium,
    underbidder: artwork.underbidder,
    guarantee: artwork.guarantee,
    buyer_contact_id: artwork.buyer_contact_id,
    date_acquisition: artwork.date_acquisition,
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
  if (!artwork?.id) {
    setError('Artwork id is missing')
    return
  }

  // ✅ UPDATE uniquement (ArtworkDetailContent)
  const { error } = await supabase
    .from('artworks')
    .update(payload)
    .eq('id', artwork.id)

  if (error) {
    console.error('UPDATE artwork failed:', error)
    setError('Failed to update artwork')
    return
  }

  // ✅ Sortie du mode édition et redirection vers le print
  setIsEditing(false)
  router.push(`/artworks/print/${artwork.id}`)
} finally {
  setLoading(false)
}

}




async function addProposal(
  contactId: string,
  proposedAt?: string | null
) {
  if (!artwork?.id) return
  if (!contactId || contactId.trim() === '') {
    alert('Please select a contact')
    return
  }

  if (isAddingProposal) return
  setIsAddingProposal(true)

  try {
    const payload: {
      artwork_id: string
      contact_id: string
      proposed_at?: string
    } = {
      artwork_id: artwork.id,
      contact_id: contactId,
    }

    // laisser PostgreSQL appliquer DEFAULT CURRENT_DATE
    if (proposedAt) {
      payload.proposed_at = proposedAt
    }

    // ⚠️ INSERT
    const { error } = await supabase
      .from('artwork_proposals')
      .insert(payload)

    /**
     * IMPORTANT :
     * - error peut être {} en cas de 409 (UNIQUE)
     * - ce n'est PAS une erreur métier
     * - on ignore volontairement ce cas
     */

    if (error) {
      // ✅ on ignore silencieusement
      console.info('Proposal already exists or insert ignored')
    }

    // ✅ recharger la source de vérité
    const { data: proposals } = await supabase
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


const normalizedProposals =
  (proposals ?? []).map(p => ({
    id: p.id,
    proposed_at: p.proposed_at,
    // ✅ force un Contact unique
    contact: Array.isArray(p.contact) ? p.contact[0] : p.contact,
  }))

setArtwork(prev =>
  prev
    ? { ...prev, artwork_proposals: normalizedProposals }
    : prev
)

  } finally {
    setIsAddingProposal(false)
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


setArtwork(prev => {
  if (!prev || !prev.artwork_proposals) return prev

  const proposals: ArtworkProposal[] = prev.artwork_proposals

  return {
    ...prev,
    artwork_proposals: proposals.filter(
      p => p.id !== proposalId
    ),
  }
})


}

  

async function addDocument() {
  if (!artwork?.id || !newDocUrl) return


const position =
  (artwork.documents ?? [])
    .filter(d => d.document_type === newDocType)
    .length


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

 
  
// ✅ la donnée créée vient déjà de Supabase
const created = data

// ✅ mise à jour locale via artwork (source de vérité)
setArtwork(prev =>
  prev
    ? {
        ...prev,
        documents: [...(prev.documents ?? []), created],
      }
    : prev
)

// ✅ reset des champs
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


setArtwork(prev => {
  if (!prev) return prev

  const documents: ArtworkDocument[] = prev.documents
    .filter(d => d.id !== id) // ou autre logique
    .map((d, index) => ({
      ...d,
      artwork_id: prev.id,
      position: d.position ?? index + 1, // ✅ GARANTI number
    }))

  return {
    ...prev,
    documents,
  }
})


}




const images =
  artwork?.documents
    ?.filter(d => d.document_type === 'image')
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) ?? []


 
 const onedriveDocuments = artwork?.documents
   .filter(d => d.document_type === 'onedrive')
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) ?? []
 
   
 const editInputStyle: React.CSSProperties = {
   width: '100%',
   padding: '6px 8px',
   border: '1px solid #ccc',
   borderRadius: 4,
   fontSize: '0.95rem',
   backgroundColor: 'white'
 };
 
 

async function handleImagesDragEnd(event: any) {
  const { active, over } = event
  if (!over || active.id === over.id) return

  if (!artwork) return

  // ✅ 1️⃣ Images courantes (source de vérité)
  const currentImages = artwork.documents
    .filter(d => d.document_type === 'image')
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) ?? []

  const oldIndex = currentImages.findIndex(img => img.id === active.id)
  const newIndex = currentImages.findIndex(img => img.id === over.id)

  if (oldIndex === -1 || newIndex === -1) return

  // ✅ 2️⃣ Réordonner
  const reordered = arrayMove(currentImages, oldIndex, newIndex)



const updatedImages: ArtworkDocument[] = reordered.map((img, index) => ({
  ...img,
  artwork_id: artwork.id,   // ✅ OBLIGATOIRE
  position: index + 1,
}))


setArtwork(prev => {
  if (!prev) return prev

  const documents: ArtworkDocument[] = prev.documents
    // adapte la logique si nécessaire
    .map((d, index) => ({
      ...d,
      artwork_id: prev.id,            // ✅ OBLIGATOIRE
      position: d.position ?? index + 1, // ✅ GARANTI number
    }))

  return {
    ...prev,
    documents,
  }
})




  // ✅ 3️⃣ Merge avec les autres documents
  const otherDocs = artwork.documents.filter(
    d => d.document_type !== 'image'
  )

  const updatedDocuments = [...otherDocs, ...updatedImages]

  // ✅ 4️⃣ Mise à jour UI (source de vérité UNIQUE)

setArtwork(prev => {
  if (!prev) return prev

  const documents: ArtworkDocument[] = updatedDocuments.map((d, index) => ({
    ...d,
    artwork_id: prev.id,              // ✅ OBLIGATOIRE
    position: d.position ?? index + 1 // ✅ GARANTI number
  }))

  return {
    ...prev,
    documents
  }
})


  // ✅ 5️⃣ Persistance backend
  try {
    await Promise.all(
      updatedImages.map(img =>
        supabase
          .from('documents')
          .update({ position: img.position })
          .eq('id', img.id)
      )
    )
  } catch (err) {
    console.error('REORDER IMAGES ERROR:', err)
  }
}




async function handleDocumentsDragEnd(event: any) {
  const { active, over } = event
  if (!over || active.id === over.id) return

  if (!artwork) return

  // ✅ 1️⃣ Documents OneDrive
  const currentDocs = artwork.documents
    .filter(d => d.document_type === 'onedrive')
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  const oldIndex = currentDocs.findIndex(doc => doc.id === active.id)
  const newIndex = currentDocs.findIndex(doc => doc.id === over.id)

  if (oldIndex === -1 || newIndex === -1) return

  const reordered = arrayMove(currentDocs, oldIndex, newIndex)

  const updatedDocs = reordered.map((doc, index) => ({
    ...doc,
    position: index + 1,
  }))

  const otherDocs = artwork.documents.filter(
    d => d.document_type !== 'onedrive'
  )

  const updatedDocuments = [...otherDocs, ...updatedDocs]

  // ✅ 2️⃣ Mise à jour UI

setArtwork(prev => {
  if (!prev) return prev

  const documents: ArtworkDocument[] = updatedDocuments.map(
    (d, index) => ({
      ...d,
      artwork_id: prev.id,              // ✅ obligatoire
      position: d.position ?? index + 1 // ✅ garanti number
    })
  )

  return {
    ...prev,
    documents
  }
})


  // ✅ 3️⃣ Persistance backend
  try {
    await Promise.all(
      updatedDocs.map(doc =>
        supabase
          .from('documents')
          .update({ position: doc.position })
          .eq('id', doc.id)
      )
    )
  } catch (err) {
    console.error('REORDER DOCUMENTS ERROR:', err)
  }
}



// 1️⃣ Pendant le chargement
if (loading) {
  return <p>Loading artwork…</p>
}

// 2️⃣ Erreur explicite
if (error) {
  return <p>Artwork not found</p>
}

// 3️⃣ Garde technique : artwork DOIT exister à partir d’ici
if (!artwork) return null



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
 



<button className="edit-button"
  onClick={() => {
    if (!artwork?.id) return

    if (isEditing) {
      // ✅ Cancel → retour à l'affichage
      router.push(`/artworks/print/${artwork.id}`)
    } else {
      // ✅ Edit → navigation vers la route dédiée
      router.push(`/artworks/${artwork.id}/edit`)
    }
  }}
>
  {isEditing ? 'Cancel' : 'Edit'}
</button>



{isEditing && (
<button className="edit-button"
    onClick={deleteArtwork}
    style={{
      backgroundColor: '#cc0000',
      color: 'white',
    }}
  >
    Delete
  </button>
)}


{isEditing && (
<button className="edit-button"
    onClick={saveArtwork}
  >
    Save
  </button>
)}


 </div>
 
  


{(images.length > 0 || isEditing) && (
  <section
    style={{
      marginTop: 40,
      marginBottom: 40,
      backgroundColor: '#e6e5e5',
      color: '#000',
      borderRadius: 8,
      padding: 24,
    }}
  >

    {isEditing && artwork.id && (
      <ImageUploader
        artworkId={artwork.id}
        onUploaded={(doc) =>
          setArtwork((prev) =>
            prev
              ? { ...prev, documents: [...(prev.documents ?? []), doc] }
              : prev
          )
        }
      />
    )}

    {images.length > 0 && (
      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={handleImagesDragEnd}
      >
        <SortableContext
          items={images.map((img) => img.id)}
          strategy={rectSortingStrategy}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              backgroundColor: '#e6e5e5',
              gap: 12,
              flexWrap: 'wrap',
              marginTop: 16,
            }}
          >
            {images.map((img) => (

<SortableImage
  key={img.id}
  image={img}
  isEditing={isEditing}
  onOpen={(url) => setOpenImage(url)}
  onDelete={(id) => deleteDocument(id)}
/>

            ))}
          </div>
        </SortableContext>
      </DndContext>
    )}
  </section>
)}



<ArtworkSection
  artwork={artwork}
  isEditing={isEditing}
  setArtwork={setArtworkNonNull} 
  addProposal={addProposal}
  removeProposal={removeProposal}
/>



{(onedriveDocuments.length > 0 || isEditing) && (
  <section
    style={{
      marginTop: 40,
      backgroundColor: '#e6e5e5',
      color: '#000',
      borderRadius: 8,
      padding: 24,
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    }}
  >
<h3
  style={{
    textAlign: 'center',   // ✅ centre uniquement cette ligne
    fontSize: '1.3rem', 
    marginBottom: '10px'   // ✅ légèrement plus grand (optionnel)
    }}
>
  Documents
</h3>



{isEditing && artwork.id && (
  <div style={{ marginBottom: 16 }}>
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        width: '100%',
      }}
    >
      <input
        type="text"
        placeholder="Label"
        value={newDocLabel}
        onChange={(e) => setNewDocLabel(e.target.value)}
        style={{ ...editInputStyle, flex: 1 }}
      />

      <input
        type="url"
        placeholder="URL"
        value={newDocUrl}
        onChange={(e) => setNewDocUrl(e.target.value)}
        style={{ ...editInputStyle, flex: 2 }}
      />

      <button
        className="edit-button"
        onClick={addDocument}
      >
        Add
      </button>
    </div>
  </div>
)}


    {onedriveDocuments.length > 0 && (
      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={handleDocumentsDragEnd}
      >
        <SortableContext
          items={onedriveDocuments.map((d) => d.id)}
          strategy={verticalListSortingStrategy}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {onedriveDocuments.map((doc) => (
              <SortableDocument
                key={doc.id}
                document={doc}
                isEditing={isEditing}
                onDelete={() => deleteDocument(doc.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
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

