
'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseBrowser'
import type { ArtworkForm, ArtworkWithRelations, ArtworkProposal, Contact } from '@/app/(protected)/types/artwork'

/* ======================
 * Types locaux (UI only)
 * ====================== */


type Artist = {
  id: string
  first_name: string | null
  last_name: string | null
}


type ArtworkBase = ArtworkForm | ArtworkWithRelations


type Props<T extends ArtworkBase> = {
  artwork: T
  isEditing: boolean
  setArtwork: React.Dispatch<React.SetStateAction<T>>
  addProposal?: (contactId: string, date?: string | null) => Promise<void>
  removeProposal?: (proposalId: string) => Promise<void>
}


function hasPersistentId(
  artwork: ArtworkBase
): artwork is ArtworkWithRelations {
  return typeof (artwork as any).id === 'string'
}



function contactLabel(c?: Contact | Artist | null): string {
  if (!c) return '—'

  // ✅ Si c'est un Contact (company_name existe)
  if ('company_name' in c && c.company_name) {
    return c.company_name
  }

  // ✅ Contact ou Artist → fallback nom/prénom
  return [c.first_name, c.last_name].filter(Boolean).join(' ')
}


function SectionBlock({ children }: { children: React.ReactNode }) {
  return (
    <section
      style={{
        backgroundColor: '#e6e5e5',
        borderRadius: 8,
        padding: 24,
        border: '1px solid #e0e0e0',
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
  backgroundColor: '#ffffff',
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



export function ArtworkSection<T extends ArtworkBase>({
  artwork,
  isEditing,
  setArtwork,
  addProposal,
  removeProposal,
}: Props<T>) {

  // ✅ ICI : wrapper du setter
  const setArtworkWithRelations: React.Dispatch<
    React.SetStateAction<ArtworkWithRelations>
  > | null = hasPersistentId(artwork)
    ? updater => {
        setArtwork(updater as React.SetStateAction<T>)
      }
    : null

  // ✅ ENSUITE seulement le return

return (
  <section
    style={{
      marginBottom: 30,
      padding: 0,
      borderRadius: 6,
      color: 'black',
    }}
  >
    {isEditing && hasPersistentId(artwork) && setArtworkWithRelations ? (
      <ArtworkEdit
        artwork={artwork}
        setArtwork={setArtworkWithRelations}
        isEditing={isEditing}
        addProposal={addProposal}
        removeProposal={removeProposal}
      />
    ) : hasPersistentId(artwork) ? (
      <ArtworkView artwork={artwork} />
    ) : null}
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
  setArtwork: React.Dispatch<React.SetStateAction<ArtworkWithRelations>>
  isEditing: boolean
  addProposal?: (contactId: string, date?: string | null) => Promise<void>
  removeProposal?: (proposalId: string) => Promise<void>
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

<h3
  style={{
    textAlign: 'center',   // ✅ centre uniquement cette ligne
    fontSize: '1.3rem',    // ✅ légèrement plus grand (optionnel)
    }}
>
  Proposal
</h3>


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
          backgroundColor: '#ffffff',
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
          type="date"
          value={newProposedAt}
          onChange={e => setNewProposedAt(e.target.value)}
          style={{
            padding: '6px 8px',
            fontSize: '0.9rem',
            border: '1px solid #ccc',
            borderRadius: 4,
            backgroundColor: '#ffffff',
          }}
        />

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
            backgroundColor: '#ffffff',
          }}
        />

        <select
          onChange={e => {
            if (!e.target.value) return
            addProposal?.(e.target.value, newProposedAt || null)
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
      (artwork.artwork_proposals as ArtworkProposal[]).map(p => (
        <div
          key={p.id}
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'baseline',
            marginBottom: 4,
            border: '1px solid #3a3939',
            borderRadius: 4,
          }}
        >
          <span>{contactLabel(p.contact)}</span>

          {p.proposed_at && (


<span style={{ fontSize: 12,  }}>
  (
  {(
    p.proposed_at
      ? new Date(p.proposed_at)
      : new Date()
  ).toLocaleDateString('fr-CH')}
  )
</span>

          )}

          {isEditing && (
            <button
              onClick={() => removeProposal?.(p.id)}
              style={{
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                color: '#e21111',
              }}
            >
              [delete]
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
<h3
  style={{
    textAlign: 'center',   // ✅ centre uniquement cette ligne
    fontSize: '1.3rem',    // ✅ légèrement plus grand (optionnel)
    }}
>
  Artwork detail
</h3>

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
          backgroundColor: 'white'
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

artist: (() => {
  const a =
    artistResults.find(a => a.id === e.target.value) ||
    artistOptions.find(a => a.id === e.target.value)

  return a
    ? {
        id: a.id,
        first_name: a.first_name ?? '',
        last_name: a.last_name ?? '',
      }
    : null
})(),

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
          backgroundColor: '#ffffff',
        }}
      />
    )}

    {isEditing ? (
      <select
        value={artwork.location_contact_id ?? ''}
        onChange={e =>
          setArtwork({
            ...artwork,
            location_contact_id: e.target.value || null,
            location:
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
      <span>{contactLabel(artwork.location)}</span>
    )}
  </div>
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
          backgroundColor: '#ffffff',
        }}
      />
    )}

    {isEditing ? (
      <select
        value={artwork.certificate_location_contact_id ?? ''}
        onChange={e =>
          setArtwork({
            ...artwork,
            certificate_location_contact_id: e.target.value || null,
            certificateLocation:
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
      <span>{contactLabel(artwork.certificateLocation)}</span>
    )}
  </div>
</EditRow>
)}



<EditRow label="Priority">
  {isEditing ? (
    <select
      value={artwork.priority ?? ''}

onChange={e =>
  setArtwork({
    ...artwork,

priority: e.target.value as
  | 'information'
  | 'medium'
  | 'high',

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
    status: e.target.value as
      | 'draft'
      | 'viewed'
      | 'negotiation'
      | 'bought'
      | 'archived',
  })
}

      style={{ ...editInputStyle, width: 160 }}
    >
      <option value="">—</option>
      <option value="draft">Draft</option>
      <option value="viewed">Viewed</option>
      <option value="negotiation">Negotiation</option>
      <option value="bought">Bought</option>
      <option value="archived">Archived</option>
    </select>
  ) : (
    artwork.status || '—'
  )}
</EditRow>




</SectionBlock>


<SectionBlock>
<h3
  style={{
    textAlign: 'center',   // ✅ centre uniquement cette ligne
    fontSize: '1.3rem',    // ✅ légèrement plus grand (optionnel)
    }}
>
  Auction
</h3>

 
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
              backgroundColor: 'white'
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

            <EditRow label="Sale time">
        <input
          type="time"
          value={artwork.sale_time ?? ''}
          onChange={e =>
            setArtwork({
              ...artwork,
              sale_time: e.target.value || null,
            })
          }
          style={editInputStyle}
        />
      </EditRow>

            <EditRow label="Lot#">
        <input
          type="test"
          value={artwork.lot ?? ''}
          onChange={e =>
            setArtwork({
              ...artwork,
              lot: e.target.value || null,
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
<h3
  style={{
    textAlign: 'center',   // ✅ centre uniquement cette ligne
    fontSize: '1.3rem',    // ✅ légèrement plus grand (optionnel)
    }}
>
  Private Market
</h3>

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
<h3
  style={{
    textAlign: 'center',   // ✅ centre uniquement cette ligne
    fontSize: '1.3rem',    // ✅ légèrement plus grand (optionnel)
    }}
>
  Acquisition
</h3>

  {/* Acquisition Yes / No */}
  <EditRow label="Acquired">
    <select
      value={artwork.date_acquisition ? 'yes' : 'no'}

onChange={e =>
  setArtwork({
    ...artwork,
    date_acquisition:
      e.target.value === 'yes'
        ? artwork.date_acquisition ?? new Date().toISOString().slice(0, 10)
        : null,
  })
}

      style={{ ...editInputStyle, width: 90 }}
    >
      <option value="no">No</option>
      <option value="yes">Yes</option>
    </select>
  </EditRow>




  {/* Champs visibles uniquement si acquis */}
  {artwork.date_acquisition && (
    
    <div>
                  <EditRow label="Date acquisition">
        <input
          type="date"
          value={artwork.date_acquisition ?? ''}
          onChange={e =>
            setArtwork({
              ...artwork,
              date_acquisition: e.target.value || null,
            })
          }
          style={editInputStyle}
        />
      </EditRow>
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
                backgroundColor: 'white'
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


        </div>
      </EditRow>

      {/* Insurance */}
      <EditRow label="Insurance">
        <div style={{ display: 'flex', gap: 8 }}>
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
                backgroundColor: 'white'
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
<h3
  style={{
  
    fontSize: '1.3rem',    // ✅ légèrement plus grand (optionnel)
    }}
>
  Notes
</h3>

  <EditRow label=" ">
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
          backgroundColor: 'white',
          marginTop: '10px'
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
      <div style={{ fontSize: 12, }}>{label}</div>
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
const value = contactLabel(contact)

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
