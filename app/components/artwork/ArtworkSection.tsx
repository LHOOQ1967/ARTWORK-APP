
'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Artwork, ArtworkForm } from '@/app/types/artwork'

/* ======================
 * Types locaux (UI only)
 * ====================== */

type Contact = {
  id: string
  first_name: string | null
  last_name: string | null
  company_name: string | null
}

type Artist = {
  id: string
  first_name: string | null
  last_name: string | null
}


type ArtworkWithRelations = Artwork & {
  artist?: Artist | null
  location?: Contact | null
  destination?: Contact | null
  certificateLocation?: Contact | null
  buyer?: Contact | null
  auctionContact?: Contact | null
}

type Props = {
  artwork: ArtworkForm
  isEditing: boolean
  setArtwork: (a: ArtworkWithRelations) => void
  addProposal: (contactId: string, date?: string | null) => Promise<void>
  removeProposal: (proposalId: string) => Promise<void>
}


function contactLabel(c?: Contact | Artist | null): string {
  if (!c) return '—'
  return (
    c.company_name ||
    [c.first_name, c.last_name].filter(Boolean).join(' ')
  )
}






function SectionBlock({ children }: { children: React.ReactNode }) {
  return (
    <section
      style={{
        backgroundColor: '#ffffff',
        borderRadius: 8,
        padding: 24,
      }}
    >
      {children}
    </section>
  )
}






const editInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid #ccc',
  borderRadius: 4,
  fontSize: '0.95rem',
}


const CURRENCY_OPTIONS = ['CHF', 'EUR', 'USD', 'GBP', 'HKD']
const PRIORITY_OPTIONS = ['information', 'medium', 'high']
const STATUS_OPTIONS = [
  'draft',
  'viewed',
  'negotiation',
  'bought',
  'archived',
]



/* ======================
 * Composant racine
 * ====================== */


export function ArtworkSection({
  artwork,
  isEditing,
  setArtwork,
  addProposal,
  removeProposal,
}: Props) {


  return (
    <section
      style={{
        marginBottom: 30,
        padding: 0,       
        borderRadius: 6,
        color: 'black',
      }}
    >

{isEditing ? (
  <ArtworkEdit
    artwork={artwork}
    setArtwork={setArtwork}
    isEditing={isEditing}
    addProposal={addProposal}
    removeProposal={removeProposal}
  />
) : (
  <ArtworkView artwork={artwork} />
)}

    </section>
  )
}

/* =========================================================
 * ======================= VIEW =============================
 * ========================================================= */

function ArtworkView({ artwork }: { artwork: ArtworkWithRelations }) {
  const artistLabel = artwork.artist
    ? [artwork.artist.first_name, artwork.artist.last_name]
        .filter(Boolean)
        .join(' ')
    : '—'


  return (
    <>
      {/* Artist */}
      <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>
        {artistLabel}
      </div>

      {/* Title + Year */}
      <div style={{ fontStyle: 'italic', marginTop: 2 }}>
        {artwork.title || '—'}
        {artwork.year_execution && `, ${artwork.year_execution}`}
      </div>

      {/* Medium */}
      <div style={{ marginTop: 6 }}>
        {artwork.medium || '—'}
      </div>

      {/* Signature */}
      <div style={{ marginTop: 6 }}>
        {artwork.signature || '—'}
      </div>

      {/* Dimensions */}
      <div style={{ marginTop: 4 }}>
        {artwork.height_cm && artwork.width_cm
          ? `${artwork.height_cm} × ${artwork.width_cm}${
              artwork.depth_cm ? ` × ${artwork.depth_cm}` : ''
            } cm`
          : '—'}
      </div>

      <Divider />

      <InfoRow
        label="Location"
        contact={artwork.location}
      />

      <InfoRow
        label="Viewed on"
        value={
          artwork.view_date
            ? new Date(artwork.view_date).toLocaleDateString('fr-CH')
            : '—'
        }
      />

      <InfoRow
        label="Condition"
        value={artwork.condition || '—'}
      />

      <InfoRow
        label="Certificate"
        value={artwork.certificate ? 'Yes' : 'No'}
      />

      {artwork.certificate && (
        <InfoRow
          label="Certificate location"
          contact={artwork.certificateLocation}
        />
      )}
    </>
  )
}

/* =========================================================
 * ======================= EDIT =============================
 * ========================================================= */


function ArtworkEdit({
  artwork,
  setArtwork,
  isEditing,
  addProposal,
  removeProposal,
}: {
  artwork: ArtworkWithRelations
  setArtwork: (a: ArtworkWithRelations) => void
  isEditing: boolean
  addProposal: (contactId: string, date?: string | null) => Promise<void>
  removeProposal: (proposalId: string) => Promise<void>
}) {


  
  const [contactOptions, setContactOptions] = useState<Contact[]>([])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    const loadContacts = async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, company_name, first_name, last_name')
        .order('company_name', { ascending: true })

      if (!error) {
        setContactOptions(data ?? [])
      }
    }

    loadContacts()
  }, [])



const [artistOptions, setArtistOptions] = useState<Artist[]>([])
const [contactQuery, setContactQuery] = useState('')
const [contactResults, setContactResults] = useState<Contact[]>([])
const [proposalQuery, setProposalQuery] = useState('')
const [proposalResults, setProposalResults] = useState<Contact[]>([])
const [newProposedAt, setNewProposedAt] = useState('')
const [artistQuery, setArtistQuery] = useState('')
const [artistResults, setArtistResults] = useState<Artist[]>([])
const [auctionQuery, setAuctionQuery] = useState('')
const [auctionResults, setAuctionResults] = useState<Contact[]>([])
const [buyerQuery, setBuyerQuery] = useState('')
const [buyerResults, setBuyerResults] = useState<Contact[]>([])
const [destinationQuery, setDestinationQuery] = useState('')
const [destinationResults, setDestinationResults] = useState<Contact[]>([])




useEffect(() => {
  const loadArtists = async () => {
    const { data } = await supabase
      .from('artists')
      .select('id, first_name, last_name')
      .order('last_name', { ascending: true })

    setArtistOptions(data ?? [])
  }

  loadArtists()
}, [])


useEffect(() => {
  if (!contactQuery.trim()) {
    setContactResults([])
    return
  }

  const timeout = setTimeout(async () => {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, company_name, first_name, last_name')
      .or(
        `company_name.ilike.%${contactQuery}%,first_name.ilike.%${contactQuery}%,last_name.ilike.%${contactQuery}%`
      )
      .limit(10)

    if (!error && data) {
      setContactResults(data)
    }
  }, 300)

  return () => clearTimeout(timeout)
}, [contactQuery])


useEffect(() => {
  if (!proposalQuery.trim()) {
    setProposalResults([])
    return
  }

  const timeout = setTimeout(async () => {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, company_name, first_name, last_name')
      .or(
        `company_name.ilike.%${proposalQuery}%,first_name.ilike.%${proposalQuery}%,last_name.ilike.%${proposalQuery}%`
      )
      .limit(10)

    if (!error && data) {
      setProposalResults(data)
    }
  }, 300)

  return () => clearTimeout(timeout)
}, [proposalQuery])


useEffect(() => {
  if (!artistQuery.trim()) {
    setArtistResults([])
    return
  }

  const timeout = setTimeout(async () => {
    const { data, error } = await supabase
      .from('artists')
      .select('id, first_name, last_name')
      .or(
        `first_name.ilike.%${artistQuery}%,last_name.ilike.%${artistQuery}%`
      )
      .order('last_name', { ascending: true })
      .limit(10)

    if (!error && data) {
      setArtistResults(data)
    }
  }, 300)

  return () => clearTimeout(timeout)
}, [artistQuery])


useEffect(() => {
  if (!auctionQuery.trim()) {
    setAuctionResults([])
    return
  }

  const timeout = setTimeout(async () => {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, company_name, first_name, last_name')
      .or(
        `company_name.ilike.%${auctionQuery}%,first_name.ilike.%${auctionQuery}%,last_name.ilike.%${auctionQuery}%`
      )
      .limit(10)

    if (!error && data) {
      setAuctionResults(data)
    }
  }, 300)

  return () => clearTimeout(timeout)
}, [auctionQuery])


useEffect(() => {
  if (!buyerQuery.trim()) {
    setBuyerResults([])
    return
  }

  const timeout = setTimeout(async () => {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, company_name, first_name, last_name')
      .or(
        `company_name.ilike.%${buyerQuery}%,first_name.ilike.%${buyerQuery}%,last_name.ilike.%${buyerQuery}%`
      )
      .limit(10)

    if (!error && data) {
      setBuyerResults(data)
    }
  }, 300)

  return () => clearTimeout(timeout)
}, [buyerQuery])


useEffect(() => {
  if (!buyerQuery.trim()) {
    setBuyerResults([])
    return
  }

  const timeout = setTimeout(async () => {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, company_name, first_name, last_name')
      .or(
        `company_name.ilike.%${buyerQuery}%,first_name.ilike.%${buyerQuery}%,last_name.ilike.%${buyerQuery}%`
      )
      .limit(10)

    if (!error && data) {
      setBuyerResults(data)
    }
  }, 300)

  return () => clearTimeout(timeout)
}, [buyerQuery])



return (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 30,
    }}
  >

<SectionBlock>
  <h3>Proposal</h3>


<EditRow label="Date proposed">
  {isEditing ? (
    <input
      type="date"
      value={artwork.date_proposition ?? ''}
      onChange={e =>
        setArtwork({
          ...artwork,
          date_proposition: e.target.value || null,
        })
      }
      style={{ ...editInputStyle, width: 160 }}
    />
  ) : artwork.date_proposition ? (
    new Date(artwork.date_proposition).toLocaleDateString('fr-CH')
  ) : (
    '—'
  )}
</EditRow>



<EditRow label="Proposed by">
  <div
    style={{
      display: 'flex',
      gap: 8,
      alignItems: 'center',
    }}
  >
    {isEditing && (
      <input
        type="text"
        placeholder="Search"
        value={contactQuery}
        onChange={e => setContactQuery(e.target.value)}
        style={{
          width: 120,
          padding: '6px 8px',
          fontSize: '0.9rem',
          border: '1px solid #ccc',
          borderRadius: 4,
        }}
      />
    )}

    {isEditing ? (
      <select
        value={artwork.proposed_by_id ?? ''}
        onChange={e =>
          setArtwork({
            ...artwork,
            proposed_by_id: e.target.value || null,
            proposedBy:
              contactResults.find(c => c.id === e.target.value) ||
              contactOptions.find(c => c.id === e.target.value) ||
              null,
          })
        }
        style={{
          ...editInputStyle,
          flex: 1,
        }}
      >
        <option value="">—</option>

        {(contactQuery ? contactResults : contactOptions).map(c => (
          <option key={c.id} value={c.id}>
            {contactLabel(c)}
          </option>
        ))}
      </select>
    ) : (
      <span>{contactLabel(artwork.proposedBy)}</span>
    )}
  </div>
</EditRow>





<EditRow label="Proposed to">
  <div>
    {/* 🔒 Artwork non encore sauvé */}
    {isEditing && !artwork.id && (
      <span
        style={{
          color: '#777',
          fontStyle: 'italic',
          display: 'block',
          marginBottom: 8,
        }}
      >
        Save the artwork before adding proposals
      </span>
    )}

    {/* ✅ Ajout possible uniquement si artwork.id existe */}
    {isEditing && artwork.id && (
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <input
          type="text"
          placeholder="Search"
          value={proposalQuery}
          onChange={e => setProposalQuery(e.target.value)}
          style={{
            width: 120,
            padding: '6px 8px',
            fontSize: '0.9rem',
            border: '1px solid #ccc',
            borderRadius: 4,
          }}
        />

        <input
          type="date"
          value={newProposedAt}
          onChange={e => setNewProposedAt(e.target.value)}
          style={{
            padding: '6px 8px',
            fontSize: '0.9rem',
            border: '1px solid #ccc',
            borderRadius: 4,
          }}
        />

        <select
          onChange={e => {
            if (!e.target.value) return
            addProposal(e.target.value, newProposedAt || null)
            setProposalQuery('')
            setNewProposedAt('')
            e.target.value = ''
          }}
          style={{ ...editInputStyle, flex: 1 }}
        >
          <option value="">Add contact…</option>
          {proposalResults.map(c => (
            <option key={c.id} value={c.id}>
              {contactLabel(c)}
            </option>
          ))}
        </select>
      </div>
    )}

    {/* 📋 Liste existante */}
    {artwork.artwork_proposals?.length ? (
      artwork.artwork_proposals.map(p => (
        <div
          key={p.id}
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'baseline',
            marginBottom: 4,
          }}
        >
          <span>{contactLabel(p.contact)}</span>

          {p.proposed_at && (
            <span style={{ fontSize: 12, color: '#777' }}>
              ({new Date(p.proposed_at).toLocaleDateString('fr-CH')})
            </span>
          )}

          {isEditing && (
            <button
              onClick={() => removeProposal(p.id)}
              style={{
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                color: '#999',
              }}
            >
              ✕
            </button>
          )}
        </div>
      ))
    ) : (
      <span style={{ color: '#777', fontStyle: 'italic' }}>
        Not proposed yet
      </span>
    )}
  </div>
</EditRow>


</SectionBlock>


<SectionBlock>
  <h3 style={{ marginBottom: 16 }}>Artwork</h3>

  {/* Artist */}

<EditRow label="Artist">
  <div
    style={{
      display: 'flex',
      gap: 8,
      alignItems: 'center',
    }}
  >
    {isEditing && (
      <input
        type="text"
        placeholder="Search"
        value={artistQuery}
        onChange={e => setArtistQuery(e.target.value)}
        style={{
          width: 120,
          padding: '6px 8px',
          fontSize: '0.9rem',
          border: '1px solid #ccc',
          borderRadius: 4,
        }}
      />
    )}

    {isEditing ? (
      <select
        value={artwork.artist_id ?? ''}
        onChange={e =>
          setArtwork({
            ...artwork,
            artist_id: e.target.value || null,
            artist:
              artistResults.find(a => a.id === e.target.value) ||
              artistOptions.find(a => a.id === e.target.value) ||
              null,
          })
        }
        style={{
          ...editInputStyle,
          flex: 1,
        }}
      >
        <option value="">—</option>

        {(artistQuery ? artistResults : artistOptions).map(a => (
          <option key={a.id} value={a.id}>
            {[a.first_name, a.last_name].filter(Boolean).join(' ')}
          </option>
        ))}
      </select>
    ) : (
      <span>
        {artwork.artist
          ? [artwork.artist.first_name, artwork.artist.last_name]
              .filter(Boolean)
              .join(' ')
          : '—'}
      </span>
    )}
  </div>
</EditRow>


  {/* Title */}
  <EditRow label="Title">
    <input
      type="text"
      value={artwork.title ?? ''}
      onChange={e =>
        setArtwork({ ...artwork, title: e.target.value })
      }
      style={editInputStyle}
    />
  </EditRow>

  {/* Year */}
  <EditRow label="Year">
    <input
      type="number"
      value={artwork.year_execution ?? ''}
      onChange={e =>
        setArtwork({
          ...artwork,
          year_execution: e.target.value
            ? Number(e.target.value)
            : null,
        })
      }
      style={{ ...editInputStyle, width: 120 }}
    />
  </EditRow>

  {/* Medium */}
  <EditRow label="Medium">
    <input
      type="text"
      value={artwork.medium ?? ''}
      onChange={e =>
        setArtwork({ ...artwork, medium: e.target.value })
      }
      style={editInputStyle}
    />
  </EditRow>

  {/* Signature */}
  <EditRow label="Signature">
    <input
      type="text"
      value={artwork.signature ?? ''}
      onChange={e =>
        setArtwork({ ...artwork, signature: e.target.value })
      }
      style={editInputStyle}
    />
  </EditRow>

  {/* Dimensions */}
  <EditRow label="Dimensions (cm)">
    <div style={{ display: 'flex', gap: 8 }}>
      <DimensionInput
        placeholder="H"
        value={artwork.height_cm}
        onChange={v =>
          setArtwork({ ...artwork, height_cm: v })
        }
      />
      <DimensionInput
        placeholder="W"
        value={artwork.width_cm}
        onChange={v =>
          setArtwork({ ...artwork, width_cm: v })
        }
      />
      <DimensionInput
        placeholder="D"
        value={artwork.depth_cm}
        onChange={v =>
          setArtwork({ ...artwork, depth_cm: v })
        }
      />
    </div>
  </EditRow>

<Divider />


<EditRow label="Location">
  {isEditing ? (
    <select
      value={artwork.location_contact_id ?? ''}
      onChange={e =>
        setArtwork({
          ...artwork,
          location_contact_id: e.target.value || null,
          location:
            contactOptions.find(c => c.id === e.target.value) ||
            null,
        })
      }
      style={editInputStyle}
    >
      <option value="">—</option>
      {contactOptions.map(c => (
        <option key={c.id} value={c.id}>
          {contactLabel(c)}
        </option>
      ))}
    </select>
  ) : (
    contactLabel(artwork.location)
  )}
</EditRow>


<EditRow label="View date">
  {isEditing ? (
    <input
      type="date"
      value={artwork.view_date ?? ''}
      onChange={e =>
        setArtwork({
          ...artwork,
          view_date: e.target.value || null,
        })
      }
      style={{ ...editInputStyle, width: 160 }}
    />
  ) : artwork.view_date ? (
    new Date(artwork.view_date).toLocaleDateString('fr-CH')
  ) : (
    '—'
  )}
</EditRow>

<EditRow label="Condition">
  {isEditing ? (
    <input
      value={artwork.condition ?? ''}
      onChange={e =>
        setArtwork({
          ...artwork,
          condition: e.target.value || null,
        })
      }
      style={editInputStyle}
    />
  ) : (
    artwork.condition || '—'
  )}
</EditRow>

<EditRow label="Certificate">
  {isEditing ? (
    <select
      value={artwork.certificate ? 'yes' : 'no'}
      onChange={e =>
        setArtwork({
          ...artwork,
          certificate: e.target.value === 'yes',
        })
      }
      style={{ ...editInputStyle, width: 90 }}
    >
      <option value="no">No</option>
      <option value="yes">Yes</option>
    </select>
  ) : artwork.certificate ? (
    'Yes'
  ) : (
    'No'
  )}
</EditRow>


{artwork.certificate && (
  <EditRow label="Certificate location">
    {isEditing ? (
      <select
        value={artwork.certificate_location_contact_id ?? ''}
        onChange={e =>
          setArtwork({
            ...artwork,
            certificate_location_contact_id:
              e.target.value || null,
            certificateLocation:
              contactOptions.find(
                c => c.id === e.target.value
              ) || null,
          })
        }
        style={editInputStyle}
      >
        <option value="">—</option>
        {contactOptions.map(c => (
          <option key={c.id} value={c.id}>
            {contactLabel(c)}
          </option>
        ))}
      </select>
    ) : (
      contactLabel(artwork.certificateLocation)
    )}
  </EditRow>
)}



<EditRow label="Priority">
  {isEditing ? (
    <select
      value={artwork.priority ?? ''}
      onChange={e =>
        setArtwork({
          ...artwork,
          priority: e.target.value || null,
        })
      }
      style={{ ...editInputStyle, width: 120 }}
    >
      <option value="">—</option>
      <option value="information">Information</option>
      <option value="medium">Medium</option>
      <option value="high">High</option>
    </select>
  ) : (
    artwork.priority || '—'
  )}
</EditRow>


<EditRow label="Status">
  {isEditing ? (
    <select
      value={artwork.status ?? ''}
      onChange={e =>
        setArtwork({
          ...artwork,
          status: e.target.value || null,
        })
      }
      style={{ ...editInputStyle, width: 160 }}
    >
      <option value="">—</option>
      <option value="draft">Draft</option>
      <option value="viewed">Viewed</option>
      <option value="negotiation">Negotiation</option>
      <option value="sold">Sold</option>
      <option value="archived">Archived</option>
    </select>
  ) : (
    artwork.status || '—'
  )}
</EditRow>




</SectionBlock>


<SectionBlock>
  <h3 style={{ marginBottom: 16 }}>Auction</h3>

 
{/* Auction yes / no + link */}
<EditRow label="Auction">
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}
  >
    <select
      value={artwork.auctions ? 'yes' : 'no'}
      onChange={e =>
        setArtwork({
          ...artwork,
          auctions: e.target.value === 'yes',
          // optionnel : vider le lien si on repasse à "no"
          auction_link:
            e.target.value === 'yes'
              ? artwork.auction_link
              : null,
        })
      }
      style={{ ...editInputStyle, width: 90 }}
    >
      <option value="no">No</option>
      <option value="yes">Yes</option>
    </select>

    {/* ✅ Auction link */}
    {artwork.auctions && (
      isEditing ? (
        <input
          type="url"
          placeholder="Auction link"
          value={artwork.auction_link ?? ''}
          onChange={e =>
            setArtwork({
              ...artwork,
              auction_link: e.target.value || null,
            })
          }
          style={{
            ...editInputStyle,
            flex: 1,
          }}
        />
      ) : artwork.auction_link ? (
        <a
          href={artwork.auction_link}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#007a5e',
            textDecoration: 'underline',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 400,
          }}
          title={artwork.auction_link}
        >
          {new URL(artwork.auction_link).hostname}
        </a>
      ) : (
        <span style={{ color: '#999', fontStyle: 'italic' }}>
          No link
        </span>
      )
    )}
  </div>
</EditRow>


  {artwork.auctions && (
    <div>
      {/* Auction house */}
      <EditRow label="Auction house">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="Search"
            value={auctionQuery}
            onChange={e => setAuctionQuery(e.target.value)}
            style={{
              width: 120,
              padding: '6px 8px',
              border: '1px solid #ccc',
              borderRadius: 4,
            }}
          />

          <select
            value={artwork.auction_contact_id ?? ''}
            onChange={e =>
              setArtwork({
                ...artwork,
                auction_contact_id: e.target.value || null,
                auctionContact:
                  auctionResults.find(c => c.id === e.target.value) ||
                  null,
              })
            }
            style={{ ...editInputStyle, flex: 1 }}
          >
            <option value="">—</option>
            {auctionResults.map(c => (
              <option key={c.id} value={c.id}>
                {contactLabel(c)}
              </option>
            ))}
          </select>
        </div>
      </EditRow>

      {/* Sale date */}
      <EditRow label="Sale date">
        <input
          type="date"
          value={artwork.sale_date ?? ''}
          onChange={e =>
            setArtwork({
              ...artwork,
              sale_date: e.target.value || null,
            })
          }
          style={editInputStyle}
        />
      </EditRow>


<EditRow label="Auction currency">
  {isEditing ? (
    <select
      value={artwork.auction_currency ?? ''}
      onChange={e =>
        setArtwork({
          ...artwork,
          auction_currency: e.target.value || null,
        })
      }
      style={{ ...editInputStyle, width: 110 }}
    >
      <option value="">—</option>
      <option value="CHF">CHF</option>
      <option value="EUR">EUR</option>
      <option value="USD">USD</option>
      <option value="GBP">GBP</option>
      <option value="HKD">HKD</option>
    </select>
  ) : (
    artwork.auction_currency || '—'
  )}
</EditRow>


      {/* Estimate */}
      <EditRow label="Estimate">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            placeholder="Low"
            value={artwork.estimate_low ?? ''}
            onChange={e =>
              setArtwork({
                ...artwork,
                estimate_low:
                  e.target.value === '' ? null : Number(e.target.value),
              })
            }
            style={{ ...editInputStyle, width: 120 }}
          />
          <input
            type="number"
            placeholder="High"
            value={artwork.estimate_high ?? ''}
            onChange={e =>
              setArtwork({
                ...artwork,
                estimate_high:
                  e.target.value === '' ? null : Number(e.target.value),
              })
            }
            style={{ ...editInputStyle, width: 120 }}
          />
        </div>
      </EditRow>

      {/* Result */}
      <EditRow label="Result">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            placeholder="Hammer"
            value={artwork.sold_hammer ?? ''}
            onChange={e =>
              setArtwork({
                ...artwork,
                sold_hammer:
                  e.target.value === '' ? null : Number(e.target.value),
              })
            }
            style={{ ...editInputStyle, width: 120 }}
          />
          <input
            type="number"
            placeholder="Premium"
            value={artwork.sold_premium ?? ''}
            onChange={e =>
              setArtwork({
                ...artwork,
                sold_premium:
                  e.target.value === '' ? null : Number(e.target.value),
              })
            }
            style={{ ...editInputStyle, width: 120 }}
          /> 
<a
  href="https://buyerspremium.blondeau.ch/calculate.php"
  target="_blank"
  rel="noopener noreferrer"
  style={{
    color: '#006039',
    textDecoration: 'underline',
    fontSize: '0.9rem',
  }}
>
  Buyer’s premium calculator
</a>

        </div>
        


      </EditRow>

      {/* Guarantee */}
      <EditRow label="Guarantee">
        <select
          value={artwork.guarantee ? 'yes' : 'no'}
          onChange={e =>
            setArtwork({
              ...artwork,
              guarantee: e.target.value === 'yes',
            })
          }
          style={{ ...editInputStyle, width: 90 }}
        >
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
      </EditRow>
    </div>
  )}
</SectionBlock>


<SectionBlock>
  <h3 style={{ marginBottom: 16 }}>Market</h3>

  {/* Currency */}
  <EditRow label="Currency">
    <select
      value={artwork.currency || ''}
      onChange={e =>
        setArtwork({
          ...artwork,
          currency: e.target.value || null,
        })
      }
      style={{ ...editInputStyle, width: 100 }}
    >
      <option value="">—</option>
      {CURRENCY_OPTIONS.map(c => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  </EditRow>

  {/* Asking price */}
  <EditRow label="Asking price">
    <input
      type="number"
      value={artwork.asking_price ?? ''}
      onChange={e =>
        setArtwork({
          ...artwork,
          asking_price:
            e.target.value === ''
              ? null
              : Number(e.target.value),
        })
      }
      style={{ ...editInputStyle, width: 160 }}
    />
  </EditRow>


</SectionBlock>



<SectionBlock>
  <h3 style={{ marginBottom: 16 }}>Acquisition</h3>

  {/* Acquisition Yes / No */}
  <EditRow label="Acquired">
    <select
      value={artwork.acquired ? 'yes' : 'no'}
      onChange={e =>
        setArtwork({
          ...artwork,
          acquired: e.target.value === 'yes',
        })
      }
      style={{ ...editInputStyle, width: 90 }}
    >
      <option value="no">No</option>
      <option value="yes">Yes</option>
    </select>
  </EditRow>

  {/* Champs visibles uniquement si acquis */}
  {artwork.acquired && (
    <div>
      {/* Buyer */}
      <EditRow label="Buyer">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isEditing && (
            <input
              type="text"
              placeholder="Search"
              value={buyerQuery}
              onChange={e => setBuyerQuery(e.target.value)}
              style={{
                width: 120,
                padding: '6px 8px',
                fontSize: '0.9rem',
                border: '1px solid #ccc',
                borderRadius: 4,
              }}
            />
          )}

          {isEditing ? (
            <select
              value={artwork.buyer_contact_id ?? ''}
              onChange={e =>
                setArtwork({
                  ...artwork,
                  buyer_contact_id: e.target.value || null,
                  buyer:
                    buyerResults.find(c => c.id === e.target.value) ||
                    contactOptions.find(c => c.id === e.target.value) ||
                    null,
                })
              }
              style={{ ...editInputStyle, flex: 1 }}
            >
              <option value="">—</option>
              {(buyerQuery ? buyerResults : contactOptions).map(c => (
                <option key={c.id} value={c.id}>
                  {contactLabel(c)}
                </option>
              ))}
            </select>
          ) : (
            <span>{contactLabel(artwork.buyer)}</span>
          )}
        </div>
      </EditRow>

      {/* Cost */}
      <EditRow label="Cost">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            placeholder="Amount"
            value={artwork.cost_amount ?? ''}
            onChange={e =>
              setArtwork({
                ...artwork,
                cost_amount:
                  e.target.value === '' ? null : Number(e.target.value),
              })
            }
            style={{ ...editInputStyle, width: 140 }}
          />

          <select
            value={artwork.cost_currency || ''}
            onChange={e =>
              setArtwork({
                ...artwork,
                cost_currency: e.target.value || null,
              })
            }
            style={{ ...editInputStyle, width: 90 }}
          >
            <option value="">—</option>
            {CURRENCY_OPTIONS.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </EditRow>

      {/* Insurance */}
      <EditRow label="Insurance">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            placeholder="Amount"
            value={artwork.insurance_value ?? ''}
            onChange={e =>
              setArtwork({
                ...artwork,
                insurance_value:
                  e.target.value === '' ? null : Number(e.target.value),
              })
            }
            style={{ ...editInputStyle, width: 140 }}
          />

          <select
            value={artwork.insurance_currency || ''}
            onChange={e =>
              setArtwork({
                ...artwork,
                insurance_currency: e.target.value || null,
              })
            }
            style={{ ...editInputStyle, width: 90 }}
          >
            <option value="">—</option>
            {CURRENCY_OPTIONS.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </EditRow>

      {/* Destination */}
      <EditRow label="Destination">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isEditing && (
            <input
              type="text"
              placeholder="Search"
              value={destinationQuery}
              onChange={e => setDestinationQuery(e.target.value)}
              style={{
                width: 120,
                padding: '6px 8px',
                fontSize: '0.9rem',
                border: '1px solid #ccc',
                borderRadius: 4,
              }}
            />
          )}

          {isEditing ? (
            <select
              value={artwork.destination_contact_id ?? ''}
              onChange={e =>
                setArtwork({
                  ...artwork,
                  destination_contact_id: e.target.value || null,
                  destination:
                    destinationResults.find(c => c.id === e.target.value) ||
                    contactOptions.find(c => c.id === e.target.value) ||
                    null,
                })
              }
              style={{ ...editInputStyle, flex: 1 }}
            >
              <option value="">—</option>
              {(destinationQuery
                ? destinationResults
                : contactOptions
              ).map(c => (
                <option key={c.id} value={c.id}>
                  {contactLabel(c)}
                </option>
              ))}
            </select>
          ) : (
            <span>{contactLabel(artwork.destination)}</span>
          )}
        </div>
      </EditRow>
    </div>
  )}
</SectionBlock>


<SectionBlock>
  <h3 style={{ marginBottom: 16 }}>Notes</h3>

  <EditRow label="Notes">
    {isEditing ? (
      <textarea
        value={artwork.notes ?? ''}
        onChange={e =>
          setArtwork({
            ...artwork,
            notes: e.target.value,
          })
        }
        style={{
          width: '100%',
          minHeight: 120,
          padding: 8,
          fontSize: '0.95rem',
          border: '1px solid #ccc',
          borderRadius: 4,
          resize: 'vertical',
        }}
      />
    ) : (
      <div style={{ whiteSpace: 'pre-wrap' }}>
        {artwork.notes || '—'}
      </div>
    )}
  </EditRow>
</SectionBlock>


  </div>
)
}

/* =========================================================
 * ======================= UI HELPERS =======================
 * ========================================================= */

function Divider() {
  return (
    <div
      style={{
        borderTop: '2px solid #8a8a8a',
        margin: '10px 0',
      }}
    />
  )
}

function EditRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12 }}>{label}</div>
      {children}
    </div>
  )
}

function InfoRow({
  label,
  value,
  contact,
}: {
  label: string
  value?: string
  contact?: Contact | null
}) {
  const content =
    contact
      ? contact.company_name ||
        [contact.first_name, contact.last_name]
          .filter(Boolean)
          .join(' ')
      : value ?? '—'

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '160px 1fr',
        gap: 12,
        marginBottom: 6,
      }}
    >
      <div style={{ color: '#777', fontSize: '0.9rem' }}>
        {label}
      </div>
      <div>{content}</div>
    </div>
  )
}

function ReadonlyContact({
  label,
  contact,
  hint,
}: {
  label: string
  contact?: Contact | Artist | null
  hint?: string
}) {
  const value =
    contact
      ? contact.company_name ||
        [contact.first_name, contact.last_name]
          .filter(Boolean)
          .join(' ')
      : '—'

  return (
    <EditRow label={label}>
      <input
        type="text"
        value={value}
        disabled
        style={editInputStyle}
      />
      {hint && (
        <div
          style={{
            fontSize: '0.75rem',
            color: '#777',
            marginTop: 4,
          }}
        >
          {hint}
        </div>
      )}
    </EditRow>
  )
}

function DimensionInput({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string
  value: number | null | undefined
  onChange: (v: number | null) => void
}) {
  return (
    <input
      type="number"
      placeholder={placeholder}
      value={value ?? ''}
      onChange={e =>
        onChange(
          e.target.value ? Number(e.target.value) : null
        )
      }
      style={{ ...editInputStyle, width: 90 }}
    />
  )
}
