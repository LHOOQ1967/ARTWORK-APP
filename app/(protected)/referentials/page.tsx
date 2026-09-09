
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseBrowser'
import type { Artist, Contact } from '@/app/(protected)/types/artwork'
import { LinkedText } from '@/components/ui/LinkedText'


/* ======================
   Types
   ====================== */





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
          color: 'black',
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

const editableFieldStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 42,
  padding: '9px 12px',
  border: '1px solid #aabdb3',
  borderRadius: 8,
  backgroundColor: '#fbfdfb',
  boxShadow: 'inset 0 1px 2px rgba(23, 63, 49, 0.05)',
}




/* ======================
   Artists Section
   ====================== */

function ArtistsSection() {
  const [artists, setArtists] = useState<Artist[]>([])
  const [artistCategories, setArtistCategories] = useState<Array<{ legacy_no: number; description: string; definition: string | null }>>([])
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
  supabase
    .from('artist_categories')
    .select('legacy_no, description, definition')
    .order('legacy_no', { ascending: true })
    .then(({ data, error }) => {
      if (!error) setArtistCategories(data ?? [])
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
      className="referential-card"
      style={{
        marginBottom: 30,
        padding: 26,
        border: '1px solid #d7dfda',
        borderRadius: 12,
        backgroundColor: '#fff',
        boxShadow: '0 10px 28px rgba(31,56,46,0.06)',
        color: 'black',
      }}
    >
      {/* Header */}



<div
  style={{
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
  }}
>
  {/* ✅ ADD ARTIST */}
  <button
    onClick={() => window.open('/artists/new', '_self')}
    className="edit-button"
  >
    + Add artist
  </button>

  <button
    onClick={() => {
      if (isEditing) {
        setIsEditing(false)
      } else {
        if (!artist || !artist.id) return
        setIsEditing(true)
      }
    }} className="edit-button"
  >
    {isEditing ? 'Cancel' : 'Edit'}
  </button>

  {isEditing && (
    <button
      onClick={remove}
      
      disabled={!artist || !artist.id}
      className="edit-button"
    >
      Delete
    </button>
  )}

  {isEditing && (
    <button
      onClick={save}
      disabled={!artist || !artist.id}
      className="edit-button"
    >
      Save
    </button>
  )}
</div>

    

<div className="referential-card-heading" style={{ margin: '6px 0 24px', paddingBottom: 18, borderBottom: '1px solid #e4e9e6' }}>
  <div>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 8,
      }}
    >
      <h2 style={{ margin: 0, color: '#173f31', fontSize: '1.65rem' }}>Artists</h2>
      <span className="referential-count-badge">{artists.length}</span>
    </div>
    <p style={{ margin: 0, color: '#62736c' }}>Search and maintain artist biographical information.</p>
  </div>
</div>


<InlineRow label="Search">
  <input
    type="text"
    placeholder="Search artist…"
    value={artistSearch}
    onChange={e => setArtistSearch(e.target.value)}
    className="referential-field"
    style={{ width: '100%', minHeight: 42, padding: '9px 12px', border: '1px solid #c9d3cd', borderRadius: 8, backgroundColor: '#fff' }}
  />
</InlineRow>


      <InlineRow label="Artist">
        <select
          value={selectedId || ''}
          onChange={e => setSelectedId(e.target.value || null)} className="referential-field"
          style={{ width: '100%', minHeight: 42, padding: '9px 12px', border: '1px solid #c9d3cd', borderRadius: 8, backgroundColor: '#fff' }}
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
            className="referential-edit-field"
            style={editableFieldStyle}
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
                className="referential-edit-field"
                style={editableFieldStyle}
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
      className="referential-edit-field"
      style={editableFieldStyle}
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
      className="referential-edit-field"
      style={editableFieldStyle}
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

<InlineRow label="Category">
  {isEditing ? (
    <select
      className="referential-edit-field"
      style={editableFieldStyle}
      value={artist.artist_category_no ?? ''}
      onChange={e =>
        setArtist({
          ...artist,
          artist_category_no: e.target.value ? Number(e.target.value) : null,
        })
      }
    >
      <option value="">—</option>
      {artistCategories.map(category => (
        <option key={category.legacy_no} value={category.legacy_no}>
          {category.description}
        </option>
      ))}
    </select>
  ) : (
    artistCategories.find(category => category.legacy_no === artist.artist_category_no)?.description ?? '—'
  )}
</InlineRow>


<InlineRow label="Place of birth">
  {isEditing ? (
    <input
      className="referential-edit-field"
      style={editableFieldStyle}
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
      className="referential-edit-field"
      style={editableFieldStyle}
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
      className="referential-edit-field"
      style={editableFieldStyle}
      rows={4}
      value={artist.notes ?? ''}
      onChange={e =>
        setArtist({
          ...artist,
          notes: e.target.value,
        })
      }
    />
  ) : (
    artist.notes ? <LinkedText text={artist.notes} /> : '—'
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
      className="referential-card"
      style={{
        padding: 26,
        border: '1px solid #d7dfda',
        borderRadius: 12,
        backgroundColor: '#fff',
        boxShadow: '0 10px 28px rgba(31,56,46,0.06)',
        color: 'black',
      }}
    >
      

<div
  style={{
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
  }}
>
  {/* ✅ ADD CONTACT */}
  <button
    onClick={() => window.open('/contacts/new', '_self')} className="edit-button"
  >
    + Add contact
  </button>

  <button
    onClick={() => {
      if (isEditing) {
        setIsEditing(false)
      } else {
        if (!contact || !contact.id) return
        setIsEditing(true)
      }
    }} className="edit-button"
  >
    {isEditing ? 'Cancel' : 'Edit'}
  </button>

  {isEditing && (
    <button
      onClick={remove}
       disabled={!contact || !contact.id} className="edit-button"
    >
      Delete
    </button>
  )}

  {isEditing && (
    <button
      onClick={save}
      disabled={!contact || !contact.id}
      className="edit-button"
    >
      Save
    </button>
  )}
</div>

<div className="referential-card-heading" style={{ margin: '6px 0 24px', paddingBottom: 18, borderBottom: '1px solid #e4e9e6' }}>
  <div>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 8,
      }}
    >
      <h2 style={{ margin: 0, color: '#173f31', fontSize: '1.65rem' }}>Contacts</h2>
      <span className="referential-count-badge">{contacts.length}</span>
    </div>
    <p style={{ margin: 0, color: '#62736c' }}>Manage companies, institutions and individual contacts.</p>
  </div>
</div>


<InlineRow label="Search">
  <input
    type="text"
    placeholder="Search contact…"
    value={contactSearch}
    onChange={e => setContactSearch(e.target.value)}
    className="referential-field"
    style={{ width: '100%', minHeight: 42, padding: '9px 12px', border: '1px solid #c9d3cd', borderRadius: 8, backgroundColor: '#fff' }}
  />
</InlineRow>


      <InlineRow label="Contact">
        <select
          value={selectedId || ''}
          onChange={e => setSelectedId(e.target.value || null)} 
          className="referential-field"
          style={{ width: '100%', minHeight: 42, padding: '9px 12px', border: '1px solid #c9d3cd', borderRadius: 8, backgroundColor: '#fff' }}
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
                className="referential-edit-field"
                style={editableFieldStyle}
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
                className="referential-edit-field"
                style={editableFieldStyle}
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
      className="referential-edit-field"
      style={editableFieldStyle}
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
      className="referential-edit-field"
      style={editableFieldStyle}
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
      className="referential-edit-field"
      style={editableFieldStyle}
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
      className="referential-edit-field"
      style={editableFieldStyle}
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
      className="referential-edit-field"
      style={editableFieldStyle}
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
      className="referential-edit-field"
      style={editableFieldStyle}
      rows={4}
      value={contact.notes ?? ''}
      onChange={e =>
        setContact({
          ...contact,
          notes: e.target.value,
        })
      }
    />
  ) : (
    contact.notes ? <LinkedText text={contact.notes} /> : '—'
  )}
</InlineRow>

        </>
      )}
    </section>
  )
}

function LibraryReferenceSection({ kind }: { kind: 'authors' | 'related-names' | 'types' }) {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const result = kind === 'authors'
        ? await supabase.from('library_authors').select('legacy_no, first_name, last_name').order('legacy_no', { ascending: true }).limit(10000)
        : kind === 'related-names'
          ? await supabase.from('library_related_names').select('legacy_no, name, location').order('legacy_no', { ascending: true }).limit(10000)
          : await supabase.from('library_book_types').select('legacy_no, type_number, description, full_name').order('legacy_no', { ascending: true }).limit(10000)
      if (!cancelled) {
        setRows((result.data ?? []) as Array<Record<string, unknown>>)
        setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [kind])

  const filteredRows = rows.filter((row) =>
    Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(query.toLowerCase()))
  )
  const title = kind === 'authors' ? 'Authors' : kind === 'related-names' ? 'Related names' : 'Type of books'

  return (
    <section className="referential-card" style={{ padding: 26, border: '1px solid #d7dfda', borderRadius: 12, backgroundColor: '#fff', boxShadow: '0 10px 28px rgba(31,56,46,0.06)', color: 'black' }}>
      <div className="referential-card-heading" style={{ margin: '6px 0 24px', paddingBottom: 18, borderBottom: '1px solid #e4e9e6' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0, color: '#173f31', fontSize: '1.65rem' }}>{title}</h2>
          <span className="referential-count-badge">{rows.length}</span>
        </div>
        <p>Browse the library reference data.</p>
      </div>
      <input className="referential-field" type="search" placeholder={`Search ${title.toLowerCase()}…`} value={query} onChange={(event) => setQuery(event.target.value)} />
      {loading ? <p style={{ marginTop: 18 }}>Loading…</p> : (
        <div style={{ marginTop: 18, maxHeight: 620, overflow: 'auto', border: '1px solid #d7dfda', borderRadius: 8 }}>
          {filteredRows.map((row, index) => {
            const label = kind === 'authors'
              ? [row.last_name, row.first_name].filter(Boolean).join(' ')
              : kind === 'related-names'
                ? row.name || '—'
                : row.full_name || row.description || row.type_number || '—'
            const detail = kind === 'related-names' ? row.location : kind === 'types' ? row.description : row.legacy_no
            return <div key={`${String(row.legacy_no)}-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, padding: '10px 12px', borderBottom: '1px solid #e4e9e6', fontSize: 14 }}><span>{String(label)}</span><span style={{ color: '#62736c' }}>{String(detail ?? '')}</span></div>
          })}
          {filteredRows.length === 0 && <p style={{ padding: 16, color: '#62736c' }}>No matching records.</p>}
        </div>
      )}
    </section>
  )
}

/* ======================
   Page
   ====================== */

export function ReferentialsPage({ section = 'both' }: { section?: 'artists' | 'contacts' | 'both' }) {
  const [activeSection, setActiveSection] = useState<'artists' | 'contacts' | 'authors' | 'related-names' | 'types'>(
    section === 'contacts' ? 'contacts' : 'artists'
  )
  const isCombined = section === 'both'
  return (
    <main
      style={{
        padding: '96px 20px 56px',
        minHeight: '100vh',
        backgroundColor: '#f3f5f1',
        color: '#171717',
      }}
    >
      <div className="referentials-shell" style={{ width: 'min(1280px, 100%)', margin: '0 auto' }}>
        <header className="referentials-header" style={{ marginBottom: 28 }}>
          <div className="referentials-eyebrow" style={{ marginBottom: 7, color: '#557067', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Collection data</div>
          <h1 style={{ margin: 0, color: '#143b2d', fontSize: 'clamp(2rem, 4vw, 3.25rem)', lineHeight: 1, letterSpacing: '-0.035em' }}>Referentials</h1>
          <p style={{ margin: '10px 0 0', color: '#62736c' }}>Manage artists, contacts and library reference data.</p>
          {isCombined && (
            <p style={{ margin: '16px 0 0', color: '#62736c', fontSize: 14 }}>
              Select a referential from the panel.
            </p>
          )}
        </header>
        {isCombined ? (
          <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', gap: 22, alignItems: 'start' }}>
            <aside
              aria-label="Referentials"
              style={{ position: 'sticky', top: 86, padding: 12, border: '1px solid #d7dfda', borderRadius: 12, backgroundColor: '#eef3ef' }}
            >
              <div style={{ margin: '4px 8px 10px', color: '#62736c', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Referentials
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {(['artists', 'contacts', 'authors', 'related-names', 'types'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setActiveSection(item)}
                    aria-pressed={activeSection === item}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '11px 12px', border: 0, borderRadius: 8, backgroundColor: activeSection === item ? '#173f31' : 'transparent', color: activeSection === item ? '#fff' : '#173f31', fontWeight: 700, textAlign: 'left', cursor: 'pointer' }}
                  >
                    <span>{{ artists: 'Artists', contacts: 'Contacts', authors: 'Authors', 'related-names': 'Related names', types: 'Type of books' }[item]}</span>
                    <span aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
            </aside>
            <div>
              {activeSection === 'artists' ? <ArtistsSection /> : activeSection === 'contacts' ? <ContactsSection /> : <LibraryReferenceSection kind={activeSection} />}
            </div>
          </div>
        ) : (
          <>{section === 'artists' ? <ArtistsSection /> : <ContactsSection />}</>
        )}
      </div>
    </main>
  )
}

export default function ReferentialsPageDefault() {
  return <ReferentialsPage />
}
