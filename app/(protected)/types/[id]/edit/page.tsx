'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'

const fieldStyle = { width: '100%', minHeight: 42, padding: '9px 12px', border: '1px solid #aabdb3', borderRadius: 8, background: '#fbfdfb' }
export default function EditBookTypePage() {
  const { id } = useParams<{ id: string }>(); const router = useRouter()
  const [item, setItem] = useState<{ type_number: string | null; description: string | null; full_name: string | null } | null>(null); const [error, setError] = useState(''); const [saving, setSaving] = useState(false)
  useEffect(() => { supabase.from('library_book_types').select('type_number,description,full_name').eq('legacy_no', Number(id)).maybeSingle().then(({ data, error }) => { if (error || !data) setError('Book type not found'); else setItem(data) }) }, [id])
  async function save() { if (!item) return; setSaving(true); const { error } = await supabase.from('library_book_types').update(item).eq('legacy_no', Number(id)); if (error) setError(error.message); else router.push('/referentials'); setSaving(false) }
  async function remove() { if (!confirm('Delete this book type?')) return; const { error } = await supabase.from('library_book_types').delete().eq('legacy_no', Number(id)); if (error) setError(error.message); else router.push('/referentials') }
  if (!item) return <main style={{ padding: 96 }}>{error || 'Loading...'}</main>
  return <main style={{ padding: '96px 20px 56px', minHeight: '100vh', background: '#f3f5f1' }}><section style={{ maxWidth: 760, margin: '0 auto', padding: 30, background: '#fff', border: '1px solid #d7dfda', borderRadius: 12, color: 'black' }}><header style={{ textAlign: 'center', marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid #e4e9e6' }}><p style={{ margin: 0, color: '#557067', fontSize: 12, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Referentials</p><h1 style={{ margin: '10px 0 0', color: '#143b2d', fontSize: 'clamp(2rem, 5vw, 3.25rem)' }}>Edit type of books</h1></header>{error && <p style={{ color: '#a22' }}>{error}</p>}<label style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, marginBottom: 12 }}>Type number<input style={fieldStyle} value={item.type_number ?? ''} onChange={e => setItem({ ...item, type_number: e.target.value })} /></label><label style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, marginBottom: 12 }}>Description<input style={fieldStyle} value={item.description ?? ''} onChange={e => setItem({ ...item, description: e.target.value })} /></label><label style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, marginBottom: 12 }}>Full name<input style={fieldStyle} value={item.full_name ?? ''} onChange={e => setItem({ ...item, full_name: e.target.value })} /></label><div style={{ textAlign: 'right' }}><button className="edit-button" onClick={() => router.back()}>Cancel</button> <button className="edit-button" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</button></div></section></main>
}
