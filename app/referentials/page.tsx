
'use client'

import { useEffect, useState } from 'react'

/* ======================
   Types
   ====================== */

type Artist = {
  id: string
  first_name: string
  last_name: string
}

type Contact = {
  id: string
  company_name?: string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
}

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

/* ======================
   Artists Section
   ====================== */

function ArtistsSection() {
  const [artists, setArtists] = useState<Artist[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [artist, setArtist] = useState<Artist | null>(null)
  const [isEditing, setIsEditing] = useState(false)


useEffect(() => {
  fetch('/api/artists')
    .then(r => r.json())
    .then(data => {
      if (Array.isArray(data)) {
        setArtists(data)
      } else {
        console.error('Invalid artists response:', data)
        setArtists([]) // ✅ fallback sûr
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
  if (!artist || !artist.id) {
    console.error('Invalid save attempt', artist)
    return
  }

  const { id, ...payload } = artist

  const res = await fetch(`/api/artists/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('PATCH artist failed:', err)
    return
  }

  const updated = await res.json()
  setArtists(list =>
    list.map(a => (a.id === updated.id ? updated : a))
  )

  setIsEditing(false)
}




  async function remove() {
    if (!artist) return
    if (!confirm('Delete this artist?')) return

    await fetch(`/api/artists/${artist.id}`, { method: 'DELETE' })

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



<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
  <button
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
  </button>

  {isEditing && (
    <button
      onClick={save}
      disabled={!artist || !artist.id}
    >
      Save
    </button>
  )}
</div>




      <h2>Artists</h2>

      <InlineRow label="Artist">
        <select
          value={selectedId || ''}
          onChange={e => setSelectedId(e.target.value || null)}
        >
          <option value="">—</option>
          {artists.map(a => (
            <option key={a.id} value={a.id}>
              {a.first_name} {a.last_name}
            </option>
          ))}
        </select>
      </InlineRow>

      {artist && (
        <>
          <InlineRow label="First name">
            {isEditing ? (
              <input
                value={artist.first_name}
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
                value={artist.last_name}
                onChange={e =>
                  setArtist({ ...artist, last_name: e.target.value })
                }
              />
            ) : (
              artist.last_name
            )}
          </InlineRow>

          {isEditing && (
            <button style={{ color: 'red' }} onClick={remove}>
              Delete artist
            </button>
          )}
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

  
useEffect(() => {
  fetch('/api/contacts')
    .then(r => r.json())
    .then(data => {
      if (Array.isArray(data)) {
        setContacts(data)
      } else {
        console.error('Invalid contacts response:', data)
        setContacts([]) // ✅ fallback sûr
      }
    })
}, [])


  useEffect(() => {
    if (!isEditing) {
      setContact(
        contacts.find(c => c.id === selectedId) || null
      )
    }
  }, [selectedId, contacts, isEditing])

  async function save() {
    console.log('SAVE CLICKED', artist)
    if (!contact) return

    const res = await fetch(`/api/contacts/${contact.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contact),
    })

    const updated = await res.json()

    setContacts(list =>
      list.map(c => (c.id === updated.id ? updated : c))
    )
    setIsEditing(false)
  }

  async function remove() {
    if (!contact) return
    if (!confirm('Delete this contact?')) return

    await fetch(`/api/contacts/${contact.id}`, { method: 'DELETE' })

    setContacts(list => list.filter(c => c.id !== contact.id))
    setSelectedId(null)
    setContact(null)
    setIsEditing(false)
  }

  return (
    <section
      style={{
        padding: 20,
        backgroundColor: '#f7f7f7',
        borderRadius: 6,
        color: 'black',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={() => setIsEditing(!isEditing)}>
          {isEditing ? 'Cancel' : 'Edit'}
        </button>
        {isEditing && <button onClick={save}>Save</button>}
      </div>

      <h2>Contacts</h2>

      <InlineRow label="Contact">
        <select
          value={selectedId || ''}
          onChange={e => setSelectedId(e.target.value || null)}
        >
          <option value="">—</option>
          {contacts.map(c => (
            <option key={c.id} value={c.id}>
              {c.company_name ||
                [c.first_name, c.last_name].filter(Boolean).join(' ')}
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

          {isEditing && (
            <button style={{ color: 'red' }} onClick={remove}>
              Delete contact
            </button>
          )}
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
        backgroundColor: '#007a5e',
        color: 'white',
      }}
    >
      <ArtistsSection />
      <ContactsSection />
    </main>
  )
}
