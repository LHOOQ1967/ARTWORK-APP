'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'
const fieldStyle = { width: '100%', minHeight: 42, padding: '9px 12px', border: '1px solid #aabdb3', borderRadius: 8, background: '#fbfdfb' }
export default function EditArtistCategoryPage() {
  const { id } = useParams<{ id: string }>(); const router = useRouter(); const [item, setItem] = useState<{ description: string; definition: string | null } | null>(null); const [error, setError] = useState(''); const [saving, setSaving] = useState(false)
  useEffect(() => { supabase.from('artist_categories').select('description,definition').eq('legacy_no', Number(id)).maybeSingle().then(({ data, error }) => { if (error || !data) setError('Artist category not found'); else setItem(data) }) }, [id])
  async function save() { if (!item) return; setSaving(true); const { error } = await supabase.from('artist_categories').update(item).eq('legacy_no', Number(id)); if (error) setError(error.message); else router.push('/referentials'); setSaving(false) }
  async function remove() { if (!confirm('Delete this artist category?')) return; const { error } = await supabase.from('artist_categories').delete().eq('legacy_no', Number(id)); if (error) setError(error.message); else router.push('/referentials') }
  if (!item) return <main style={{ padding: 96 }}>{error || 'Loading...'}</main>
  return <main style={{ padding: '96px 20px 56px', minHeight: '100vh', background: '#f3f5f1' }}><section style={{ maxWidth: 760, margin: '0 auto', padding: 30, background: '#fff', border: '1px solid #d7dfda', borderRadius: 12, color: 'black' }}><h1>Edit artist category</h1>{error && <p style={{ color: '#a22' }}>{error}</p>}<label>Description<input style={fieldStyle} value={item.description} onChange={e => setItem({ ...item, description: e.target.value })} /></label><label>Definition<textarea style={{ ...fieldStyle, minHeight: 110 }} rows={4} value={item.definition ?? ''} onChange={e => setItem({ ...item, definition: e.target.value })} /></label><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}><button className="edit-button" onClick={() => router.back()}>Cancel</button><button className="edit-button" onClick={remove}>Delete</button><button className="edit-button" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</button></div></section></main>
}
