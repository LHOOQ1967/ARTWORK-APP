'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'
import { LinkedText } from '@/components/ui/LinkedText'
import { useSessionProfile } from '@/contexts/SessionContext'

type ProfileRow = {
  id: string
  email: string | null
}

function formatEntryDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString('fr-CH') : '—'
}

function toNullableNumber(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isInteger(parsed) ? parsed : null
}

function ArtistNotesRow({
  canEdit,
  notes,
  value,
  onChange,
}: Readonly<{
  canEdit: boolean
  notes: string | null
  value: string
  onChange: (value: string) => void
}>) {
  let content: React.ReactNode = '—'

  if (canEdit) {
    content = (
      <textarea
        style={{ width: '100%', minHeight: 120, padding: '9px 12px', border: '1px solid #aabdb3', borderRadius: 8, background: '#fbfdfb' }}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  } else if (notes) {
    content = <LinkedText text={notes} />
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, padding: '10px 0' }}>
      <div style={{ color: '#557067', fontWeight: 700 }}>Notes</div>
      <div>{content}</div>
    </div>
  )
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

export default function ArtistViewPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { role, loading: sessionLoading } = useSessionProfile()
  const [artist, setArtist] = useState<{
    id: string
    legacy_no: number | null
    first_name: string | null
    last_name: string | null
    year_of_birth: number | null
    year_of_death: number | null
    place_of_birth: string | null
    place_of_death: string | null
    notes: string | null
    artist_category_no: number | null
    created_at: string | null
    created_by: string | null
    source: string | null
  } | null>(null)
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    year_of_birth: '',
    year_of_death: '',
    place_of_birth: '',
    place_of_death: '',
    notes: '',
    artist_category_no: '',
  })
  const [enteredBy, setEnteredBy] = useState('—')
  const [saving, setSaving] = useState(false)
  const [categoryLabel, setCategoryLabel] = useState('—')
  const [categories, setCategories] = useState<Array<{ legacy_no: number; description: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const canEdit = role === 'Administrator' || role === 'Editor'

  useEffect(() => {
    if (!id) return

    let cancelled = false

    void (async () => {
      setLoading(true)
      setError('')

      const [artistResult, categoryResult] = await Promise.all([
        supabase
          .from('artists')
          .select('id, legacy_no, first_name, last_name, year_of_birth, year_of_death, place_of_birth, place_of_death, notes, artist_category_no, created_at, created_by, source')
          .eq('id', id)
          .maybeSingle(),
        supabase.from('artist_categories').select('legacy_no, description').order('legacy_no', { ascending: true }),
      ])

      if (cancelled) return

      if (artistResult.error || !artistResult.data) {
        setError('Artist not found')
        setArtist(null)
      } else {
        setArtist(artistResult.data)
        setForm({
          first_name: artistResult.data.first_name ?? '',
          last_name: artistResult.data.last_name ?? '',
          year_of_birth: artistResult.data.year_of_birth?.toString() ?? '',
          year_of_death: artistResult.data.year_of_death?.toString() ?? '',
          place_of_birth: artistResult.data.place_of_birth ?? '',
          place_of_death: artistResult.data.place_of_death ?? '',
          notes: artistResult.data.notes ?? '',
          artist_category_no: artistResult.data.artist_category_no?.toString() ?? '',
        })
      }

      if (artistResult.data?.source === 'access' || (typeof artistResult.data?.legacy_no === 'number' && artistResult.data.legacy_no < 1000000)) {
        setEnteredBy('Import')
      } else if (artistResult.data?.created_by) {
        const creatorResult = await supabase
          .from('profiles')
          .select('id, email')
          .eq('id', artistResult.data.created_by)
          .maybeSingle()

        if (!cancelled) {
          const creator = creatorResult.data as ProfileRow | null
          setEnteredBy(creator?.email ?? 'Utilisateur inconnu')
        }
      } else {
        setEnteredBy('Utilisateur inconnu')
      }

      if (!categoryResult.error) {
        const loadedCategories = (categoryResult.data ?? []) as Array<{ legacy_no: number; description: string }>
        setCategories(loadedCategories)
        const matched = loadedCategories.find((category) => category.legacy_no === artistResult.data?.artist_category_no)
        setCategoryLabel(matched?.description ?? '—')
      }

      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [id])

  async function saveArtist() {
    if (!artist) return

    setSaving(true)
    setError('')

    const { error: updateError } = await supabase
      .from('artists')
      .update({
        first_name: form.first_name.trim() || null,
        last_name: form.last_name.trim() || null,
        year_of_birth: toNullableNumber(form.year_of_birth),
        year_of_death: toNullableNumber(form.year_of_death),
        place_of_birth: form.place_of_birth.trim() || null,
        place_of_death: form.place_of_death.trim() || null,
        notes: form.notes.trim() || null,
        artist_category_no: toNullableNumber(form.artist_category_no),
      })
      .eq('id', artist.id)

    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    router.refresh()
  }

  async function removeArtist() {
    if (!artist || !confirm('Delete this artist?')) return

    setSaving(true)
    setError('')

    const response = await fetch(`/api/artists/${artist.id}`, {
      method: 'DELETE',
    })

    const payload = await response.json() as { error?: string }

    setSaving(false)

    if (!response.ok) {
      setError(payload.error || 'Artist not deleted')
      return
    }

    router.push('/referentials')
  }

  if (loading) {
    return <main style={{ padding: '96px 20px 56px', minHeight: '100vh', background: '#f3f5f1' }}>Loading…</main>
  }

  if (!artist) {
    return <main style={{ padding: '96px 20px 56px', minHeight: '100vh', background: '#f3f5f1' }}>{error || 'Artist not found'}</main>
  }

  const displayName = [artist.last_name, artist.first_name].filter(Boolean).join(' ') || '—'

  return (
    <main style={{ padding: '96px 20px 56px', minHeight: '100vh', background: '#f3f5f1' }}>
      <div style={floatingActionBarStyle}>
        <Link className="edit-button" href="/artists">Back</Link>
        {canEdit ? (
          <>
            <button className="edit-button" type="button" onClick={() => void saveArtist()} disabled={saving || sessionLoading}>{saving ? 'Saving…' : 'Save'}</button>
            <button className="edit-button edit-button-danger" type="button" onClick={() => void removeArtist()} disabled={saving || sessionLoading}>Delete</button>
          </>
        ) : (
          <></>
        )}
      </div>

      <section style={{ maxWidth: 900, margin: '0 auto', padding: 30, background: '#fff', border: '1px solid #d7dfda', borderRadius: 12, color: 'black', boxShadow: '0 10px 28px rgba(31,56,46,0.06)' }}>
        <header style={{ marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid #e4e9e6' }}>
          <p style={{ margin: 0, color: '#557067', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Artists</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
            <h1 style={{ margin: 0, color: '#143b2d', fontSize: 'clamp(2rem, 5vw, 3.25rem)' }}>{displayName}</h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <Link className="edit-button" href={`/library?view=by-artists&artistId=${artist.id}`}>Books</Link>
              <Link className="edit-button" href={`/artworks?artistId=${artist.id}`}>Artworks</Link>
            </div>
          </div>
          <p style={{ margin: '10px 0 0', color: '#62736c' }}>View artist record and open the editor when needed.</p>
        </header>

        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, padding: '10px 0', borderBottom: '1px solid #eef2ef' }}>
            <div style={{ color: '#557067', fontWeight: 700 }}>Nom et Prénom</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <input
                aria-label="Nom"
                style={{ minWidth: 200, flex: '1 1 200px', padding: '9px 12px', border: '1px solid #aabdb3', borderRadius: 8, background: '#fbfdfb' }}
                value={form.last_name}
                onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))}
                placeholder="Nom"
                readOnly={!canEdit}
              />
              <input
                aria-label="Prénom"
                style={{ minWidth: 200, flex: '1 1 200px', padding: '9px 12px', border: '1px solid #aabdb3', borderRadius: 8, background: '#fbfdfb' }}
                value={form.first_name}
                onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))}
                placeholder="Prénom"
                readOnly={!canEdit}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, padding: '10px 0', borderBottom: '1px solid #eef2ef' }}>
            <div style={{ color: '#557067', fontWeight: 700 }}>Category</div>
            <div>
              {canEdit ? (
                <select
                  value={form.artist_category_no}
                  onChange={(event) => setForm((current) => ({ ...current, artist_category_no: event.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #aabdb3', borderRadius: 8, background: '#fbfdfb' }}
                >
                  <option value="">—</option>
                  {categories.map((category) => (
                    <option key={category.legacy_no} value={category.legacy_no}>{category.description}</option>
                  ))}
                </select>
              ) : (
                categoryLabel
              )}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, padding: '10px 0', borderBottom: '1px solid #eef2ef' }}>
            <div style={{ color: '#557067', fontWeight: 700 }}>Year of birth</div>
            <div>{canEdit ? <input style={{ width: '100%', padding: '9px 12px', border: '1px solid #aabdb3', borderRadius: 8, background: '#fbfdfb' }} type="number" value={form.year_of_birth} onChange={(event) => setForm((current) => ({ ...current, year_of_birth: event.target.value }))} /> : artist.year_of_birth ?? '—'}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, padding: '10px 0', borderBottom: '1px solid #eef2ef' }}>
            <div style={{ color: '#557067', fontWeight: 700 }}>Year of death</div>
            <div>{canEdit ? <input style={{ width: '100%', padding: '9px 12px', border: '1px solid #aabdb3', borderRadius: 8, background: '#fbfdfb' }} type="number" value={form.year_of_death} onChange={(event) => setForm((current) => ({ ...current, year_of_death: event.target.value }))} /> : artist.year_of_death ?? '—'}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, padding: '10px 0', borderBottom: '1px solid #eef2ef' }}>
            <div style={{ color: '#557067', fontWeight: 700 }}>Place of birth</div>
            <div>{canEdit ? <input style={{ width: '100%', padding: '9px 12px', border: '1px solid #aabdb3', borderRadius: 8, background: '#fbfdfb' }} value={form.place_of_birth} onChange={(event) => setForm((current) => ({ ...current, place_of_birth: event.target.value }))} /> : artist.place_of_birth || '—'}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, padding: '10px 0', borderBottom: '1px solid #eef2ef' }}>
            <div style={{ color: '#557067', fontWeight: 700 }}>Place of death</div>
            <div>{canEdit ? <input style={{ width: '100%', padding: '9px 12px', border: '1px solid #aabdb3', borderRadius: 8, background: '#fbfdfb' }} value={form.place_of_death} onChange={(event) => setForm((current) => ({ ...current, place_of_death: event.target.value }))} /> : artist.place_of_death || '—'}</div>
          </div>
          <ArtistNotesRow canEdit={canEdit} notes={artist.notes} value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, padding: '10px 0', borderTop: '1px solid #eef2ef' }}>
            <div style={{ color: '#557067', fontWeight: 700 }}>Record</div>
            <div title={artist.id}>{typeof artist.legacy_no === 'number' ? String(artist.legacy_no) : '—'}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, padding: '10px 0', borderTop: '1px solid #eef2ef' }}>
            <div style={{ color: '#557067', fontWeight: 700 }}>Entered at</div>
            <div>{formatEntryDate(artist.created_at)}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, padding: '10px 0' }}>
            <div style={{ color: '#557067', fontWeight: 700 }}>Entered by</div>
            <div>{enteredBy}</div>
          </div>
        </div>
      </section>
    </main>
  )
}
