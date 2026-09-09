'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { supabase } from '@/lib/supabaseBrowser'

const fieldStyle = { width: '100%', minHeight: 42, padding: '9px 12px', border: '1px solid #aabdb3', borderRadius: 8, background: '#fbfdfb' }

export default function NewReferencePage() {
  const params = useSearchParams(); const router = useRouter(); const kind = params.get('kind') ?? 'authors'
  const [values, setValues] = useState<Record<string, string>>({}); const [error, setError] = useState(''); const [saving, setSaving] = useState(false)
  const config = kind === 'authors' ? { title: 'Author', table: 'library_authors', fields: [['first_name', 'First name'], ['last_name', 'Last name']] } : kind === 'related-names' ? { title: 'Related name', table: 'library_related_names', fields: [['name', 'Name'], ['location', 'Location']] } : kind === 'types' ? { title: 'Type of books', table: 'library_book_types', fields: [['type_number', 'Type number'], ['description', 'Description'], ['full_name', 'Full name']] } : { title: 'Artist category', table: 'artist_categories', fields: [['description', 'Description'], ['definition', 'Definition']] }
  async function save() { setSaving(true); const { error } = await supabase.from(config.table).insert(values); if (error) setError(error.message); else router.push('/referentials'); setSaving(false) }
  return <main style={{ padding: '96px 20px 56px', minHeight: '100vh', background: '#f3f5f1' }}><section style={{ maxWidth: 760, margin: '0 auto', padding: 30, background: '#fff', border: '1px solid #d7dfda', borderRadius: 12, color: 'black' }}><header style={{ textAlign: 'center', marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid #e4e9e6' }}><p style={{ margin: 0, color: '#557067', fontSize: 12, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Referentials</p><h1 style={{ margin: '10px 0 0', color: '#143b2d', fontSize: 'clamp(2rem, 5vw, 3.25rem)' }}>Add {config.title.toLowerCase()}</h1></header>{error && <p style={{ color: '#a22' }}>{error}</p>}{config.fields.map(([key, label]) => <label key={key} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, marginBottom: 12 }}>{label}{key === 'definition' ? <textarea style={{ ...fieldStyle, minHeight: 110 }} rows={4} value={values[key] ?? ''} onChange={e => setValues({ ...values, [key]: e.target.value })} /> : <input style={fieldStyle} value={values[key] ?? ''} onChange={e => setValues({ ...values, [key]: e.target.value })} />}</label>)}<div style={{ textAlign: 'right' }}><button className="edit-button" onClick={() => router.back()}>Cancel</button> <button className="edit-button" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</button></div></section></main>
}
