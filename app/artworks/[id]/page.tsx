
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import {
  DndContext,
  closestCenter,
} from '@dnd-kit/core'

import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'


type Contact = {
  id: string
  first_name: string | null
  last_name: string | null
  company_name: string | null
}


type Artist = {
  id: string
  first_name: string | null
  last_name: string
}

type Artwork = {
  id: string
  date_proposition: string
  proposed_by?: Contact | null
  auctions: boolean
  auction_contact_id: string | null
  sale_date: string | null
  sale_time: string | null
  auction_link: string | null
  estimate_low: number | null
  estimate_high: number | null
  auction_currency: string | null
  guarantee: boolean
  auction_house?: Contact | null
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
  artist_id: string | null
  proposed_by_id: string | null
  bought: boolean
  buyer_contact_id: string | null
  cost_amount: number | null
  cost_currency: string | null
  insurance_value: number | null
  insurance_currency: string | null
  destination_contact_id: string | null
  buyer?: Contact | null
  destination?: Contact | null
  artist?: {
    first_name: string | null
    last_name: string
    year_of_birth: number | null
    year_of_death: number | null
  
  
  } | null
}

export default function ArtworkDetailPage() {
  
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState<Artwork | null>(null)
  const params = useParams()
  const router = useRouter()
  const id = typeof params.id === 'string' ? params.id : null
  const [artwork, setArtwork] = useState<Artwork | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [labelDraft, setLabelDraft] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null)

  
type Document = {
  id: string
  document_type:  'image' | 'onedrive'
  label: string | null
  url: string
  position: number | null
}

const [documents, setDocuments] = useState<Document[]>([])

  // ✅ OneDrive UI state
  const [odUrl, setOdUrl] = useState('')
  const [odLabel, setOdLabel] = useState('')

  



async function loadDocuments() {
  if (!id) return

  const res = await fetch(`/api/artworks/${id}/documents`, {
    credentials: 'include',
  })

  if (!res.ok) {
    console.error('Failed to load documents')
    setDocuments([])           // ✅ toujours un tableau
    return
  }

async function loadArtwork() {
  if (!id) return

  setLoading(true)
  setError(null)

  try {
    const res = await fetch(`/api/artworks/${id}`, {
      credentials: 'include',
    })

    const data = await res.json()
    console.log('ARTWORK API', res.status, data)

    if (!res.ok) {
      // ✅ on affiche une erreur MAIS on ne casse pas l’état
      setError(data.error || 'Artwork not accessible')
      setArtwork(null)
      setForm(null)
      return
    }

    // ✅ cas normal
    setArtwork(data)
    setForm(data)
    loadDocuments()
  } catch (e) {
    console.error(e)
    setError('Network error')
    setArtwork(null)
    setForm(null)
  } finally {
    setLoading(false)
  }
}
useEffect(() => {
  loadArtwork()
}, [id])





      
async function saveChanges() {
  if (!form || !id) return

  
const payload: Partial<Artwork> = cleanPayload({
  date_proposition: form.date_proposition,
  auctions: form.auctions,
  auction_contact_id: form.auction_contact_id,
  sale_date: form.sale_date ?? null,
  sale_time: form.sale_time ?? null,
  auction_link: form.auction_link ?? null,
  auction_currency: form.auction_currency ?? null,
  estimate_low: form.estimate_low,
  estimate_high: form.estimate_high,
  guarantee: form.guarantee,

  title: form.title,
  medium: form.medium,
  year_execution: form.year_execution,
  height_cm: form.height_cm,
  width_cm: form.width_cm,
  depth_cm: form.depth_cm ?? null,
  condition: form.condition,
  provenance: form.provenance,
  exhibition_literature: form.exhibition_literature,
  certificate: form.certificate,
  certificate_location: form.certificate_location ?? null,

  asking_price: form.asking_price,
  currency: form.currency,
  location_of_work: form.location_of_work,
  check_seller: form.check_seller,
  priority: form.priority,
  status: form.status,
  view_date: form.view_date ?? null,
  notes: form.notes,
  bought: form.bought,
  buyer_contact_id: form.buyer_contact_id ?? null,
  cost_amount: form.cost_amount,
  cost_currency: form.cost_currency ?? null,

  insurance_value: form.insurance_value,
  insurance_currency: form.insurance_currency ?? null,
  destination_contact_id: form.destination_contact_id ?? null,


  artist_id: form.artist_id ?? null,
  proposed_by_id: form.proposed_by_id ?? null,

})

  // 1️⃣ PATCH
  const res = await fetch(`/api/artworks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })


if (!res.ok) {
  console.error(
    'PATCH failed',
    res.status,
    res.statusText
  )

  const raw = await res.text()
  console.error('RAW RESPONSE:', raw)

  return
}


  // 2️⃣ REFETCH COMPLET (clé)
  await loadArtwork()

  // 3️⃣ SORTIE DU MODE ÉDITION (APRÈS le refetch)
  setIsEditing(false)
}



async function saveDocumentLabel(documentId: string) {
  const res = await fetch(
    `/api/artworks/${id}/documents/${documentId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ label: labelDraft }),
    }
  )

  if (!res.ok) {
    console.error('Failed to update document label')
    return
  }

  setEditingLabelId(null)
  setLabelDraft('')
  loadDocuments()
}


  // ✅ OneDrive handler (CORRECTEMENT placé)
  async function addOnedrive() {
    if (!odUrl || !id) return

    await fetch(`/api/artworks/${id}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        type: 'onedrive',
        label: odLabel,
        url: odUrl,
      }),
    })

    setOdUrl('')
    setOdLabel('')
    // reloadDocuments() → à ajouter quand tu chargeras la liste
  }

 
if (!id || loading) {
  return <p style={{ padding: 40 }}>Loading artwork…</p>
}

if (error && !isEditing) {
  return (
    <p style={{ padding: 40, color: 'white' }}>
      {error}
    </p>
  )
}

if (!artwork && !isEditing) {
  return (
    <p style={{ padding: 40, color: 'white' }}>
      This artwork has no visible data or you do not have access.
    </p>
  )

  
async function deleteDocument(documentId: string) {
  if (!id) return

  const confirmed = confirm('Delete this document ?')
  if (!confirmed) return

  const res = await fetch(
    `/api/artworks/${id}/documents/${documentId}`,
    {
      method: 'DELETE',
      credentials: 'include',
    }
  )

  if (!res.ok) {
    console.error('Failed to delete document')
    return
  }

  loadDocuments() // ✅ recharge la liste
}


  const data = await res.json()

  // ✅ Sécurisation absolue
  if (Array.isArray(data)) {
    setDocuments(data)
  } else {
    console.warn('Documents API did not return an array:', data)
    setDocuments([])           // ✅ évite tous les crashes
  }
}


const orderedOneDriveDocs = documents
  .filter(d => d.document_type === 'onedrive')
  .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))


  
async function handleReorderOneDrive(event: any) {
  const { active, over } = event
  if (!over || active.id === over.id) return

  const oldIndex = orderedOneDriveDocs.findIndex(d => d.id === active.id)
  const newIndex = orderedOneDriveDocs.findIndex(d => d.id === over.id)

  const newOrder = reorder(orderedOneDriveDocs, oldIndex, newIndex)

  // Mise à jour locale
  setDocuments(prev =>
    prev.map(d => {
      const idx = newOrder.findIndex(n => n.id === d.id)
      return idx >= 0 ? { ...d, position: idx + 1 } : d
    })
  )

  // Sauvegarde en base
  await fetch(`/api/artworks/${id}/documents/reorder`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(
      newOrder.map((d, index) => ({
        id: d.id,
        position: index + 1,
      }))
    ),
  })
}


const orderedImages = documents
  .filter(d => d.document_type === 'image')
  .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  
async function handleReorderImages(event: any) {
  const { active, over } = event
  if (!over || active.id === over.id) return

  const oldIndex = orderedImages.findIndex(d => d.id === active.id)
  const newIndex = orderedImages.findIndex(d => d.id === over.id)

  const newOrder = reorder(orderedImages, oldIndex, newIndex)

  // ✅ Mise à jour locale
  setDocuments(prev =>
    prev.map(d => {
      const idx = newOrder.findIndex(n => n.id === d.id)
      return idx >= 0 ? { ...d, position: idx + 1 } : d
    })
  )

  // ✅ Sauvegarde serveur
  await fetch(`/api/artworks/${id}/documents/reorder`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(
      newOrder.map((d, index) => ({
        id: d.id,
        position: index + 1,
      }))
    ),
  })
}




 return (
    
    
    <main
      style={{
        padding: 40,
        minHeight: '100vh',
        backgroundColor: '#007a5e',
      }}
    >
      <div style={{ marginBottom: 20 }}>
        
      <GrayButton onClick={() => setIsEditing(!isEditing)}>
        {isEditing ? 'Cancel' : 'Edit'}
      </GrayButton>

      {isEditing && (
        <GrayButton onClick={saveChanges}>
          Save
        </GrayButton>
      )}

        <GrayButton onClick={() => router.push('/artworks')}>
          Back to list
        </GrayButton>
      </div>
      

<Section title="Images">
  <DndContext
    collisionDetection={closestCenter}
    onDragEnd={handleReorderImages}
  >
    <SortableContext
      items={orderedImages.map(img => img.id)}
      strategy={verticalListSortingStrategy}
    >
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {orderedImages.map(img => (
          <SortableItem key={img.id} id={img.id}>
            <a
              href={img.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <div
                style={{
                  position: 'relative',
                  width: 200,
                  height: 200,
                  borderRadius: 6,
                  overflow: 'hidden',
                  background: '#f5f5f5',
                  cursor: 'grab',
                }}
              >
                <Image
                  src={img.url}
                  alt=""
                  fill
                  sizes="200px"
                  style={{ objectFit: 'contain' }}
                />
              </div>
            </a>
          </SortableItem>
        ))}
      </div>
    </SortableContext>
  </DndContext>

  <ImageUpload artworkId={id!} onUploaded={loadDocuments} />
</Section>
          
   
<Section>
  <Row label="Date proposed">
    <EditableDate
      value={form!.date_proposition}
      editing={isEditing}
      onChange={(v) =>
        setForm({ ...form!, date_proposition: v! })
      }
    />
  </Row>

  <Row label="Auctions">
    <EditableCheckbox
      value={form!.auctions}
      editing={isEditing}
      onChange={(v) => setForm({ ...form!, auctions: v })}
    />
  </Row>


{form!.auctions && (
  <Section title="Auction details">
 
<Row label="Auction house">
  <EditableSelectById
    value={form!.auction_contact_id}
    options={contacts}
    editing={isEditing}
    getLabel={(c) =>
      c.company_name ||
      [c.first_name, c.last_name].filter(Boolean).join(' ') ||
      '—'
    }
    onChange={(id) =>
      setForm({ ...form!, auction_contact_id: id })
    }
  />
</Row>


    <Row label="Sale date">
      <EditableDate
        value={form!.sale_date}
        editing={isEditing}
        onChange={(v) =>
          setForm({ ...form!, sale_date: v })
        }
      />
    </Row>

    <Row label="Sale time">
      {isEditing ? (
        <input
          type="time"
          value={form!.sale_time || ''}
          onChange={(e) =>
            setForm({
              ...form!,
              sale_time: e.target.value || null,
            })
          }
        />
      ) : (
        <>{form!.sale_time || '—'}</>
      )}
    </Row>

    <Row label="Auction website">
      {isEditing ? (
        <input
          type="url"
          value={form!.auction_link || ''}
          placeholder="https://…"
          onChange={(e) =>
            setForm({
              ...form!,
              auction_link: e.target.value || null,
            })
          }
        />
      ) : form!.auction_link ? (
        <a
          href={form!.auction_link}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open link
        </a>
      ) : (
        '—'
      )}
    </Row>


<Row label="Auction currency">
  <EditableSelect
    value={form!.auction_currency || ''}
    editing={isEditing}
    options={['USD', 'GBP', 'EUR', 'CHF']}
    onChange={(v) =>
      setForm({
        ...form!,
        auction_currency: v || null,
      })
    }
  />
</Row>

  <Row label="Estimate">
  {isEditing ? (
    <div style={{ display: 'flex', gap: 8 }}>
      <EditableText
        value={form!.estimate_low?.toString() || ''}
        editing
        onChange={(v) =>
          setForm({
            ...form!,
            estimate_low: v ? Number(v) : null,
          })
        }
      />

      <span>–</span>

      <EditableText
        value={form!.estimate_high?.toString() || ''}
        editing
        onChange={(v) =>
          setForm({
            ...form!,
            estimate_high: v ? Number(v) : null,
          })
        }
      />

      <EditableSelect
        value={form!.auction_currency || ''}
        editing
        options={['CHF', 'USD', 'EUR', 'GBP']}
        onChange={(v) =>
          setForm({ ...form!, auction_currency: v || null })
        }
      />
    </div>
  ) : (
    <>
      {formatCurrency(artwork.estimate_low, artwork.auction_currency)}
      {' – '}
      {formatCurrency(artwork.estimate_high, artwork.auction_currency)}
    </>
  )}
</Row>

    <Row label="Guarantee">
      <EditableCheckbox
        value={form!.guarantee}
        editing={isEditing}
        onChange={(v) =>
          setForm({ ...form!, guarantee: v })
        }
      />
    </Row>
  </Section>
)}


<Row label="Proposed by">
  <EditableSelectById
    value={form!.proposed_by_id}
    options={contacts}
    editing={isEditing}
    getLabel={(c) =>
      [c.first_name, c.last_name]
        .filter(Boolean)
        .join(' ') ||
      c.company_name ||
      '—'
    }
    onChange={(id) =>
      setForm({ ...form!, proposed_by_id: id })
    }
  />
</Row>




<Row label="Artist">
  {isEditing ? (
    <ArtistAutocomplete
      value={form!.artist_id}
      initialLabel={
        artwork.artist
          ? [artwork.artist.first_name, artwork.artist.last_name]
              .filter(Boolean)
              .join(' ')
          : null
      }
      onSelect={(id) =>
        setForm({ ...form!, artist_id: id })
      }
    />
  ) : (
    <>{formatArtist(artwork.artist)}</>
  )}
</Row>


      <Row label="Title" hideLabel>
        <EditableText
          value={form!.title}
          editing={isEditing}
          onChange={(v) => setForm({ ...form!, title: v })}
        />
      </Row>

      <Row label="Medium" hideLabel>
        <EditableText
          value={form!.medium}
          editing={isEditing}
          onChange={(v) => setForm({ ...form!, medium: v })}
        />
      </Row>

      <Row label="Dimensions (cm)" hideLabel>
        {isEditing ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              value={form!.height_cm}
              onChange={(e) =>
                setForm({ ...form!, height_cm: Number(e.target.value) })
              }
              placeholder="H"
            />
            <input
              type="number"
              value={form!.width_cm}
              onChange={(e) =>
                setForm({ ...form!, width_cm: Number(e.target.value) })
              }
              placeholder="W"
            />
            <input
              type="number"
              value={form!.depth_cm ?? ''}
              onChange={(e) =>
                setForm({
                  ...form!,
                  depth_cm: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
              placeholder="D"
            />
          </div>
        ) : (
          <div>
            {artwork.height_cm} × {artwork.width_cm}
            {artwork.depth_cm ? ` × ${artwork.depth_cm}` : ''}
          </div>
        )}
      </Row>

      <Row label="Year" hideLabel>
        <EditableText
          value={String(form!.year_execution)}
          editing={isEditing}
          onChange={(v) =>
            setForm({ ...form!, year_execution: Number(v) })
          }
        />
      </Row>

      <Row label="Status">
        <EditableSelect
          value={form!.status}
          editing={isEditing}
          options={['draft', 'viewed', 'negotiation', 'bought']}
          onChange={(v) => setForm({ ...form!, status: v })}
        />
      </Row>

      <Row label="Viewed on">
        <EditableDate
          value={form!.view_date}
          editing={isEditing}
          onChange={(v) => setForm({ ...form!, view_date: v })}
        />
      </Row>

      <Row label="Priority">
        <EditableSelect
          value={form!.priority}
          editing={isEditing}
          options={['low', 'medium', 'high']}
          onChange={(v) => setForm({ ...form!, priority: v })}
        />
      </Row>

      <Row label="Condition">
        <EditableTextarea
          value={form!.condition}
          editing={isEditing}
          onChange={(v) => setForm({ ...form!, condition: v })}
        />
      </Row>
    </Section>


          
    <Section title="Market">
      

<Row label="Asking price">
  {isEditing ? (
    <div style={{ display: 'flex', gap: 8 }}>
      <EditableText
        value={form!.asking_price?.toString() || ''}
        editing
        onChange={(v) =>
          setForm({
            ...form!,
            asking_price: v ? Number(v) : null,
          })
        }
      />

      <EditableSelect
        value={form!.currency}
        editing
        options={['CHF', 'USD', 'EUR', 'GBP']}
        onChange={(v) => setForm({ ...form!, currency: v })}
      />
    </div>
  ) : (
    <>{formatCurrency(artwork.asking_price, artwork.currency)}</>
  )}
</Row>



      <Row label="Location of work">
        <EditableText
          value={form!.location_of_work}
          editing={isEditing}
          onChange={(v) =>
            setForm({ ...form!, location_of_work: v })
          }
        />
      </Row>

      <Row label="Seller checked">
        <EditableText
          value={form!.check_seller}
          editing={isEditing}
          onChange={(v) =>
            setForm({ ...form!, check_seller: v })
          }
        />
      </Row>
    </Section>

{(isEditing || artwork.bought) && (  
<Section title="Acquisition">
  <Row label="Bought">
    <EditableCheckbox
      value={form!.bought}
      editing={isEditing}
      onChange={(v) => setForm({ ...form!, bought: v })}
    />
  </Row>

  {form!.bought && (
    <>
      <Row label="Buyer">
        <EditableSelectById
          value={form!.buyer_contact_id}
          options={contacts}
          editing={isEditing}
          getLabel={(c) =>
            c.company_name ||
            [c.first_name, c.last_name].filter(Boolean).join(' ')
          }
          onChange={(id) =>
            setForm({ ...form!, buyer_contact_id: id })
          }
        />
      </Row>

      <Row label="Cost">
        {isEditing ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <EditableText
              value={form!.cost_amount?.toString() || ''}
              editing
              onChange={(v) =>
                setForm({
                  ...form!,
                  cost_amount: v ? Number(v) : null,
                })
              }
            />
            <EditableSelect
              value={form!.cost_currency || ''}
              editing
              options={['CHF', 'USD', 'EUR', 'GBP']}
              onChange={(v) =>
                setForm({ ...form!, cost_currency: v || null })
              }
            />
          </div>
        ) : (
          <>{formatCurrency(artwork.cost_amount, artwork.cost_currency)}</>
        )}
      </Row>
    </>
  )}
</Section>
)}
  
 {(isEditing || artwork.insurance_value !== null || artwork.destination) && ( 
<Section title="Insurance & Destination">
  <Row label="Insurance value">
    {isEditing ? (
      <div style={{ display: 'flex', gap: 8 }}>
        <EditableText
          value={form!.insurance_value?.toString() || ''}
          editing
          onChange={(v) =>
            setForm({
              ...form!,
              insurance_value: v ? Number(v) : null,
            })
          }
        />
        <EditableSelect
          value={form!.insurance_currency || ''}
          editing
          options={['CHF', 'USD', 'EUR', 'GBP']}
          onChange={(v) =>
            setForm({
              ...form!,
              insurance_currency: v || null,
            })
          }
        />
      </div>
    ) : (
      <>{formatCurrency(
        artwork.insurance_value,
        artwork.insurance_currency
      )}</>
    )}
  </Row>

  <Row label="Destination">
    <EditableSelectById
      value={form!.destination_contact_id}
      options={contacts}
      editing={isEditing}
      getLabel={(c) =>
        c.company_name ||
        [c.first_name, c.last_name].filter(Boolean).join(' ')
      }
      onChange={(id) =>
        setForm({ ...form!, destination_contact_id: id })
      }
    />
  </Row>
</Section>
)}

      
    <Section title="Provenance & Documentation">
      <Row label="Provenance">
        <EditableTextarea
          value={form!.provenance}
          editing={isEditing}
          onChange={(v) =>
            setForm({ ...form!, provenance: v })
          }
        />
      </Row>

      <Row label="Exhibitions / Literature">
        <EditableTextarea
          value={form!.exhibition_literature}
          editing={isEditing}
          onChange={(v) =>
            setForm({ ...form!, exhibition_literature: v })
          }
        />
      </Row>

      <Row label="Certificate">
        {isEditing ? (
          <input
            type="checkbox"
            checked={form!.certificate}
            onChange={(e) =>
              setForm({ ...form!, certificate: e.target.checked })
            }
          />
        ) : (
          <div>{artwork.certificate ? 'Yes' : 'No'}</div>
        )}
      </Row>

      <Row label="Certificate location">
        <EditableText
          value={form!.certificate_location}
          editing={isEditing}
          onChange={(v) =>
            setForm({ ...form!, certificate_location: v })
          }
        />
      </Row>
    </Section>

      
      <Section title="Notes">
        <EditableTextarea
          value={form!.notes}
          editing={isEditing}
          onChange={(v) => setForm({ ...form!, notes: v })}
        />
      </Section>


<Section title="OneDrive documents">
  <DndContext
    collisionDetection={closestCenter}
    onDragEnd={handleReorderOneDrive}
  >
    <SortableContext
      items={orderedOneDriveDocs.map(d => d.id)}
      strategy={verticalListSortingStrategy}
    >
      {orderedOneDriveDocs.map(doc => (
        <SortableItem key={doc.id} id={doc.id}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 6,
            }}
          >
            <strong>{doc.label || 'Document'}</strong>
            <span style={{ color: '#666' }}>
              — {getFileNameFromUrl(doc.url)}
            </span>
            <a href={doc.url} target="_blank">Open</a>
            <GrayButton
              style={{ padding: '4px 8px' }}
              onClick={() => deleteDocument(doc.id)}
            >
              Delete
            </GrayButton>
          </div>
        </SortableItem>
      ))}
    </SortableContext>
  </DndContext>
</Section>


<Section title="Add OneDrive document">
  <input
    placeholder="OneDrive link"
    value={odUrl}
    onChange={(e) => setOdUrl(e.target.value)}
  />
  <input
    placeholder="Label (optional)"
    value={odLabel}
    onChange={(e) => setOdLabel(e.target.value)}
  />
  <GrayButton onClick={addOnedrive}>
    Add OneDrive
  </GrayButton>
</Section>
``
      
      

    </main>
  )
}

/* ---------- UI helpers ---------- */

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
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
  children,
  multiline = false,
  hideLabel = false,
}: {
  label: string
  value?: React.ReactNode
  children?: React.ReactNode
  multiline?: boolean
  hideLabel?: boolean
}) {
  const content = children ?? value ?? '—'

  return (
    <div style={{ marginBottom: 8 }}>
      {!hideLabel && (
        <div
          style={{
            color: '#777',
            fontSize: '0.9rem',
            marginBottom: 2,
          }}
        >
          {label}
        </div>
      )}

      <div
        style={{
          color: '#000',
          whiteSpace: multiline ? 'pre-wrap' : 'normal',
        }}
      >
        {content}
      </div>
    </div>
  )
}

function GrayButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
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

  const name = [artist.first_name, artist.last_name].filter(Boolean).join(' ')
  if (artist.year_of_birth && artist.year_of_death) {
    return `${name} (${artist.year_of_birth}–${artist.year_of_death})`
  }
  if (artist.year_of_birth) {
    return `${name} (né ${artist.year_of_birth})`
  }
  return name
}

function ImageUpload({
  artworkId,
  onUploaded,
}: {
  artworkId: string
  onUploaded: () => void
}) {
  const upload = async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    await fetch(`/api/artworks/${artworkId}/images`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    })

    onUploaded()
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((i) =>
      i.type.startsWith('image')
    )

    if (!item) return

    const file = item.getAsFile()
    if (file) upload(file)
  }

  return (
    <div
      onPaste={handlePaste}
      tabIndex={0}
      style={{
        border: '2px dashed #ccc',
        borderRadius: 6,
        padding: 16,
        marginTop: 10,
      }}
    >
      <strong>Images</strong>
      <p>Paste a screenshot (Ctrl/Cmd + V) or select an image</p>

      <input
        type="file"
        accept="image/*"
        onChange={(e) => e.target.files && upload(e.target.files[0])}
      />
    </div>
  )
}

function EditableText({
  value,
  editing,
  onChange,
}: {
  value: string
  editing: boolean
  onChange: (v: string) => void
}) {
  return editing ? (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: '100%' }}
    />
  ) : (
    <>{value || '—'}</>
  )
}


function EditableTextarea({
  value,
  editing,
  onChange,
}: {
  value: string
  editing: boolean
  onChange: (v: string) => void
}) {
  return editing ? (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: '100%', minHeight: 80 }}
    />
  ) : (
    <div style={{ whiteSpace: 'pre-wrap' }}>{value || '—'}</div>
  )
}


function EditableSelect({
  value,
  options,
  editing,
  onChange,
}: {
  value: string
  options: string[]
  editing: boolean
  onChange: (v: string) => void
}) {
  return editing ? (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  ) : (
    <>{value}</>
  )
}


function EditableDate({
  value,
  editing,
  onChange,
}: {
  value: string | null
  editing: boolean
  onChange: (v: string | null) => void
}) {
  return editing ? (
    <input
      type="date"
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
    />
  ) : (
    <>{value ? formatDate(value) : '—'}</>
  )
}


function getFileNameFromUrl(url: string): string {
  try {
    const cleanUrl = url.split('?')[0]
    return decodeURIComponent(cleanUrl.substring(cleanUrl.lastIndexOf('/') + 1))
  } catch {
    return url
  }
}


function reorder<T>(list: T[], from: number, to: number): T[] {
  const result = [...list]
  const [removed] = result.splice(from, 1)
  result.splice(to, 0, removed)
  return result
}




function SortableItem({
  id,
  children,
}: {
  id: string
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    cursor: 'grab',
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  )
}


function formatContact(contact?: {
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
}) {
  if (!contact) return '—'

  const name = [contact.first_name, contact.last_name]
    .filter(Boolean)
    .join(' ')

  if (name && contact.company_name) {
    return `${name} (${contact.company_name})`
  }

  return name || contact.company_name || '—'
}


function EditableCheckbox({
  value,
  editing,
  onChange,
}: {
  value: boolean
  editing: boolean
  onChange: (v: boolean) => void
}) {
  return editing ? (
    <input
      type="checkbox"
      checked={value}
      onChange={(e) => onChange(e.target.checked)}
    />
  ) : (
    <>{value ? 'Yes' : 'No'}</>
  )
}


function EditableSelectById<T extends { id: string }>({
  value,
  options,
  getLabel,
  editing,
  onChange,
}: {
  value: string | null
  options: T[]
  getLabel: (o: T) => string
  editing: boolean
  onChange: (id: string | null) => void
}) {
  if (!editing) {
    const selected = options.find(o => o.id === value)
    return <>{selected ? getLabel(selected) : '—'}</>
  }

  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value || null)}
    >
      <option value="">—</option>
      {options.map(o => (
        <option key={o.id} value={o.id}>
          {getLabel(o)}
        </option>
      ))}
    </select>
  )
}



function ArtistAutocomplete({
  value,
  initialLabel,
  onSelect,
}: {
  value: string | null
  onSelect: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)

  
useEffect(() => {
  setSelectedLabel(initialLabel)
}, [initialLabel])

  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      return
    }

    const fetchArtists = async () => {
      const res = await fetch(`/api/artists/search?q=${query}`, {
        credentials: 'include',
      })
      if (res.ok) {
        setResults(await res.json())
      }
    }

    fetchArtists()
  }, [query])

  return (
    <div style={{ position: 'relative' }}>
      <input
        placeholder="Search artist…"
        value={selectedLabel ?? query}
        onChange={(e) => {
          setSelectedLabel(null)
          setQuery(e.target.value)
        }}
      />

      {selectedLabel === null && results.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: 'white',
            border: '1px solid #ccc',
            zIndex: 10,
          }}
        >
          {results.map((a: any) => {
            const label = [a.first_name, a.last_name]
              .filter(Boolean)
              .join(' ')

            return (
              <div
                key={a.id}
                style={{ padding: 6, cursor: 'pointer' }}
                onClick={() => {
                  onSelect(a.id)          // ✅ met à jour form.artist_id
                  setSelectedLabel(label) // ✅ feedback visuel immédiat
                  setResults([])          // ✅ ferme la liste
                }}
              >
                {label}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}



function formatCurrency(
  value: number | null | undefined,
  currency?: string | null
) {
  if (value === null || value === undefined) return '—'

  const formatted = new Intl.NumberFormat('fr-CH', {
    maximumFractionDigits: 0,
  }).format(value)

  return currency ? `${currency} ${formatted}` : formatted
}


function cleanPayload<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(
      ([, value]) => value !== undefined
    )
  )
}}