'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'

type ContactRecord = {
  id: string
  company_name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  telephone: string | null
  city: string | null
  role: string | null
  notes: string | null
}

const fieldStyle: React.CSSProperties = {
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

function ContactFieldRow({
  label,
  children,
}: Readonly<{
  label: string
  children: React.ReactNode
}>) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, padding: '10px 0', borderBottom: '1px solid #eef2ef' }}>
      <div style={{ color: '#557067', fontWeight: 700 }}>{label}</div>
      <div>{children}</div>
    </div>
  )
}

function formatDisplayName(contact: ContactRecord | null) {
  if (!contact) return '—'
  const company = contact.company_name?.trim() ?? ''
  const person = [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim()

  if (company && person) return `${company} - ${person}`
  return company || person || '—'
}

export default function EditContactPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [contact, setContact] = useState<ContactRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return

    let cancelled = false

    void (async () => {
      setLoading(true)
      setError('')

      const { data, error: loadError } = await supabase
        .from('contacts')
        .select('id, company_name, first_name, last_name, email, telephone, city, role, notes')
        .eq('id', id)
        .maybeSingle()

      if (cancelled) return

      if (loadError || !data) {
        setError('Contact not found')
        setContact(null)
      } else {
        setContact(data as ContactRecord)
      }

      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [id])

  async function saveContact() {
    if (!contact) return

    setSaving(true)
    setError('')

    const { id: contactId, ...payload } = contact
    const { error: updateError } = await supabase
      .from('contacts')
      .update(payload)
      .eq('id', contactId)

    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    router.push('/referentials?section=contacts')
  }

  async function removeContact() {
    if (!contact || !confirm('Delete this contact?')) return

    setSaving(true)
    setError('')

    const { error: deleteError } = await supabase
      .from('contacts')
      .delete()
      .eq('id', contact.id)

    setSaving(false)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    router.push('/referentials?section=contacts')
  }

  if (loading) {
    return <main style={{ padding: '96px 20px 56px', minHeight: '100vh', background: '#f3f5f1' }}>Loading…</main>
  }

  if (!contact) {
    return <main style={{ padding: '96px 20px 56px', minHeight: '100vh', background: '#f3f5f1' }}>{error || 'Contact not found'}</main>
  }

  return (
    <main style={{ padding: '96px 20px 56px', minHeight: '100vh', background: '#f3f5f1' }}>
      <div style={floatingActionBarStyle}>
        <Link className="edit-button" href="/referentials?section=contacts">
          Back
        </Link>
        <button className="edit-button" type="button" onClick={() => void saveContact()} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="edit-button edit-button-danger" type="button" onClick={() => void removeContact()} disabled={saving}>
          Delete
        </button>
      </div>

      <section style={{ maxWidth: 900, margin: '0 auto', padding: 30, background: '#fff', border: '1px solid #d7dfda', borderRadius: 12, color: 'black', boxShadow: '0 10px 28px rgba(31,56,46,0.06)' }}>
        <header style={{ marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid #e4e9e6' }}>
          <p style={{ margin: 0, color: '#557067', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Contacts</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
            <h1 style={{ margin: 0, color: '#143b2d', fontSize: 'clamp(2rem, 5vw, 3.25rem)' }}>{formatDisplayName(contact)}</h1>
          </div>
          <p style={{ margin: '10px 0 0', color: '#62736c' }}>Edit contact record and update the related details.</p>
        </header>

        {error && <p style={{ margin: '0 0 18px', color: '#a22' }}>{error}</p>}

        <div style={{ display: 'grid', gap: 14 }}>
          <ContactFieldRow label="Company">
            <input
              style={fieldStyle}
              value={contact.company_name ?? ''}
              onChange={(event) => setContact((current) => (current ? { ...current, company_name: event.target.value } : current))}
              placeholder="Company"
            />
          </ContactFieldRow>

          <ContactFieldRow label="First name">
            <input
              style={fieldStyle}
              value={contact.first_name ?? ''}
              onChange={(event) => setContact((current) => (current ? { ...current, first_name: event.target.value } : current))}
              placeholder="First name"
            />
          </ContactFieldRow>

          <ContactFieldRow label="Last name">
            <input
              style={fieldStyle}
              value={contact.last_name ?? ''}
              onChange={(event) => setContact((current) => (current ? { ...current, last_name: event.target.value } : current))}
              placeholder="Last name"
            />
          </ContactFieldRow>

          <ContactFieldRow label="Email">
            <input
              style={fieldStyle}
              type="email"
              value={contact.email ?? ''}
              onChange={(event) => setContact((current) => (current ? { ...current, email: event.target.value } : current))}
              placeholder="Email"
            />
          </ContactFieldRow>

          <ContactFieldRow label="Telephone">
            <input
              style={fieldStyle}
              value={contact.telephone ?? ''}
              onChange={(event) => setContact((current) => (current ? { ...current, telephone: event.target.value } : current))}
              placeholder="Telephone"
            />
          </ContactFieldRow>

          <ContactFieldRow label="City">
            <input
              style={fieldStyle}
              value={contact.city ?? ''}
              onChange={(event) => setContact((current) => (current ? { ...current, city: event.target.value } : current))}
              placeholder="City"
            />
          </ContactFieldRow>

          <ContactFieldRow label="Role">
            <input
              style={fieldStyle}
              value={contact.role ?? ''}
              onChange={(event) => setContact((current) => (current ? { ...current, role: event.target.value } : current))}
              placeholder="Role"
            />
          </ContactFieldRow>

          <ContactFieldRow label="Notes">
            <textarea
              style={{ ...fieldStyle, minHeight: 120, resize: 'vertical' }}
              rows={4}
              value={contact.notes ?? ''}
              onChange={(event) => setContact((current) => (current ? { ...current, notes: event.target.value } : current))}
              placeholder="Notes"
            />
          </ContactFieldRow>
        </div>
      </section>
    </main>
  )
}
