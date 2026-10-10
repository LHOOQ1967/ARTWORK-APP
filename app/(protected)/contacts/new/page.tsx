
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'

type AddressDraft = {
  label: string
  address: string
  postal_code: string
  city: string
  country: string
}

const ADDRESS_FIELDS = [
  ['label', 'Label (ex. New York)'],
  ['address', 'Adresse'],
  ['postal_code', 'Code postal'],
  ['city', 'Ville'],
  ['country', 'Pays'],
] as const

export default function NewContactPage() {
  const router = useRouter()

  const [companyName, setCompanyName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [telephone, setTelephone] = useState('')
  const [role, setRole] = useState('')
  const [notes, setNotes] = useState('')
  const [isClient, setIsClient] = useState(false)
  const [addresses, setAddresses] = useState<AddressDraft[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!companyName.trim() && !lastName.trim()) {
      setError('Company or last name is required')
      return
    }

    setLoading(true)
    setError(null)

    const { data: created, error: supabaseError } = await supabase
      .from('contacts')
      .insert({
        company_name: companyName.trim() || null,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        email: email.trim() || null,
        telephone: telephone.trim() || null,
        role: role.trim() || null,
        notes: notes.trim() || null,
        is_client: isClient,
      })
      .select('id')
      .single()

    if (supabaseError || !created) {
      console.error('Create contact failed:', supabaseError)
      setError('Failed to create contact')
      setLoading(false)
      return
    }

    const addressRows = addresses
      .map(a => ({
        contact_id: created.id,
        label: a.label.trim() || null,
        address: a.address.trim() || null,
        postal_code: a.postal_code.trim() || null,
        city: a.city.trim() || null,
        country: a.country.trim() || null,
      }))
      .filter(a => a.label || a.address || a.postal_code || a.city || a.country)

    if (addressRows.length > 0) {
      const { error: addressError } = await supabase
        .from('contact_addresses')
        .insert(addressRows)
      if (addressError) {
        console.error('Create addresses failed:', addressError)
        setError('Contact created, but addresses could not be saved. Edit the contact to add them.')
        setLoading(false)
        return
      }
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

        {/* Addresses */}
        <div style={{ marginBottom: 12 }}>
          <label>Adresses</label>
          <div style={{ display: 'grid', gap: 10, marginTop: 6 }}>
            {addresses.map((row, index) => (
              <div key={index} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {ADDRESS_FIELDS.map(([key, placeholder]) => (
                  <input
                    key={key}
                    placeholder={placeholder}
                    value={row[key]}
                    onChange={e =>
                      setAddresses(current =>
                        current.map((r, i) => (i === index ? { ...r, [key]: e.target.value } : r))
                      )
                    }
                    className="entity-form-field"
                    style={{ ...fieldStyle, marginTop: 0, width: 'auto', flex: key === 'address' ? '2 1 220px' : '1 1 130px', minWidth: 0 }}
                  />
                ))}
                <button
                  type="button"
                  className="edit-button"
                  onClick={() => setAddresses(current => current.filter((_, i) => i !== index))}
                >
                  Supprimer
                </button>
              </div>
            ))}
            <div>
              <button
                type="button"
                className="edit-button"
                onClick={() =>
                  setAddresses(current => [
                    ...current,
                    { label: '', address: '', postal_code: '', city: '', country: '' },
                  ])
                }
              >
                Ajouter une adresse
              </button>
            </div>
          </div>
        </div>

        {/* Client */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={isClient}
              onChange={e => setIsClient(e.target.checked)}
            />
            Client (show in the header client filter)
          </label>
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
            {loading ? 'Saving…' : 'Save'}
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
