
'use client'

import { useState, useEffect } from 'react'
import { fetchWithAuth } from '@/lib/fetchWithAuth'


type Artist = {
  id: string
  first_name: string
  last_name: string
}

const editInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid #ccc',
  borderRadius: 4,
  fontSize: '0.95rem',
};



type Props = {
  artwork: Artwork
  isEditing: boolean
  setArtwork: (a: Artwork) => void
  artists: Artist[]          // ✅ AJOUT
  contacts: Contact[]          // ✅ AJOUT
}


type Contact = {
  id: string
  first_name: string | null
  last_name: string | null
  company_name: string | null
}


export function ArtworkSection({ artwork, isEditing, setArtwork, artists, contacts }: Props) {
  return (
    <section
      style={{
        marginBottom: 30,
        padding: 16,
        backgroundColor: '#f7f7f7',
        borderRadius: 6,
        color: 'black',
      }}
    >
      

      {isEditing ? (
        
<ArtworkEdit
  artwork={artwork}
  setArtwork={setArtwork}
  artists={artists}
  contacts={contacts}
/>

      ) : (
        <ArtworkView artwork={artwork} />
      )}
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
        alignItems: 'center',
        gap: 12,
        marginBottom: 10,
      }}
    >
      <div
        style={{
          color: '#777',
          fontSize: '0.9rem',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}

function ArtworkView({ artwork }: { artwork: Artwork }) {
  return (
    <>
      {/* Artist */}
      <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>
        {artwork.artist
          ? [artwork.artist.first_name, artwork.artist.last_name]
              .filter(Boolean)
              .join(' ')
          : '—'}
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
      <div style={{ marginTop: 4,  }}>
        {artwork.height_cm && artwork.width_cm
          ? `${artwork.height_cm} × ${artwork.width_cm}` +
            (artwork.depth_cm ? ` × ${artwork.depth_cm}` : '')
          : '—'} cm
      </div>

      {/* ✅ DIVIDER ICI */}
      <Divider />


<div style={{ marginTop: 12 }}>

<InlineRow label="Location">
  {artwork.location_contact ? (
    <div>
      <div style={{ fontWeight: 500 }}>
        {artwork.location_contact.company_name ||
          [artwork.location_contact.first_name,
           artwork.location_contact.last_name]
            .filter(Boolean)
            .join(' ')}
      </div>
    </div>
  ) : (
    '—'
  )}
</InlineRow>


  <InlineRow label="Viewed on">
    {artwork.view_date
      ? new Date(artwork.view_date).toLocaleDateString('fr-CH')
      : '—'}
  </InlineRow>

  
{/* Condition */}
<InlineRow label="Condition">
  {artwork.condition || '—'}
</InlineRow>

{/* Certificate */}
<InlineRow label="Certificate">
  {artwork.certificate ? 'Yes' : 'No'}
</InlineRow>

{/* Certificate location */}
{artwork.certificate === true && (
  
<InlineRow label="Certificate Location">
  {artwork.certificate_location_contact ? (
    <div>
      <div style={{ fontWeight: 500 }}>
        {artwork.certificate_location_contact.company_name ||
          [artwork.certificate_location_contact.first_name,
           artwork.certificate_location_contact.last_name]
            .filter(Boolean)
            .join(' ')}
      </div>
    </div>
  ) : (
    '—'
  )}
</InlineRow>

)}


  
</div>

    </>
  )
}


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




function ArtworkEdit({
  artwork,
  setArtwork,
  artists = [],
  contacts = [],
}: {
  artwork: Artwork
  setArtwork: (a: Artwork) => void
  artists?: Artist[]
  contacts?: Contact[]
}) {

  
  console.log(
    '[ArtworkEdit] contacts length:',
    contacts.length,
    contacts
  )

  /* -----------------------------
   * Local state (search)
   * ----------------------------- */
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Artist[]>([])
  const [isSearching, setIsSearching] = useState(false)
  
const currentLocationContact =
  artwork.location_contact ??
  contacts.find(c => c.id === artwork.location_contact_id) ??
  null

  
const currentCertificateLocationContact =
  artwork.certificate_location_contact_id ??
  contacts.find(
    c => c.id === artwork.certificate_location_contact_id
  ) ??
  null


  /* -----------------------------
   * Artist currently linked
   * ----------------------------- */
  const currentArtist =
    artwork.artist ??
    artists.find(a => a.id === artwork.artist_id) ??
    null

  /* -----------------------------
   * Selected artist id (safe)
   * ----------------------------- */
  const selectedArtistId = artwork.artist_id ?? ''

  /* -----------------------------
   * Live search (debounced)
   * ----------------------------- */
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }

    const controller = new AbortController()
    setIsSearching(true)

    const timeout = setTimeout(async () => {
      try {
        const res = await fetchWithAuth(
          `/api/artists/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        )

        if (!res.ok) return

        const data = await res.json()
        setSearchResults(data)
      } catch (err: any) {
        // ✅ Abort errors are expected during debounce
        if (err.name !== 'AbortError') {
          console.error(err)
        }
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => {
      controller.abort()
      clearTimeout(timeout)
    }
  }, [query])

  /* -----------------------------
   * Artists list to display
   * Always include current artist
   * ----------------------------- */
  const artistsToShow = (() => {
    const base = query.trim() ? searchResults : artists

    if (
      currentArtist &&
      !base.some(a => a.id === currentArtist.id)
    ) {
      return [currentArtist, ...base]
    }

    return base
  })()

  /* -----------------------------
   * Render
   * ----------------------------- */
  return (
    <>

<EditRow label="Date proposition">
  <input
    type="date"
    value={artwork.date_proposition ?? ''}
    onChange={e =>
      setArtwork({
        ...artwork,
        date_proposition: e.target.value || null,
      })
    }
    style={{ ...editInputStyle, width: 180 }}
  />
</EditRow>


<EditRow label="Proposed by">
  {/* Contact currently selected */}
  {artwork.proposed_by_id && (
    <div
      style={{
        fontSize: '0.85rem',
        fontWeight: 500,
        color: '#555',
        marginBottom: 6,
      }}
    >
      Current:&nbsp;
      {contacts.find(c => c.id === artwork.proposed_by_id)
        ? contacts.find(c => c.id === artwork.proposed_by_id)!.company_name ||
          [
            contacts.find(c => c.id === artwork.proposed_by_id)!.first_name,
            contacts.find(c => c.id === artwork.proposed_by_id)!.last_name,
          ]
            .filter(Boolean)
            .join(' ')
        : '—'}
    </div>
  )}

  {/* Select */}
  <select
    value={artwork.proposed_by_id || ''}
    onChange={e =>
      setArtwork({
        ...artwork,
        proposed_by_id: e.target.value || null,
      })
    }
    style={editInputStyle}
  >
    <option value="">—</option>

    {contacts.map(contact => (
      <option key={contact.id} value={contact.id}>
        {contact.company_name ||
          [contact.first_name, contact.last_name]
            .filter(Boolean)
            .join(' ')}
      </option>
    ))}
  </select>

  {/* Add contact */}
  <div
    style={{
      marginTop: 6,
      display: 'flex',
      justifyContent: 'flex-end',
    }}
  >
    <button
      type="button"
      onClick={() => window.open('/contacts/new', '_blank')}
      style={{
        fontSize: '0.8rem',
        background: 'none',
        border: 'none',
        color: '#006b54',
        cursor: 'pointer',
        textDecoration: 'underline',
        padding: 0,
      }}
    >
      + Add contact
    </button>
  </div>
</EditRow>



      <EditRow label="Artist">

        {/* ✅ Current artist always visible */}
        {currentArtist && (
          <div
            style={{
              fontSize: '0.85rem',
              fontWeight: 500,
              color: '#555',
              marginBottom: 6,
            }}
          >
            Current:&nbsp;
            {[currentArtist.first_name, currentArtist.last_name]
              .filter(Boolean)
              .join(' ')}
          </div>
        )}

        {/* 🔍 Search input */}
        <input
          type="text"
          placeholder="Search artist…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            ...editInputStyle,
            marginBottom: 6,
          }}
        />

        {/* ✅ Select */}
        <select
          value={selectedArtistId}
          onChange={e =>
            setArtwork({
              ...artwork,
              artist_id: e.target.value || null,
              artist:
                artistsToShow.find(a => a.id === e.target.value) ||
                null,
            })
          }
          style={editInputStyle}
        >
          <option value="">—</option>

          {artistsToShow.map(artist => (
            <option key={artist.id} value={artist.id}>
              {[artist.first_name, artist.last_name]
                .filter(Boolean)
                .join(' ')}
            </option>
          ))}
        </select>


<div
  style={{
    marginTop: 6,
    display: 'flex',
    justifyContent: 'flex-end',
  }}
>
  <button
    type="button"
    onClick={() => window.open('/artists/new', '_blank')}
    style={{
      fontSize: '0.8rem',
      background: 'none',
      border: 'none',
      color: '#006b54',
      cursor: 'pointer',
      textDecoration: 'underline',
      padding: 0,
    }}
  >
    + Add artist
  </button>
</div>


        {isSearching && (
          <div
            style={{
              fontSize: 12,
              color: '#777',
              marginTop: 4,
            }}
          >
            Searching…
          </div>
        )}
      </EditRow>

      {/* ---------- Other editable fields ---------- */}

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
  <div
    style={{
      display: 'flex',
      gap: 8,
      alignItems: 'center',
    }}
  >
    <input
      type="number"
      placeholder="Height"
      value={artwork.height_cm ?? ''}
      onChange={e =>
        setArtwork({
          ...artwork,
          height_cm: e.target.value
            ? Number(e.target.value)
            : null,
        })
      }
      style={{ ...editInputStyle, width: 100 }}
    />

    <span>×</span>

    <input
      type="number"
      placeholder="Width"
      value={artwork.width_cm ?? ''}
      onChange={e =>
        setArtwork({
          ...artwork,
          width_cm: e.target.value
            ? Number(e.target.value)
            : null,
        })
      }
      style={{ ...editInputStyle, width: 100 }}
    />

    <span>×</span>

    <input
      type="number"
      placeholder="Depth"
      value={artwork.depth_cm ?? ''}
      onChange={e =>
        setArtwork({
          ...artwork,
          depth_cm: e.target.value
            ? Number(e.target.value)
            : null,
        })
      }
      style={{ ...editInputStyle, width: 100 }}
    />
  </div>
</EditRow>

      
<EditRow label="Location">
  {currentLocationContact && (
    <div
      style={{
        fontSize: '0.85rem',
        fontWeight: 500,
        color: '#555',
        marginBottom: 6,
      }}
    >
      Current:&nbsp;
      {currentLocationContact.company_name ||
        [currentLocationContact.first_name,
         currentLocationContact.last_name]
          .filter(Boolean)
          .join(' ')}
    </div>
  )}

  <select
    value={artwork.location_contact_id || ''}
    onChange={e =>
      setArtwork({
        ...artwork,
        location_contact_id: e.target.value || null,
        location_contact:
          contacts.find(c => c.id === e.target.value) || null,
      })
    }
    style={editInputStyle}
  >
    <option value="">—</option>

    {contacts.map(contact => (
      <option key={contact.id} value={contact.id}>
        {contact.company_name ||
          [contact.first_name, contact.last_name]
            .filter(Boolean)
            .join(' ')}
      </option>
    ))}
  </select>
</EditRow>

      <EditRow label="Viewed on">
        <input
          type="date"
          value={artwork.view_date ?? ''}
          onChange={e =>
            setArtwork({
              ...artwork,
              view_date: e.target.value || null,
            })
          }
          style={{ ...editInputStyle, width: 180 }}
        />
      </EditRow>

<EditRow label="Condition">
  <textarea
    rows={3}
    value={artwork.condition ?? ''}
    onChange={e =>
      setArtwork({
        ...artwork,
        condition: e.target.value,
      })
    }
    style={{
      ...editInputStyle,
      resize: 'vertical',
    }}
  />
</EditRow>

<EditRow label="Certificate">
  <select
    value={artwork.certificate === true ? 'yes' : 'no'}
    onChange={e =>
      setArtwork({
        ...artwork,
        certificate: e.target.value === 'yes',
        certificate_location_contact_id:
          e.target.value === 'yes'
            ? artwork.certificate_location_contact_id || null
            : null,
      })
    }
    style={{ ...editInputStyle, width: 120 }}
  >
    <option value="no">No</option>
    <option value="yes">Yes</option>
  </select>
</EditRow>


{artwork.certificate === true && (
  <EditRow label="Certificate Location">
    {currentCertificateLocationContact && (
      <div
        style={{
          fontSize: '0.85rem',
          fontWeight: 500,
          color: '#555',
          marginBottom: 6,
        }}
      >
        Current:&nbsp;
        {currentCertificateLocationContact.company_name ||
          [currentCertificateLocationContact.first_name,
           currentCertificateLocationContact.last_name]
            .filter(Boolean)
            .join(' ')}
      </div>
    )}

    <select
      value={artwork.certificate_location_contact_id || ''}
      onChange={e =>
        setArtwork({
          ...artwork,
          certificate_location_contact_id: e.target.value || null,
          certificate_location_contact:
            contacts.find(c => c.id === e.target.value) || null,
        })
      }
      style={editInputStyle}
    >
      <option value="">—</option>
      {contacts.map(contact => (
        <option key={contact.id} value={contact.id}>
          {contact.company_name ||
            [contact.first_name, contact.last_name]
              .filter(Boolean)
              .join(' ')}
        </option>
      ))}
    </select>
  </EditRow>
)}


    </>
  )
}


function InfoRow({
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
        gridTemplateColumns: 'auto 1fr',
        columnGap: 16,          // ✅ espace clair entre label et valeur
        rowGap: 2,
        alignItems: 'baseline', // ✅ meilleur alignement typographique
        padding: '4px 0',
      }}
    >
      <div
        style={{
          color: '#666',
          fontSize: '0.9rem',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>

      <div style={{ fontSize: '0.95rem' }}>
        {children}
      </div>
    </div>
  )
}


function EditRow({ label, children }: any) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12 }}>{label}</div>
      {children}
    </div>
  )
}
