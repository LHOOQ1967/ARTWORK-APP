
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'
import type { Artist, Contact } from '@/app/(protected)/types/artwork'
import { LinkedText } from '@/components/ui/LinkedText'
type ProfileRow = { id: string; email: string | null }
type EntryRow = { created_at?: string | null; created_by?: string | null }
type ContactSortKey = 'company' | 'first' | 'last' | 'city'
type ReferenceSortKey = 'label' | 'detail' | 'secondary' | 'created_at' | 'created_by'
type ReferenceKind = 'authors' | 'related-names' | 'types' | 'artist-categories'

async function fetchProfileEmails(userIds: string[]) {
  if (userIds.length === 0) return {} as Record<string, string>
  const { data } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', userIds)

  const rows = (data ?? []) as ProfileRow[]
  return Object.fromEntries(rows.map((row) => [row.id, row.email ?? 'Utilisateur inconnu']))
}

function formatEntryMeta(
  row: EntryRow,
  emailById: Record<string, string>,
  sourceLabel?: string,
  legacyNo?: number | null
) {
  const legacyImported = typeof legacyNo === 'number' && legacyNo < 1000000
  const enteredAt = legacyImported ? 'Import' : row.created_at ? new Date(row.created_at).toLocaleDateString('fr-CH') : 'Import'
  const enteredBy = legacyImported ? 'Import' : row.created_by ? (emailById[row.created_by] ?? 'Utilisateur inconnu') : 'Import'
  return `Entered at ${enteredAt} by ${enteredBy}${sourceLabel ? ` (${sourceLabel})` : ''}`
}


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

const floatingActionBarStyle: React.CSSProperties = {
  position: 'fixed',
  top: 68,
  right: 24,
  zIndex: 1100,
  display: 'flex',
  gap: 12,
  padding: 12,
  borderRadius: 10,
  backgroundColor: '#f3f5f1',
  boxShadow: '0 8px 24px rgba(31,56,46,0.16)',
}

type ArtistSortKey = 'name' | 'category' | 'birth' | 'death' | 'record'
const REFERENTIAL_PAGE_SIZE = 50

function compareText(left: string, right: string) {
  return left.localeCompare(right, 'fr', { numeric: true, sensitivity: 'base' })
}

function compareMaybeNumber(left: number | null | undefined, right: number | null | undefined) {
  if (left == null && right == null) return 0
  if (left == null) return 1
  if (right == null) return -1
  return left - right
}

function getArtistDisplayName(artist: { first_name?: string | null; last_name?: string | null }) {
  return [artist.last_name, artist.first_name].filter(Boolean).join(' ') || '—'
}

function getArtistRecordLabel(artist: { id: string }) {
  const number = (artist as { legacy_no?: number | null }).legacy_no
  if (typeof number !== 'number') return '—'
  return String(number)
}

function getArtistRecordNumber(artist: { legacy_no?: number | null }) {
  return typeof artist.legacy_no === 'number' ? artist.legacy_no : null
}

function sortLabel(label: string, isActive: boolean, direction: 'asc' | 'desc') {
  if (!isActive) return label
  return `${label} ${direction === 'asc' ? '↑' : '↓'}`
}




/* ======================
   Artists Section
   ====================== */

function ArtistsSection() {
  const [artists, setArtists] = useState<Array<Artist & { legacy_no?: number | null; created_at?: string | null; created_by?: string | null; source?: string | null }>>([])
  const [artistCategories, setArtistCategories] = useState<Array<{ legacy_no: number; description: string; definition: string | null }>>([])
  const [artistSearch, setArtistSearch] = useState('')
  const [artistSortKey, setArtistSortKey] = useState<ArtistSortKey>('name')
  const [artistSortDirection, setArtistSortDirection] = useState<'asc' | 'desc'>('asc')
  const [visibleCount, setVisibleCount] = useState(REFERENTIAL_PAGE_SIZE)

const filteredArtists = artists.filter((artistRow) => {
  const searchable = [
    artistRow.last_name,
    artistRow.first_name,
    String(artistRow.year_of_birth ?? ''),
    String(artistRow.year_of_death ?? ''),
    String(artistRow.artist_category_no ?? ''),
    artistRow.id,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return searchable.includes(artistSearch.toLowerCase())
})

const sortedArtists = [...filteredArtists].sort((left, right) => {
  const direction = artistSortDirection === 'asc' ? 1 : -1

  let comparison = 0
  if (artistSortKey === 'name') {
    comparison = compareText(getArtistDisplayName(left), getArtistDisplayName(right))
  } else if (artistSortKey === 'category') {
    const leftCategory = artistCategories.find((category) => category.legacy_no === left.artist_category_no)?.description ?? ''
    const rightCategory = artistCategories.find((category) => category.legacy_no === right.artist_category_no)?.description ?? ''
    comparison = compareText(leftCategory || '—', rightCategory || '—')
  } else if (artistSortKey === 'birth') {
    comparison = compareMaybeNumber(left.year_of_birth ?? null, right.year_of_birth ?? null)
  } else if (artistSortKey === 'death') {
    comparison = compareMaybeNumber(left.year_of_death ?? null, right.year_of_death ?? null)
  } else {
    comparison = compareMaybeNumber(getArtistRecordNumber(left), getArtistRecordNumber(right))
  }

  if (comparison === 0) {
    comparison = compareText(getArtistDisplayName(left), getArtistDisplayName(right))
  }

  return comparison * direction
})

function toggleArtistSort(key: ArtistSortKey) {
  if (artistSortKey === key) {
    setArtistSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
    return
  }

  setArtistSortKey(key)
  setArtistSortDirection(key === 'record' ? 'desc' : 'asc')
}

useEffect(() => {
  supabase
    .from('artists')
    .select('id, legacy_no, first_name, last_name, year_of_birth, year_of_death, place_of_birth, place_of_death, notes, artist_category_no, created_at, source')
    .order('last_name', { ascending: true })
    .then(({ data, error }) => {
      if (error) {
        console.error(error)
        setArtists([])
      } else {
        setArtists((data ?? []) as Array<Artist & { created_at?: string | null; created_by?: string | null; source?: string | null }>)
      }
    })
}, [])

useEffect(() => {
  setVisibleCount(REFERENTIAL_PAGE_SIZE)
}, [artistSearch, artistSortKey, artistSortDirection])

useEffect(() => {
  supabase
    .from('artist_categories')
    .select('legacy_no, description, definition')
    .order('legacy_no', { ascending: true })
    .then(({ data, error }) => {
      if (!error) setArtistCategories(data ?? [])
    })
}, [])



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



<div style={floatingActionBarStyle}>
  <button
    type="button"
    onClick={() => window.open('/artists/new', '_self')}
    className="edit-button"
  >
    Add artist
  </button>
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


      <div style={{ marginBottom: 18, display: 'grid', gap: 14 }}>
        <InlineRow label="Search">
          <input
            type="text"
            placeholder="Search artist, year, category or record…"
            value={artistSearch}
            onChange={(event) => setArtistSearch(event.target.value)}
            className="referential-field"
            style={{ width: '100%', minHeight: 42, padding: '9px 12px', border: '1px solid #c9d3cd', borderRadius: 8, backgroundColor: '#fff' }}
          />
        </InlineRow>

        <div style={{ overflow: 'auto', border: '1px solid #d7dfda', borderRadius: 8, background: '#fff' }}>
          <div role="table" aria-label="Artists" style={{ minWidth: 840 }}>
            <div role="row" style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1.4fr) minmax(180px, 1fr) 110px 110px 130px' }}>
              {([
                ['name', 'Name'],
                ['category', 'Category'],
                ['birth', 'Birth'],
                ['death', 'Death'],
                ['record', 'Record'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleArtistSort(key)}
                  className="referential-field"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '12px',
                    border: 'none',
                    borderBottom: '1px solid #e4e9e6',
                    background: '#f8fbf8',
                    color: '#173f31',
                    fontWeight: 700,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span>{label}</span>
                  {artistSortKey === key && <span aria-hidden="true">{artistSortDirection === 'asc' ? '↑' : '↓'}</span>}
                </button>
              ))}
            </div>

            {sortedArtists.slice(0, visibleCount).map((artistRow) => {
              const categoryLabel = artistCategories.find((category) => category.legacy_no === artistRow.artist_category_no)?.description ?? '—'

              return (
                <Link
                  key={artistRow.id}
                  href={`/artists/${artistRow.id}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(240px, 1.4fr) minmax(180px, 1fr) 110px 110px 130px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    width: '100%',
                    border: 'none',
                    padding: 0,
                    background: 'transparent',
                    textDecoration: 'none',
                  }}
                >
                  <span style={{ display: 'block', padding: '11px 12px', borderBottom: '1px solid #e4e9e6', color: '#173f31', background: '#fff' }}>
                    {getArtistDisplayName(artistRow)}
                  </span>
                  <span style={{ display: 'block', padding: '11px 12px', borderBottom: '1px solid #e4e9e6', color: '#62736c', background: '#fff' }}>
                    {categoryLabel}
                  </span>
                  <span style={{ display: 'block', padding: '11px 12px', borderBottom: '1px solid #e4e9e6', color: '#62736c', background: '#fff' }}>
                    {artistRow.year_of_birth ?? '—'}
                  </span>
                  <span style={{ display: 'block', padding: '11px 12px', borderBottom: '1px solid #e4e9e6', color: '#62736c', background: '#fff' }}>
                    {artistRow.year_of_death ?? '—'}
                  </span>
                  <span style={{ display: 'block', padding: '11px 12px', borderBottom: '1px solid #e4e9e6', color: '#62736c', background: '#fff' }} title={artistRow.id}>
                    {getArtistRecordLabel(artistRow)}
                  </span>
                </Link>
              )
            })}
          </div>

          {sortedArtists.length === 0 && <p style={{ padding: 16, color: '#62736c' }}>No matching artists.</p>}
          {visibleCount < sortedArtists.length && (
            <div className="no-print" style={{ display: 'flex', gap: 12, justifyContent: 'center', padding: 12, borderTop: '1px solid #e4e9e6' }}>
              <button
                type="button"
                className="edit-button"
                onClick={() => setVisibleCount((current) => Math.min(current + REFERENTIAL_PAGE_SIZE, sortedArtists.length))}
              >
                {`Load more results (+${Math.min(REFERENTIAL_PAGE_SIZE, sortedArtists.length - visibleCount)})`}
              </button>
              <button
                type="button"
                className="edit-button"
                onClick={() => setVisibleCount(sortedArtists.length)}
              >
                {`Load all (${sortedArtists.length})`}
              </button>
            </div>
          )}
        </div>
      </div>
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
  const [contactSortKey, setContactSortKey] = useState<ContactSortKey>('company')
  const [contactSortDirection, setContactSortDirection] = useState<'asc' | 'desc'>('asc')
  const [visibleCount, setVisibleCount] = useState(REFERENTIAL_PAGE_SIZE)

  function formatContactListLabel(contactRow: Contact) {
    const parts = [
      contactRow.company_name || null,
      contactRow.first_name || null,
      contactRow.last_name || null,
      contactRow.city || null,
    ].filter(Boolean)

    return parts.length > 0 ? parts.join(' - ') : '—'
  }

  function toggleContactSort(key: ContactSortKey) {
    if (contactSortKey === key) {
      setContactSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setContactSortKey(key)
    setContactSortDirection('asc')
  }

  
const filteredContacts = contacts.filter(c => {
  const label = [c.company_name, c.first_name, c.last_name, c.city, c.email]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return label.includes(contactSearch.toLowerCase())
})

  const sortedContacts = [...filteredContacts].sort((left, right) => {
    const direction = contactSortDirection === 'asc' ? 1 : -1
    const leftValue = contactSortKey === 'company'
      ? left.company_name || ''
      : contactSortKey === 'first'
        ? left.first_name || ''
        : contactSortKey === 'last'
          ? left.last_name || ''
          : left.city || ''
    const rightValue = contactSortKey === 'company'
      ? right.company_name || ''
      : contactSortKey === 'first'
        ? right.first_name || ''
        : contactSortKey === 'last'
          ? right.last_name || ''
          : right.city || ''

    return leftValue.localeCompare(rightValue, 'fr', { numeric: true, sensitivity: 'base' }) * direction
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

  useEffect(() => {
    setVisibleCount(REFERENTIAL_PAGE_SIZE)
  }, [contactSearch, contactSortKey, contactSortDirection])


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
      

<div style={floatingActionBarStyle}>
  <button
    type="button"
    onClick={() => window.open('/contacts/new', '_self')} className="edit-button"
  >
    Add contact
  </button>

  {isEditing && (
    <button
      type="button"
      onClick={remove}
      disabled={!contact?.id} className="edit-button edit-button-danger"
    >
      Delete
    </button>
  )}

  {isEditing && (
    <button
      type="button"
      onClick={save}
      disabled={!contact?.id}
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


      <div style={{ marginTop: 14 }}>
        <div style={{ overflowX: 'auto', border: '1px solid #d7dfda', borderRadius: 8, background: '#fff' }}>
          <div role="row" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.2fr) minmax(180px, 1fr) minmax(180px, 1fr) minmax(160px, 1fr)' }}>
            {([
              ['company', 'Company'],
              ['first', 'First name'],
              ['last', 'Last name'],
              ['city', 'City'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleContactSort(key)}
                className="referential-field"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '12px',
                  border: 'none',
                  borderBottom: '1px solid #e4e9e6',
                  background: '#f8fbf8',
                  color: '#173f31',
                  fontWeight: 700,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span>{label}</span>
                {contactSortKey === key && <span aria-hidden="true">{contactSortDirection === 'asc' ? '↑' : '↓'}</span>}
              </button>
            ))}
          </div>
          {sortedContacts.slice(0, visibleCount).map((c) => (
            <Link
              key={c.id}
              href={`/contacts/${c.id}/edit`}
              style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.2fr) minmax(180px, 1fr) minmax(180px, 1fr) minmax(160px, 1fr)', width: '100%', background: '#fff', color: '#173f31', textAlign: 'left', textDecoration: 'none', fontSize: 16 }}
            >
              <span style={{ padding: '10px 12px', borderBottom: '1px solid #e4e9e6' }}>{c.company_name || '—'}</span>
              <span style={{ padding: '10px 12px', borderBottom: '1px solid #e4e9e6' }}>{c.first_name || '—'}</span>
              <span style={{ padding: '10px 12px', borderBottom: '1px solid #e4e9e6' }}>{c.last_name || '—'}</span>
              <span style={{ padding: '10px 12px', borderBottom: '1px solid #e4e9e6' }}>{c.city || '—'}</span>
            </Link>
          ))}
        </div>
        {visibleCount < sortedContacts.length && (
          <div className="no-print" style={{ display: 'flex', gap: 12, justifyContent: 'center', padding: 12 }}>
            <button
              type="button"
              className="edit-button"
              onClick={() => setVisibleCount((current) => Math.min(current + REFERENTIAL_PAGE_SIZE, sortedContacts.length))}
            >
              {`Load more results (+${Math.min(REFERENTIAL_PAGE_SIZE, sortedContacts.length - visibleCount)})`}
            </button>
            <button
              type="button"
              className="edit-button"
              onClick={() => setVisibleCount(sortedContacts.length)}
            >
              {`Load all (${sortedContacts.length})`}
            </button>
          </div>
        )}
      </div>

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

function LibraryReferenceSection({ kind }: { kind: ReferenceKind }) {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [profileEmails, setProfileEmails] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<ReferenceSortKey>('label')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [visibleCount, setVisibleCount] = useState(REFERENTIAL_PAGE_SIZE)

  useEffect(() => {
    setSortKey('label')
    setSortDirection('asc')
    setVisibleCount(REFERENTIAL_PAGE_SIZE)
  }, [kind])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const result = kind === 'authors'
        ? await supabase.from('library_authors').select('legacy_no, first_name, last_name, created_at, created_by').order('legacy_no', { ascending: false }).limit(10000)
        : kind === 'related-names'
          ? await supabase.from('library_related_names').select('legacy_no, name, location, created_at, created_by').order('legacy_no', { ascending: false }).limit(10000)
          : kind === 'types'
            ? await supabase.from('library_book_types').select('legacy_no, type_number, description, full_name, created_at, created_by').order('legacy_no', { ascending: false }).limit(10000)
            : await supabase.from('artist_categories').select('legacy_no, description, definition, created_at, created_by').order('legacy_no', { ascending: false }).limit(10000)
      if (!cancelled) {
        const dataRows = (result.data ?? []) as Array<Record<string, unknown>>
        setRows(dataRows)
        const userIds = Array.from(
          new Set(
            dataRows
              .map((row) => row.created_by)
              .filter((value): value is string => typeof value === 'string' && value.length > 0)
          )
        )
        setProfileEmails(await fetchProfileEmails(userIds))
        setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [kind])

  const title = kind === 'authors' ? 'Authors' : kind === 'related-names' ? 'Related names' : kind === 'types' ? 'Type of books' : 'Artist categories'

  const normalizedRows = rows.map((row) => {
    const legacyNo = typeof row.legacy_no === 'number' ? row.legacy_no : Number(row.legacy_no)
    const createdAt = typeof row.created_at === 'string' ? row.created_at : null
    const createdBy = typeof row.created_by === 'string' ? profileEmails[row.created_by] ?? 'Utilisateur inconnu' : '—'

    if (kind === 'authors') {
      return {
        row,
        label: [row.last_name, row.first_name].filter(Boolean).join(' ') || '—',
        detail: typeof row.legacy_no === 'number' ? String(row.legacy_no) : '—',
        secondary: '',
        legacyNo,
        createdAt,
        createdBy,
      }
    }

    if (kind === 'related-names') {
      return {
        row,
        label: (row.name as string | null | undefined) || '—',
        detail: (row.location as string | null | undefined) || '—',
        secondary: typeof row.legacy_no === 'number' ? String(row.legacy_no) : '—',
        legacyNo,
        createdAt,
        createdBy,
      }
    }

    if (kind === 'types') {
      return {
        row,
        label: (row.type_number as string | null | undefined) || '—',
        detail: (row.description as string | null | undefined) || '—',
        secondary: (row.full_name as string | null | undefined) || '—',
        legacyNo,
        createdAt,
        createdBy,
      }
    }

    return {
      row,
      label: (row.description as string | null | undefined) || '—',
      detail: '',
      secondary: '',
      legacyNo,
      createdAt,
      createdBy,
    }
  })

  const filteredRows = normalizedRows.filter((item) =>
    [item.label, item.detail, item.secondary, String(item.legacyNo ?? ''), item.createdAt ? new Date(item.createdAt).toLocaleDateString('fr-CH') : '', item.createdBy]
      .join(' ')
      .toLowerCase()
      .includes(query.toLowerCase())
  )

  useEffect(() => {
    setVisibleCount(REFERENTIAL_PAGE_SIZE)
  }, [query, sortKey, sortDirection])

  const sortedRows = [...filteredRows].sort((left, right) => {
    const direction = sortDirection === 'asc' ? 1 : -1
    let comparison = 0

    if (sortKey === 'label') {
      comparison = compareText(left.label, right.label)
    } else if (sortKey === 'detail') {
      comparison = compareText(left.detail, right.detail)
    } else if (sortKey === 'secondary') {
      comparison = compareText(left.secondary, right.secondary)
    } else if (sortKey === 'created_at') {
      comparison = compareMaybeNumber(left.createdAt ? new Date(left.createdAt).getTime() : null, right.createdAt ? new Date(right.createdAt).getTime() : null)
    } else {
      comparison = compareText(left.createdBy, right.createdBy)
    }

    if (comparison === 0) {
      comparison = compareText(left.label, right.label)
    }

    return comparison * direction
  })

  const columns = kind === 'authors'
    ? [
        { key: 'label' as const, label: 'Name', width: 'minmax(240px, 1.2fr)' },
        { key: 'detail' as const, label: 'Number', width: '120px' },
        { key: 'created_at' as const, label: 'Created on', width: '160px' },
        { key: 'created_by' as const, label: 'Created by', width: 'minmax(220px, 1fr)' },
      ]
    : kind === 'related-names'
      ? [
          { key: 'label' as const, label: 'Name', width: 'minmax(220px, 1fr)' },
          { key: 'detail' as const, label: 'Location', width: 'minmax(180px, 1fr)' },
          { key: 'secondary' as const, label: 'Number', width: '120px' },
          { key: 'created_at' as const, label: 'Created on', width: '160px' },
          { key: 'created_by' as const, label: 'Created by', width: 'minmax(220px, 1fr)' },
        ]
      : kind === 'types'
        ? [
            { key: 'label' as const, label: 'Type number', width: 'minmax(160px, 0.8fr)' },
            { key: 'detail' as const, label: 'Description', width: 'minmax(220px, 1fr)' },
            { key: 'secondary' as const, label: 'Full name', width: 'minmax(240px, 1.2fr)' },
            { key: 'created_at' as const, label: 'Created on', width: '160px' },
            { key: 'created_by' as const, label: 'Created by', width: 'minmax(220px, 1fr)' },
          ]
        : [
            { key: 'label' as const, label: 'Description', width: 'minmax(320px, 1.6fr)' },
            { key: 'created_at' as const, label: 'Created on', width: '160px' },
            { key: 'created_by' as const, label: 'Created by', width: 'minmax(220px, 1fr)' },
          ]

  const gridTemplateColumns = columns.map((column) => column.width).join(' ')

  function toggleSort(key: ReferenceSortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  function displayDate(value: string | null) {
    if (!value) return '—'
    return new Date(value).toLocaleDateString('fr-CH')
  }

  return (
    <section className="referential-card" style={{ padding: 26, border: '1px solid #d7dfda', borderRadius: 12, backgroundColor: '#fff', boxShadow: '0 10px 28px rgba(31,56,46,0.06)', color: 'black' }}>
      <div className="referential-card-heading" style={{ margin: '6px 0 24px', paddingBottom: 18, borderBottom: '1px solid #e4e9e6' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ margin: 0, color: '#173f31', fontSize: '1.65rem' }}>{title}</h2>
            <span className="referential-count-badge">{rows.length}</span>
          </div>
          <div style={floatingActionBarStyle}>
            <Link className="edit-button" href={`/referentials/new?kind=${kind}`}>Add {title.toLowerCase()}</Link>
          </div>
        </div>
        <p>Browse the library reference data.</p>
      </div>
      <InlineRow label="Search">
        <input className="referential-field" style={{ width: '100%' }} type="search" placeholder={`Search ${title.toLowerCase()}…`} value={query} onChange={(event) => setQuery(event.target.value)} />
      </InlineRow>
      {loading ? <p style={{ marginTop: 18 }}>Loading…</p> : (
        <>
          <div style={{ marginTop: 18, overflowX: 'auto', border: '1px solid #d7dfda', borderRadius: 8 }}>
            <div role="row" style={{ display: 'grid', gridTemplateColumns }}>
              {columns.map((column) => (
                <button
                  key={column.key}
                  type="button"
                  onClick={() => toggleSort(column.key)}
                  className="referential-field"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '12px',
                    border: 'none',
                    borderBottom: '1px solid #e4e9e6',
                    background: '#f8fbf8',
                    color: '#173f31',
                    fontWeight: 700,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span>{column.label}</span>
                  {sortKey === column.key && <span aria-hidden="true">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                </button>
              ))}
            </div>
            {sortedRows.slice(0, visibleCount).map((item, index) => {
              const path = kind === 'authors' ? 'authors' : kind === 'related-names' ? 'related-names' : kind === 'types' ? 'types' : 'artist-categories'
              const href = `/${path}/${item.legacyNo}/edit`

              return (
                <Link
                  key={`${String(item.legacyNo)}-${index}`}
                  href={href}
                  style={{ display: 'grid', gridTemplateColumns, gap: 0, padding: 0, borderBottom: '1px solid #e4e9e6', fontSize: 16, color: '#173f31', textDecoration: 'none' }}
                >
                  <span style={{ padding: '10px 12px' }}>{item.label}</span>
                  {kind === 'authors' && <span style={{ padding: '10px 12px', color: '#62736c' }}>{item.detail}</span>}
                  {kind === 'related-names' && <span style={{ padding: '10px 12px', color: '#62736c' }}>{item.detail}</span>}
                  {kind === 'types' && <span style={{ padding: '10px 12px', color: '#62736c' }}>{item.detail}</span>}
                  {kind === 'types' && <span style={{ padding: '10px 12px', color: '#62736c' }}>{item.secondary}</span>}
                  {kind === 'related-names' && <span style={{ padding: '10px 12px', color: '#62736c' }}>{item.secondary}</span>}
                  {kind === 'authors' && <span style={{ padding: '10px 12px', color: '#62736c' }}>{displayDate(item.createdAt)}</span>}
                  {kind === 'related-names' && <span style={{ padding: '10px 12px', color: '#62736c' }}>{displayDate(item.createdAt)}</span>}
                  {kind === 'types' && <span style={{ padding: '10px 12px', color: '#62736c' }}>{displayDate(item.createdAt)}</span>}
                  {kind === 'artist-categories' && <span style={{ padding: '10px 12px', color: '#62736c' }}>{displayDate(item.createdAt)}</span>}
                  {kind === 'authors' && <span style={{ padding: '10px 12px', color: '#62736c' }}>{item.createdBy}</span>}
                  {kind === 'related-names' && <span style={{ padding: '10px 12px', color: '#62736c' }}>{item.createdBy}</span>}
                  {kind === 'types' && <span style={{ padding: '10px 12px', color: '#62736c' }}>{item.createdBy}</span>}
                  {kind === 'artist-categories' && <span style={{ padding: '10px 12px', color: '#62736c' }}>{item.createdBy}</span>}
                </Link>
              )
            })}
            {sortedRows.length === 0 && <p style={{ padding: 16, color: '#62736c' }}>No matching records.</p>}
          </div>
          {visibleCount < sortedRows.length && (
            <div className="no-print" style={{ display: 'flex', gap: 12, justifyContent: 'center', padding: 12 }}>
              <button
                type="button"
                className="edit-button"
                onClick={() => setVisibleCount((current) => Math.min(current + REFERENTIAL_PAGE_SIZE, sortedRows.length))}
              >
                {`Load more results (+${Math.min(REFERENTIAL_PAGE_SIZE, sortedRows.length - visibleCount)})`}
              </button>
              <button
                type="button"
                className="edit-button"
                onClick={() => setVisibleCount(sortedRows.length)}
              >
                {`Load all (${sortedRows.length})`}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/* ======================
   Page
   ====================== */

export function ReferentialsPage({ section = 'both' }: { section?: 'artists' | 'contacts' | 'both' }) {
  const params = useSearchParams()
  const sectionParam = params.get('section')
  const querySection = sectionParam === 'artists' || sectionParam === 'contacts' || sectionParam === 'authors' || sectionParam === 'related-names' || sectionParam === 'types' || sectionParam === 'artist-categories'
    ? sectionParam
    : null

  const initialSection = querySection
    ? querySection
    : section === 'contacts'
      ? 'contacts'
      : 'artists'

  const [activeSection, setActiveSection] = useState<'artists' | 'contacts' | 'authors' | 'related-names' | 'types' | 'artist-categories'>(
    initialSection
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
                {(['artists', 'contacts', 'authors', 'related-names', 'types', 'artist-categories'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setActiveSection(item)}
                    aria-pressed={activeSection === item}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '11px 12px', border: 0, borderRadius: 8, backgroundColor: activeSection === item ? '#173f31' : 'transparent', color: activeSection === item ? '#fff' : '#173f31', fontWeight: 700, textAlign: 'left', cursor: 'pointer' }}
                  >
                    <span>{{ artists: 'Artists', contacts: 'Contacts', authors: 'Authors', 'related-names': 'Related names', types: 'Type of books', 'artist-categories': 'Artist categories' }[item]}</span>
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
