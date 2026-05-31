
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useEditMode } from '@/contexts/EditModeContext'
import { supabase } from '@/lib/supabaseBrowser'
import { ArtworkSection } from './ArtworkSection'
import ImageUploader from '@/components/ImageUploader'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { SortableImage } from '@/components/SortableImage'
import { SortableDocument } from '@/components/SortableDocument'
import type {
  ArtworkWithRelations,
  ArtworkProposal,
  ArtworkDocument,
} from '@/app/(protected)/types/artwork'

function isUUID(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

function Spinner({
  size = 16,
  color = '#ffffff',
}: {
  size?: number
  color?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 50 50"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth="5"
      />
      <path
        d="M25 5a20 20 0 0 1 20 20"
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 25 25"
          to="360 25 25"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
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
    auction_max_hammer:
      a.auction_max_hammer !== null && a.auction_max_hammer !== ''
        ? Number(a.auction_max_hammer)
        : null,
    auction_max_premium:
      a.auction_max_premium !== null && a.auction_max_premium !== ''
        ? Number(a.auction_max_premium)
        : null,
    commission_blondeau:
      a.commission_blondeau !== null && a.commission_blondeau !== ''
        ? Number(a.commission_blondeau)
        : null,
    height_cm:
      a.height_cm !== null && a.height_cm !== '' ? Number(a.height_cm) : null,
    width_cm:
      a.width_cm !== null && a.width_cm !== '' ? Number(a.width_cm) : null,
    depth_cm:
      a.depth_cm !== null && a.depth_cm !== '' ? Number(a.depth_cm) : null,
  }
}


function logSupabaseError(context: string, error: any) {
  if (!error) return

  console.error(context, {
    raw: error,
    json:
      typeof error === 'object'
        ? JSON.parse(JSON.stringify(error))
        : error,
    message: error?.message ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
    code: error?.code ?? null,
    status: error?.status ?? null,
    name: error?.name ?? null,
  })
}


export default function ArtworkDetailContent({
  artworkId,
  isEditMode,
}: {
  artworkId: string
  isEditMode: boolean
}) {
  const id = decodeURIComponent(artworkId || '')
  const router = useRouter()
  const { isEditing, setIsEditing } = useEditMode()

  const [artwork, setArtwork] = useState<ArtworkWithRelations | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [openImage, setOpenImage] = useState<string | null>(null)

  const [newDocLabel, setNewDocLabel] = useState('')
  const [newDocUrl, setNewDocUrl] = useState('')
  const [newDocType] = useState<'image' | 'onedrive'>('onedrive')

  const [isAddingProposal, setIsAddingProposal] = useState(false)

  useEffect(() => {
    setIsEditing(isEditMode)
  }, [isEditMode, setIsEditing])

  const setArtworkNonNull = (
    updater: React.SetStateAction<ArtworkWithRelations>
  ) => {
    setArtwork((prev) => {
      if (!prev) return prev
      return typeof updater === 'function' ? updater(prev) : updater
    })
  }


useEffect(() => {
  if (!id) {
    setLoading(false)
    setArtwork(null)
    setError('Missing artwork id')
    return
  }

  if (!isUUID(id)) {
    setLoading(false)
    setArtwork(null)
    setError('Invalid artwork id')
    return
  }

  let isMounted = true

  const loadArtwork = async () => {
    try {
      setLoading(true)
      setError(null)

      // 1) artwork principal
      const { data: artworkRow, error: artworkError } = await supabase
        .from('artworks')
        .select('*')
        .eq('id', id)
        .single()

      if (!isMounted) return

      if (artworkError) {
        logSupabaseError('LOAD ARTWORK ROW FAILED', artworkError)
        setError('Failed to load artwork')
        setArtwork(null)
        return
      }

      if (!artworkRow) {
        setError('Artwork not found')
        setArtwork(null)
        return
      }

      // 2) relations par IDs
      const [
        artistRes,
        proposedByRes,
        locationRes,
        buyerRes,
        destinationRes,
        certificateLocationRes,
        auctionHouseRes,
        documentsRes,
        proposalsRes,
      ] = await Promise.all([
        artworkRow.artist_id
          ? supabase
              .from('artists')
              .select('id, first_name, last_name')
              .eq('id', artworkRow.artist_id)
              .single()
          : Promise.resolve({ data: null, error: null }),

        artworkRow.proposed_by_id
          ? supabase
              .from('contacts')
              .select('id, company_name, first_name, last_name')
              .eq('id', artworkRow.proposed_by_id)
              .single()
          : Promise.resolve({ data: null, error: null }),

        artworkRow.location_contact_id
          ? supabase
              .from('contacts')
              .select('id, company_name, first_name, last_name')
              .eq('id', artworkRow.location_contact_id)
              .single()
          : Promise.resolve({ data: null, error: null }),

        artworkRow.buyer_contact_id
          ? supabase
              .from('contacts')
              .select('id, company_name, first_name, last_name')
              .eq('id', artworkRow.buyer_contact_id)
              .single()
          : Promise.resolve({ data: null, error: null }),

        artworkRow.destination_contact_id
          ? supabase
              .from('contacts')
              .select('id, company_name, first_name, last_name')
              .eq('id', artworkRow.destination_contact_id)
              .single()
          : Promise.resolve({ data: null, error: null }),

        artworkRow.certificate_location_contact_id
          ? supabase
              .from('contacts')
              .select('id, company_name, first_name, last_name')
              .eq('id', artworkRow.certificate_location_contact_id)
              .single()
          : Promise.resolve({ data: null, error: null }),

        artworkRow.auction_contact_id
          ? supabase
              .from('contacts')
              .select('id, company_name, first_name, last_name')
              .eq('id', artworkRow.auction_contact_id)
              .single()
          : Promise.resolve({ data: null, error: null }),

        supabase
          .from('documents')
          .select('id, artwork_id, document_type, url, label, position')
          .eq('artwork_id', artworkRow.id)
          .order('position', { ascending: true }),

        supabase
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
          .eq('artwork_id', artworkRow.id),
      ])

      if (!isMounted) return

      // Logs utiles si une relation casse
      if (artistRes.error) logSupabaseError('LOAD ARTIST FAILED', artistRes.error)
      if (proposedByRes.error) logSupabaseError('LOAD PROPOSED BY FAILED', proposedByRes.error)
      if (locationRes.error) logSupabaseError('LOAD LOCATION FAILED', locationRes.error)
      if (buyerRes.error) logSupabaseError('LOAD BUYER FAILED', buyerRes.error)
      if (destinationRes.error) logSupabaseError('LOAD DESTINATION FAILED', destinationRes.error)
      if (certificateLocationRes.error) {
        logSupabaseError('LOAD CERTIFICATE LOCATION FAILED', certificateLocationRes.error)
      }
      if (auctionHouseRes.error) {
        logSupabaseError('LOAD AUCTION HOUSE FAILED', auctionHouseRes.error)
      }
      if (documentsRes.error) logSupabaseError('LOAD DOCUMENTS FAILED', documentsRes.error)
      if (proposalsRes.error) logSupabaseError('LOAD PROPOSALS FAILED', proposalsRes.error)

      const normalizedProposals =
        (proposalsRes.data ?? []).map((p: any) => ({
          id: p.id,
          proposed_at: p.proposed_at,
          contact: Array.isArray(p.contact) ? p.contact[0] : p.contact,
        })) ?? []


const fullArtwork = normalizeArtwork({
  ...artworkRow,
  artist: artistRes.data ?? null,
  proposedBy: proposedByRes.data ?? null,
  location: locationRes.data ?? null,
  buyer: buyerRes.data ?? null,
  destination: destinationRes.data ?? null,
  certificateLocation: certificateLocationRes.data ?? null,
  auction_house: auctionHouseRes.data ?? null,
  documents: documentsRes.data ?? [],
  artwork_proposals: normalizedProposals,
})


      setArtwork(fullArtwork)
    } catch (err) {
      if (!isMounted) return
      console.error('Unexpected error loading artwork:', err)
      setError('Unexpected error while loading artwork')
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
    if (!artwork?.id || saving || deleting) return

    try {
      setSaving(true)
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
  auction_max_hammer: artwork.auction_max_hammer,
  auction_max_premium: artwork.auction_max_premium,
  auction_currency: artwork.auction_currency,
  lot: artwork.lot,
  sold_hammer: artwork.sold_hammer,
  sold_premium: artwork.sold_premium,
  underbidder: artwork.underbidder,
  guarantee: artwork.guarantee,

  // ✅ ACQUISITION
  acquired: Boolean(artwork.acquired),
  buyer_contact_id: artwork.buyer_contact_id,
  date_acquisition: artwork.date_acquisition,
  cost_amount: artwork.cost_amount,
  cost_currency: artwork.cost_currency,
  commission_blondeau: artwork.commission_blondeau,
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


      const { error } = await supabase
        .from('artworks')
        .update(payload)
        .eq('id', artwork.id)

      if (error) {
        logSupabaseError('UPDATE ARTWORK FAILED', error)
        setError('Failed to update artwork')
        return
      }

      setIsEditing(false)
      router.push(`/artworks/print/${artwork.id}`)
    } catch (err) {
      console.error('Unexpected save error:', err)
      setError('Unexpected error while saving artwork')
    } finally {
      setSaving(false)
    }
  }

  async function addProposal(contactId: string, proposedAt?: string | null) {
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

      if (proposedAt) {
        payload.proposed_at = proposedAt
      }

      const { error } = await supabase.from('artwork_proposals').insert(payload)

      if (error) {
        console.info('Proposal already exists or insert ignored')
      }

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
        (proposals ?? []).map((p: any) => ({
          id: p.id,
          proposed_at: p.proposed_at,
          contact: Array.isArray(p.contact) ? p.contact[0] : p.contact,
        })) ?? []

      setArtwork((prev) =>
        prev
          ? {
              ...prev,
              artwork_proposals: normalizedProposals,
            }
          : prev
      )
    } finally {
      setIsAddingProposal(false)
    }
  }

  async function removeProposal(proposalId: string) {
    const confirmed = confirm('Remove this proposal?')
    if (!confirmed) return

    const { data, error } = await supabase
      .from('artwork_proposals')
      .delete()
      .eq('id', proposalId)
      .select()

    if (error) {
      console.error('Remove proposal failed:', error)
      alert('Failed to remove proposal')
      return
    }

    if (!data || data.length === 0) {
      alert('Proposal could not be removed (permission denied)')
      return
    }

    setArtwork((prev) => {
      if (!prev) return prev

      const proposals = (prev.artwork_proposals ?? []) as ArtworkProposal[]

      return {
        ...prev,
        artwork_proposals: proposals.filter((p) => p.id !== proposalId),
      }
    })
  }

  async function addDocument() {
    if (!artwork?.id || !newDocUrl.trim()) return

    const position =
      (artwork.documents ?? []).filter((d) => d.document_type === newDocType)
        .length + 1

    const { data, error } = await supabase
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

    if (error) {
      console.error('ADD DOCUMENT FAILED:', error)
      alert('Failed to add document')
      return
    }

    setArtwork((prev) =>
      prev
        ? {
            ...prev,
            documents: [...(prev.documents ?? []), data],
          }
        : prev
    )

    setNewDocLabel('')
    setNewDocUrl('')
  }

  async function deleteArtwork() {
    if (!artwork?.id || deleting || saving) return

    const confirmed = confirm(
      'Are you sure you want to delete this artwork?\nThis action is irreversible.'
    )
    if (!confirmed) return

    try {
      setDeleting(true)

      const res = await fetch(`/api/artworks/${artwork.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const text = await res.text()
        console.error('DELETE ARTWORK FAILED:', text)
        alert(text || 'Failed to delete artwork')
        return
      }

      router.push('/artworks')
    } finally {
      setDeleting(false)
    }
  }

  async function deleteDocument(documentId: string) {
    if (!artwork?.id) {
      console.error('Artwork is missing, cannot delete document')
      return
    }

    const res = await fetch(
      `/api/artworks/${artwork.id}/documents/${documentId}`,
      {
        method: 'DELETE',
      }
    )

    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.error ?? 'Failed to delete document')
    }

    setArtwork((prev) => {
      if (!prev) return prev

      const documents: ArtworkDocument[] = (prev.documents ?? [])
        .filter((d) => d.id !== documentId)
        .map((d, index) => ({
          ...d,
          artwork_id: prev.id,
          position: d.position ?? index + 1,
        }))

      return {
        ...prev,
        documents,
      }
    })
  }

  async function handleImagesDragEnd(event: DragEndEvent) {
    const activeId = String(event.active?.id ?? '')
    const overId = String(event.over?.id ?? '')

    if (!overId || activeId === overId || !artwork) return

    const currentImages =
      (artwork.documents ?? [])
        .filter((d) => d.document_type === 'image')
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) ?? []

    const oldIndex = currentImages.findIndex((img) => img.id === activeId)
    const newIndex = currentImages.findIndex((img) => img.id === overId)

    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(currentImages, oldIndex, newIndex)

    const updatedImages: ArtworkDocument[] = reordered.map((img, index) => ({
      ...img,
      artwork_id: artwork.id,
      position: index + 1,
    }))

    const otherDocs = (artwork.documents ?? []).filter(
      (d) => d.document_type !== 'image'
    )

    const updatedDocuments = [...otherDocs, ...updatedImages]

    setArtwork((prev) => {
      if (!prev) return prev

      return {
        ...prev,
        documents: updatedDocuments.map((d, index) => ({
          ...d,
          artwork_id: prev.id,
          position: d.position ?? index + 1,
        })),
      }
    })

    try {
      await Promise.all(
        updatedImages.map((img) =>
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

  async function handleDocumentsDragEnd(event: DragEndEvent) {
    const activeId = String(event.active?.id ?? '')
    const overId = String(event.over?.id ?? '')

    if (!overId || activeId === overId || !artwork) return

    const currentDocs =
      (artwork.documents ?? [])
        .filter((d) => d.document_type === 'onedrive')
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) ?? []

    const oldIndex = currentDocs.findIndex((doc) => doc.id === activeId)
    const newIndex = currentDocs.findIndex((doc) => doc.id === overId)

    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(currentDocs, oldIndex, newIndex)

    const updatedDocs: ArtworkDocument[] = reordered.map((doc, index) => ({
      ...doc,
      artwork_id: artwork.id,
      position: index + 1,
    }))

    const otherDocs = (artwork.documents ?? []).filter(
      (d) => d.document_type !== 'onedrive'
    )

    const updatedDocuments = [...otherDocs, ...updatedDocs]

    setArtwork((prev) => {
      if (!prev) return prev

      return {
        ...prev,
        documents: updatedDocuments.map((d, index) => ({
          ...d,
          artwork_id: prev.id,
          position: d.position ?? index + 1,
        })),
      }
    })

    try {
      await Promise.all(
        updatedDocs.map((doc) =>
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

  const images = useMemo(
    () =>
      ((artwork?.documents ?? []) as ArtworkDocument[])
        .filter((d) => d.document_type === 'image')
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [artwork]
  )

  const onedriveDocuments = useMemo(
    () =>
      ((artwork?.documents ?? []) as ArtworkDocument[])
        .filter((d) => d.document_type === 'onedrive')
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [artwork]
  )

  const editInputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    border: '1px solid #ccc',
    borderRadius: 4,
    fontSize: '0.95rem',
    backgroundColor: 'white',
    boxSizing: 'border-box',
  }

  if (loading) {
    return <p style={{ padding: 40 }}>Loading artwork…</p>
  }

  if (error && !artwork) {
    return <p style={{ padding: 40 }}>{error}</p>
  }

  if (!artwork) return null

  return (
    <main
      style={{
        paddingTop: 80,
        paddingLeft: 10,
        paddingRight: 10,
        paddingBottom: 10,
        minHeight: '100vh',
        backgroundColor: '#006039',
        color: 'white',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {error && (
          <div
            style={{
              marginBottom: 16,
              backgroundColor: '#ffe6e6',
              color: '#8b0000',
              border: '1px solid #e0a0a0',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: '0.95rem',
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            position: 'fixed',
            top: 72,
            right: 24,
            left: 'auto',
            zIndex: 50,
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 8,
            marginBottom: 20,
            paddingTop: 8,
            paddingBottom: 10,
            backdropFilter: 'blur(4px)',
            borderBottom: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          {(saving || deleting) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: '0.95rem',
                color: '#eaf7ef',
                marginRight: 8,
              }}
            >
              <Spinner size={16} />
              <span>{saving ? 'Saving artwork…' : 'Deleting artwork…'}</span>
            </div>
          )}

          <button
            className="edit-button"
            type="button"
            disabled={saving || deleting}
            onClick={() => {
              if (!artwork?.id) return

              if (isEditing) {
                router.push(`/artworks/print/${artwork.id}`)
              } else {
                router.push(`/artworks/${artwork.id}/edit`)
              }
            }}
          >
            {isEditing ? 'Cancel' : 'Edit'}
          </button>

          {isEditing && (
            <button
              className="edit-button"
              type="button"
              disabled={saving || deleting}
              onClick={deleteArtwork}
              style={{
                backgroundColor: '#cc0000',
                color: 'white',
                opacity: deleting ? 0.85 : 1,
                cursor: deleting ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {deleting ? (
                <>
                  <Spinner size={14} />
                  <span>Deleting…</span>
                </>
              ) : (
                'Delete'
              )}
            </button>
          )}

          {isEditing && (
            <button
              className="edit-button"
              type="button"
              disabled={saving || deleting}
              onClick={saveArtwork}
              style={{
                opacity: saving ? 0.85 : 1,
                cursor: saving ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {saving ? (
                <>
                  <Spinner size={14} />
                  <span>Saving…</span>
                </>
              ) : (
                'Save'
              )}
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
                        onDelete={deleteDocument}
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
          isEditing={isEditing && !saving && !deleting}
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
                textAlign: 'center',
                fontSize: '1.3rem',
                marginBottom: '10px',
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

                  <button className="edit-button" onClick={addDocument}>
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
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    {onedriveDocuments.map((doc) => (
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
      </div>
    </main>
  )
}
