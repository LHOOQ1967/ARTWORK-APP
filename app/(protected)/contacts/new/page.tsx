
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'

export default function NewContactPage() {
  const router = useRouter()

  const [companyName, setCompanyName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [telephone, setTelephone] = useState('')
  const [city, setCity] = useState('')
  const [role, setRole] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!companyName.trim() && !lastName.trim()) {
      setError('Company or last name is required')
      return
    }

    setLoading(true)
    setError(null)

    const { error: supabaseError } = await supabase
      .from('contacts')
      .insert({
        company_name: companyName.trim() || null,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        email: email.trim() || null,
        telephone: telephone.trim() || null,
        city: city.trim() || null,
        role: role.trim() || null,
        notes: notes.trim() || null,
      })

    if (supabaseError) {
      console.error('Create contact failed:', supabaseError)
      setError('Failed to create contact')
      setLoading(false)
      return
    }

    // ✅ même logique que New Artist
    router.push('/referentials')
  }

  return (

<main
  style={{
    paddingTop: 96,
    paddingLeft: 20,
    paddingRight: 20,
    paddingBottom: 56,
    minHeight: '100vh',
    background: '#f3f5f1',
  }}
>
  <section
    style={{
      maxWidth: 760,
      margin: '0 auto',
      padding: 30,
      backgroundColor: '#fff',
      border: '1px solid #d7dfda',
      borderRadius: 12,
      boxShadow: '0 12px 30px rgba(31,56,46,0.07)',
      color: 'black',
    }}
  >

        <div className="entity-form-eyebrow" style={{ marginBottom: 7, color: '#557067', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Referentials</div>
        <h1 className="entity-form-title" style={{ margin: 0, color: '#143b2d', fontSize: 42, lineHeight: 1, letterSpacing: '-0.035em' }}>New contact</h1>
        <p className="entity-form-subtitle" style={{ margin: '10px 0 28px', paddingBottom: 20, borderBottom: '1px solid #e4e9e6', color: '#62736c' }}>Add a company, institution or individual contact.</p>

        {error && (
          <p style={{ color: 'red', marginBottom: 16 }}>
            {error}
          </p>
        )}

        {/* Company */}
        <div style={{ marginBottom: 12 }}>
          <label>Company</label>
          <input
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            className="entity-form-field"
            style={fieldStyle}
          />
        </div>

        {/* First name */}
        <div style={{ marginBottom: 12 }}>
          <label>First name</label>
          <input
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            className="entity-form-field"
            style={fieldStyle}
          />
        </div>

        {/* Last name */}
        <div style={{ marginBottom: 12 }}>
          <label>Last name</label>
          <input
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            className="entity-form-field"
            style={fieldStyle}
          />
        </div>

        {/* Email */}
        <div style={{ marginBottom: 12 }}>
          <label>Email</label>
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="entity-form-field"
            style={fieldStyle}
          />
        </div>

        {/* Telephone */}
        <div style={{ marginBottom: 12 }}>
          <label>Telephone</label>
          <input
            value={telephone}
            onChange={e => setTelephone(e.target.value)}
            className="entity-form-field"
            style={fieldStyle}
          />
        </div>

        {/* City */}
        <div style={{ marginBottom: 12 }}>
          <label>City</label>
          <input
            value={city}
            onChange={e => setCity(e.target.value)}
            className="entity-form-field"
            style={fieldStyle}
          />
        </div>

        {/* Role */}
        <div style={{ marginBottom: 12 }}>
          <label>Role</label>
          <input
            value={role}
            onChange={e => setRole(e.target.value)}
            className="entity-form-field"
            style={fieldStyle}
          />
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 20 }}>
          <label>Notes</label>
          <textarea
            rows={4}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="entity-form-field"
            style={fieldStyle}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => router.back()} className="edit-button">
            Cancel
          </button>

          <button onClick={handleSubmit} disabled={loading} className="entity-form-primary-button">
            {loading ? 'Saving…' : 'Create contact'}
          </button>
        </div>
      </section>
    </main>
  )
}

const fieldStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: 42,
  marginTop: 6,
  padding: '9px 12px',
  border: '1px solid #c9d3cd',
  borderRadius: 8,
  backgroundColor: '#fff',
  boxSizing: 'border-box',
}
