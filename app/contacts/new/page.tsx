
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchWithAuth } from '@/lib/fetchWithAuth'

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

 

const res = await fetchWithAuth('/api/contacts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    company_name: companyName.trim() || null,
    first_name: firstName.trim() || null,
    last_name: lastName.trim() || null,
    email: email.trim() || null,
    telephone: telephone.trim() || null,
    city: city.trim() || null,
    role: role.trim() || null,
    notes: notes.trim() || null,
  }),
})



    if (!res.ok) {
      setError(await res.text())
      setLoading(false)
      return
    }

    // ✅ même stratégie que Artist New
    router.push('/referentials')
  }

  return (
    <main
      style={{
        padding: 40,
        minHeight: '100vh',
        backgroundColor: '#006039', // ✅ fond vert app
      }}
    >
      <section
        style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: 24,
          backgroundColor: '#f7f7f7', // ✅ section grise
          borderRadius: 6,
          color: 'black',
        }}
      >
        <h1
          style={{
            fontSize: '1.6rem',
            fontWeight: 700,
            textAlign: 'center',
            marginBottom: 24,
            letterSpacing: '0.02em',
          }}
        >
          New Contact
        </h1>

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
            style={{ width: '100%' }}
          />
        </div>

        {/* First name */}
        <div style={{ marginBottom: 12 }}>
          <label>First name</label>
          <input
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        {/* Last name */}
        <div style={{ marginBottom: 12 }}>
          <label>Last name</label>
          <input
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        {/* Email */}
        <div style={{ marginBottom: 12 }}>
          <label>Email</label>
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        {/* Telephone */}
        <div style={{ marginBottom: 12 }}>
          <label>Telephone</label>
          <input
            value={telephone}
            onChange={e => setTelephone(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        {/* City */}
        <div style={{ marginBottom: 12 }}>
          <label>City</label>
          <input
            value={city}
            onChange={e => setCity(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        {/* Role */}
        <div style={{ marginBottom: 12 }}>
          <label>Role</label>
          <input
            value={role}
            onChange={e => setRole(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 20 }}>
          <label>Notes</label>
          <textarea
            rows={4}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => router.back()}>
            Cancel
          </button>

          <button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving…' : 'Create contact'}
          </button>
        </div>
      </section>
    </main>
  )
}
