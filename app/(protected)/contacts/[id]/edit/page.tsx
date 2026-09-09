'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'

type Contact = { company_name: string | null; first_name: string | null; last_name: string | null; email: string | null; telephone: string | null; city: string | null; role: string | null; notes: string | null }
const fieldStyle = { width: '100%', minHeight: 42, padding: '9px 12px', border: '1px solid #aabdb3', borderRadius: 8, background: '#fbfdfb' }

export default function EditContactPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [contact, setContact] = useState<Contact | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('contacts').select('company_name,first_name,last_name,email,telephone,city,role,notes').eq('id', id).maybeSingle().then(({ data, error: loadError }) => {
      if (loadError || !data) setError('Contact not found')
      else setContact(data)
    })
  }, [id])

  async function save() {
    if (!contact) return
    setSaving(true)
    const { error: saveError } = await supabase.from('contacts').update(contact).eq('id', id)
    if (saveError) setError(saveError.message)
    else router.push('/referentials')
    setSaving(false)
  }

  if (!contact) return <main style={{ padding: 96 }}>{error || 'Loading…'}</main>
  const update = (patch: Partial<Contact>) => setContact({ ...contact, ...patch })
  const row = (label: string, control: React.ReactNode) => <label style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, alignItems: 'center', marginBottom: 12 }}><span>{label}</span>{control}</label>

  return <main style={{ padding: '96px 20px 56px', minHeight: '100vh', background: '#f3f5f1' }}><section style={{ maxWidth: 760, margin: '0 auto', padding: 30, background: '#fff', border: '1px solid #d7dfda', borderRadius: 12, color: 'black' }}><p style={{ color: '#557067', fontSize: 12, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Referentials</p><h1 style={{ color: '#143b2d' }}>Edit contact</h1>{error && <p style={{ color: '#a22' }}>{error}</p>}{row('Company', <input style={fieldStyle} value={contact.company_name ?? ''} onChange={e => update({ company_name: e.target.value })} />)}{row('First name', <input style={fieldStyle} value={contact.first_name ?? ''} onChange={e => update({ first_name: e.target.value })} />)}{row('Last name', <input style={fieldStyle} value={contact.last_name ?? ''} onChange={e => update({ last_name: e.target.value })} />)}{row('Email', <input style={fieldStyle} type="email" value={contact.email ?? ''} onChange={e => update({ email: e.target.value })} />)}{row('Telephone', <input style={fieldStyle} value={contact.telephone ?? ''} onChange={e => update({ telephone: e.target.value })} />)}{row('City', <input style={fieldStyle} value={contact.city ?? ''} onChange={e => update({ city: e.target.value })} />)}{row('Role', <input style={fieldStyle} value={contact.role ?? ''} onChange={e => update({ role: e.target.value })} />)}{row('Notes', <textarea style={{ ...fieldStyle, minHeight: 110 }} rows={4} value={contact.notes ?? ''} onChange={e => update({ notes: e.target.value })} />)}<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button className="edit-button" onClick={() => router.back()}>Cancel</button><button className="edit-button" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</button></div></section></main>
}
