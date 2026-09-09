'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'

type Artist = { first_name: string | null; last_name: string | null; year_of_birth: number | null; year_of_death: number | null; place_of_birth: string | null; place_of_death: string | null; notes: string | null; artist_category_no: number | null }
type Category = { legacy_no: number; description: string }

const fieldStyle = { width: '100%', minHeight: 42, padding: '9px 12px', border: '1px solid #aabdb3', borderRadius: 8, background: '#fbfdfb' }

export default function EditArtistPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [artist, setArtist] = useState<Artist | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('artists').select('first_name,last_name,year_of_birth,year_of_death,place_of_birth,place_of_death,notes,artist_category_no').eq('id', id).maybeSingle(),
      supabase.from('artist_categories').select('legacy_no,description').order('legacy_no'),
    ]).then(([artistResult, categoriesResult]) => {
      if (artistResult.error || !artistResult.data) setError('Artist not found')
      else setArtist(artistResult.data)
      setCategories(categoriesResult.data ?? [])
    })
  }, [id])

  async function save() {
    if (!artist) return
    setSaving(true)
    const { error: saveError } = await supabase.from('artists').update(artist).eq('id', id)
    if (saveError) setError(saveError.message)
    else router.push('/referentials')
    setSaving(false)
  }

  async function remove() {
    if (!confirm('Delete this artist?')) return
    const { error: deleteError } = await supabase.from('artists').delete().eq('id', id)
    if (deleteError) setError(deleteError.message)
    else router.push('/referentials')
  }

  if (!artist) return <main style={{ padding: 96 }}>{error || 'Loading…'}</main>
  const update = (patch: Partial<Artist>) => setArtist({ ...artist, ...patch })
  const row = (label: string, control: React.ReactNode) => <label style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, alignItems: 'center', marginBottom: 12 }}><span>{label}</span>{control}</label>

  return <main style={{ padding: '96px 20px 56px', minHeight: '100vh', background: '#f3f5f1' }}><section style={{ maxWidth: 760, margin: '0 auto', padding: 30, background: '#fff', border: '1px solid #d7dfda', borderRadius: 12, color: 'black' }}><header style={{ marginBottom: 28, textAlign: 'center', paddingBottom: 20, borderBottom: '1px solid #e4e9e6' }}><p style={{ margin: 0, color: '#557067', fontSize: 12, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Referentials</p><h1 style={{ margin: '10px 0 0', color: '#143b2d', fontSize: 'clamp(2rem, 5vw, 3.25rem)', lineHeight: 1.05 }}>Edit artist</h1><p style={{ margin: '10px 0 0', color: '#62736c' }}>Update the artist information used throughout ArtMuse.</p></header>{error && <p style={{ color: '#a22' }}>{error}</p>}{row('First name', <input style={fieldStyle} value={artist.first_name ?? ''} onChange={e => update({ first_name: e.target.value })} />)}{row('Last name', <input style={fieldStyle} value={artist.last_name ?? ''} onChange={e => update({ last_name: e.target.value })} />)}{row('Year of birth', <input style={fieldStyle} type="number" value={artist.year_of_birth ?? ''} onChange={e => update({ year_of_birth: e.target.value ? Number(e.target.value) : null })} />)}{row('Year of death', <input style={fieldStyle} type="number" value={artist.year_of_death ?? ''} onChange={e => update({ year_of_death: e.target.value ? Number(e.target.value) : null })} />)}{row('Category', <select style={fieldStyle} value={artist.artist_category_no ?? ''} onChange={e => update({ artist_category_no: e.target.value ? Number(e.target.value) : null })}><option value="">-</option>{categories.map(category => <option key={category.legacy_no} value={category.legacy_no}>{category.description}</option>)}</select>)}{row('Place of birth', <input style={fieldStyle} value={artist.place_of_birth ?? ''} onChange={e => update({ place_of_birth: e.target.value })} />)}{row('Place of death', <input style={fieldStyle} value={artist.place_of_death ?? ''} onChange={e => update({ place_of_death: e.target.value })} />)}{row('Notes', <textarea style={{ ...fieldStyle, minHeight: 110 }} rows={4} value={artist.notes ?? ''} onChange={e => update({ notes: e.target.value })} />)}<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button className="edit-button" onClick={() => router.back()}>Cancel</button><button className="edit-button" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</button></div></section></main>
}
