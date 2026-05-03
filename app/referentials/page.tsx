
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Artist, Contact } from '@/app/types/artwork'


/* ======================
   Types
   ====================== */



type ActionButtonVariant = 'default' | 'danger'

/* ======================
   InlineRow (identique à Artwork)
   ====================== */

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

      <div>{children}</div>
    </div>
  )
}

function ActionButton({

  children,
  onClick,
  disabled,
  variant = 'default',
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: ActionButtonVariant
}) {
  const isDanger = variant === 'danger'

  const backgroundColor = isDanger ? '#d32f2f' : '#666'
  const hoverBackgroundColor = isDanger ? '#b71c1c' : '#555'
  const textColor = isDanger ? '#fff' : '#fff'

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        backgroundColor,
        border: '1px solid #444',
        borderRadius: 4,
        padding: '6px 12px',
        fontSize: '0.9rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: textColor,
        opacity: disabled ? 0.5 : 1,
        transition: 'background-color 0.15s ease',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = hoverBackgroundColor
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = backgroundColor
      }}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow = '0 0 0 2px rgba(0,0,0,0.3)'
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {children}
    </button>
  )
}


/* ======================
   Artists Section
   ====================== */

function ArtistsSection() {
  const [artists, setArtists] = useState<Artist[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [artist, setArtist] = useState<Artist | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [artistSearch, setArtistSearch] = useState('')

const filteredArtists = artists.filter(a => {
  const label = [a.last_name, a.first_name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return label.includes(artistSearch.toLowerCase())
})




useEffect(() => {
  supabase
    .from('artists')
    .select('*')
    .order('last_name', { ascending: true })
    .then(({ data, error }) => {
      if (error) {
        console.error(error)
        setArtists([])
      } else {
        setArtists(data ?? [])
      }
    })
}, [])




  useEffect(() => {
    if (!isEditing) {
      setArtist(
        artists.find(a => a.id === selectedId) || null
      )
    }
  }, [selectedId, artists, isEditing])

async function save() {
  if (!artist || !artist.id) return

  const { id, ...payload } = artist

  const { error } = await supabase
    .from('artists')
    .update(payload)
    .eq('id', id)

  if (error) {
    console.error('Update artist failed:', error)
    alert('Save failed')
    return
  }

  setArtists(list =>
    list.map(a => (a.id === id ? artist : a))
  )
  setIsEditing(false)
}


async function remove() {
  if (!artist || !confirm('Delete this artist?')) return

  const { error } = await supabase
    .from('artists')
    .delete()
    .eq('id', artist.id)

  if (error) {
    console.error('Delete artist failed:', error)
    alert('Delete failed')
    return
  }

  setArtists(list => list.filter(a => a.id !== artist.id))
  setSelectedId(null)
  setArtist(null)
  setIsEditing(false)
}



  return (
    <section
      style={{
        marginBottom: 30,
        padding: 20,
        backgroundColor: '#f7f7f7',
        borderRadius: 6,
        color: 'black',
      }}
    >
      {/* Header */}



<div
  style={{
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginBottom: 16,
  }}
>
  {/* ✅ ADD ARTIST */}
  <ActionButton
    onClick={() => window.open('/artists/new', '_blank')}
  >
    + Add artist
  </ActionButton>

  <ActionButton
    onClick={() => {
      if (isEditing) {
        setIsEditing(false)
      } else {
        if (!artist || !artist.id) return
        setIsEditing(true)
      }
    }}
  >
    {isEditing ? 'Cancel' : 'Edit'}
  </ActionButton>

  {isEditing && (
    <ActionButton
      onClick={remove}
      variant="danger"
      disabled={!artist || !artist.id}
    >
      Delete
    </ActionButton>
  )}

  {isEditing && (
    <ActionButton
      onClick={save}
      disabled={!artist || !artist.id}
    >
      Save
    </ActionButton>
  )}
</div>

    

<h2
  style={{
    fontSize: '1.6rem',
    fontWeight: 700,
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: '0.02em',
  }}
>
  Artists
</h2>


<InlineRow label="Search">
  <input
    type="text"
    placeholder="Search artist…"
    value={artistSearch}
    onChange={e => setArtistSearch(e.target.value)}
    style={{ width: '100%' }}
  />
</InlineRow>


      <InlineRow label="Artist">
        <select
          value={selectedId || ''}
          onChange={e => setSelectedId(e.target.value || null)}
        >
          <option value="">—</option>
          {filteredArtists.map(a => (
            <option key={a.id} value={a.id}>
              {a.last_name} {a.first_name}
            </option>
          ))}
        </select>
      </InlineRow>

      {artist && (
        <>
          <InlineRow label="First name">
            {isEditing ? (
          <input
            value={artist.first_name ?? ''}
            onChange={e =>
              setArtist({ ...artist, first_name: e.target.value })
            }
          />

            ) : (
              artist.first_name
            )}
          </InlineRow>

          <InlineRow label="Last name">
            {isEditing ? (
              <input
                value={artist.last_name ?? ''}
                onChange={e =>
                  setArtist({ ...artist, last_name: e.target.value })
                }
              />
            ) : (
              artist.last_name
            )}
          </InlineRow>

          
<InlineRow label="Year of birth">
  {isEditing ? (
    <input
      type="number"
      value={artist.year_of_birth ?? ''}
      onChange={e =>
        setArtist({
          ...artist,
          year_of_birth: e.target.value
            ? Number(e.target.value)
            : null,
        })
      }
    />
  ) : (
    artist.year_of_birth ?? '—'
  )}
</InlineRow>

<InlineRow label="Year of death">
  {isEditing ? (
    <input
      type="number"
      value={artist.year_of_death ?? ''}
      onChange={e =>
        setArtist({
          ...artist,
          year_of_death: e.target.value
            ? Number(e.target.value)
            : null,
        })
      }
    />
  ) : (
    artist.year_of_death ?? '—'
  )}
</InlineRow>


<InlineRow label="Place of birth">
  {isEditing ? (
    <input
      value={artist.place_of_birth ?? ''}
      onChange={e =>
        setArtist({
          ...artist,
          place_of_birth: e.target.value,
        })
      }
    />
  ) : (
    artist.place_of_birth ?? '—'
  )}
</InlineRow>

<InlineRow label="Place of death">
  {isEditing ? (
    <input
      value={artist.place_of_death ?? ''}
      onChange={e =>
        setArtist({
          ...artist,
          place_of_death: e.target.value,
        })
      }
    />
  ) : (
    artist.place_of_death ?? '—'
  )}
</InlineRow>


<InlineRow label="Notes">
  {isEditing ? (
    <textarea
      rows={4}
      value={artist.notes ?? ''}
      onChange={e =>
        setArtist({
          ...artist,
          notes: e.target.value,
        })
      }
      style={{ width: '100%' }}
    />
  ) : (
    artist.notes || '—'
  )}
</InlineRow>


        </>
      )}
    </section>
  )
}

/* ======================
   Contacts Section
   ====================== */

function ContactsSection() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [contact, setContact] = useState<Contact | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [contactSearch, setContactSearch] = useState('')

  
const filteredContacts = contacts.filter(c => {
  const label = (
    c.company_name ||
    [c.last_name, c.first_name].filter(Boolean).join(' ')
  )
    .toLowerCase()

  return label.includes(contactSearch.toLowerCase())
})




useEffect(() => {
  supabase
    .from('contacts')
    .select('*')
    .order('company_name', { ascending: true })
    .then(({ data, error }) => {
      if (error) {
        console.error(error)
        setContacts([])
      } else {
        setContacts(data ?? [])
      }
    })
}, [])


async function save() {
  if (!contact || !contact.id) return

  const { id, ...payload } = contact

  const { error } = await supabase
    .from('contacts')
    .update(payload)
    .eq('id', id)

  if (error) {
    console.error('Update contact failed:', error)
    alert('Save failed')
    return
  }

  setContacts(list =>
    list.map(c => (c.id === id ? contact : c))
  )
  setIsEditing(false)
}


async function remove() {
  if (!contact || !confirm('Delete this contact?')) return

  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', contact.id)

  if (error) {
    console.error('Delete contact failed:', error)
    alert('Delete failed')
    return
  }

  setContacts(list => list.filter(c => c.id !== contact.id))
  setSelectedId(null)
  setContact(null)
  setIsEditing(false)
}


  useEffect(() => {
    if (!isEditing) {
      setContact(
        contacts.find(c => c.id === selectedId) || null
      )
    }
  }, [selectedId, contacts, isEditing])




  return (
    <section
      style={{
        padding: 20,
        backgroundColor: '#f7f7f7',
        borderRadius: 6,
        color: 'black',
      }}
    >
      

<div
  style={{
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginBottom: 16,
  }}
>
  {/* ✅ ADD CONTACT */}
  <ActionButton
    onClick={() => window.open('/contacts/new', '_blank')}
  >
    + Add contact
  </ActionButton>

  <ActionButton
    onClick={() => {
      if (isEditing) {
        setIsEditing(false)
      } else {
        if (!contact || !contact.id) return
        setIsEditing(true)
      }
    }}
  >
    {isEditing ? 'Cancel' : 'Edit'}
  </ActionButton>

  {isEditing && (
    <ActionButton
      onClick={remove}
      variant="danger"
      disabled={!contact || !contact.id}
    >
      Delete
    </ActionButton>
  )}

  {isEditing && (
    <ActionButton
      onClick={save}
      disabled={!contact || !contact.id}
    >
      Save
    </ActionButton>
  )}
</div>






      

<h2
  style={{
    fontSize: '1.6rem',
    fontWeight: 700,
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: '0.02em',
  }}
>
  Contacts
</h2>


<InlineRow label="Search">
  <input
    type="text"
    placeholder="Search contact…"
    value={contactSearch}
    onChange={e => setContactSearch(e.target.value)}
    style={{ width: '100%' }}
  />
</InlineRow>


      <InlineRow label="Contact">
        <select
          value={selectedId || ''}
          onChange={e => setSelectedId(e.target.value || null)}
        >
          <option value="">—</option>
          {filteredContacts.map(c => (
            <option key={c.id} value={c.id}>
              {c.company_name ||
                [c.last_name, c.first_name].filter(Boolean).join(' ')}
            </option>
          ))}
        </select>
      </InlineRow>

      {contact && (
        <>
          <InlineRow label="Company">
            {isEditing ? (
              <input
                value={contact.company_name || ''}
                onChange={e =>
                  setContact({ ...contact, company_name: e.target.value })
                }
              />
            ) : (
              contact.company_name || '—'
            )}
          </InlineRow>

          <InlineRow label="Email">
            {isEditing ? (
              <input
                value={contact.email || ''}
                onChange={e =>
                  setContact({ ...contact, email: e.target.value })
                }
              />
            ) : (
              contact.email || '—'
            )}
          </InlineRow>


<InlineRow label="First name">
  {isEditing ? (
    <input
      value={contact.first_name ?? ''}
      onChange={e =>
        setContact({
          ...contact,
          first_name: e.target.value,
        })
      }
    />
  ) : (
    contact.first_name ?? '—'
  )}
</InlineRow>

<InlineRow label="Last name">
  {isEditing ? (
    <input
      value={contact.last_name ?? ''}
      onChange={e =>
        setContact({
          ...contact,
          last_name: e.target.value,
        })
      }
    />
  ) : (
    contact.last_name ?? '—'
  )}
</InlineRow>


<InlineRow label="City">
  {isEditing ? (
    <input
      value={contact.city ?? ''}
      onChange={e =>
        setContact({
          ...contact,
          city: e.target.value,
        })
      }
    />
  ) : (
    contact.city ?? '—'
  )}
</InlineRow>


<InlineRow label="Telephone">
  {isEditing ? (
    <input
      value={contact.telephone ?? ''}
      onChange={e =>
        setContact({
          ...contact,
          telephone: e.target.value,
        })
      }
    />
  ) : (
    contact.telephone ?? '—'
  )}
</InlineRow>


<InlineRow label="Role">
  {isEditing ? (
    <input
      value={contact.role ?? ''}
      onChange={e =>
        setContact({
          ...contact,
          role: e.target.value,
        })
      }
    />
  ) : (
    contact.role ?? '—'
  )}
</InlineRow>


<InlineRow label="Notes">
  {isEditing ? (
    <textarea
      rows={4}
      value={contact.notes ?? ''}
      onChange={e =>
        setContact({
          ...contact,
          notes: e.target.value,
        })
      }
      style={{ width: '100%' }}
    />
  ) : (
    contact.notes || '—'
  )}
</InlineRow>

        </>
      )}
    </section>
  )
}

/* ======================
   Page
   ====================== */

export default function ReferentialsPage() {
  return (
    <main
      style={{
        padding: 40,
        minHeight: '100vh',
        backgroundColor: '#006039',
        color: 'white',
      }}
    >
      <ArtistsSection />
      <ContactsSection />
    </main>
  )
}
