
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'

export default function NewArtistPage() {
  const router = useRouter()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [yearOfBirth, setYearOfBirth] = useState('')
  const [yearOfDeath, setYearOfDeath] = useState('')
  const [placeOfBirth, setPlaceOfBirth] = useState('')
  const [placeOfDeath, setPlaceOfDeath] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!lastName.trim()) {
      setError('Last name is required')
      return
    }

    setLoading(true)
    setError(null)

    const { error: supabaseError } = await supabase
      .from('artists')
      .insert({
        last_name: lastName.trim(),
        first_name: firstName.trim() || null,
        year_of_birth: yearOfBirth ? Number(yearOfBirth) : null,
        year_of_death: yearOfDeath ? Number(yearOfDeath) : null,
        place_of_birth: placeOfBirth.trim() || null,
        place_of_death: placeOfDeath.trim() || null,
        notes: notes.trim() || null,
      })

    if (supabaseError) {
      console.error('Create artist failed:', supabaseError)
      setError('Failed to create artist')
      setLoading(false)
      return
    }

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
        <h1 className="entity-form-title" style={{ margin: 0, color: '#143b2d', fontSize: 42, lineHeight: 1, letterSpacing: '-0.035em' }}>New artist</h1>
        <p className="entity-form-subtitle" style={{ margin: '10px 0 28px', paddingBottom: 20, borderBottom: '1px solid #e4e9e6', color: '#62736c' }}>Create a new artist record for use across the collection.</p>

        {error && (
          <p style={{ color: 'red', marginBottom: 16 }}>
            {error}
          </p>
        )}

        {/* First Name */}
        <div style={{ marginBottom: 12 }}>
          <label>First Name</label>
          <input
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            className="entity-form-field"
            style={fieldStyle}
          />
        </div>

        {/* Last Name */}
        <div style={{ marginBottom: 12 }}>
          <label>Last Name</label>
          <input
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            className="entity-form-field"
            style={fieldStyle}
          />
        </div>

        {/* Year of Birth */}
        <div style={{ marginBottom: 12 }}>
          <label>Year of Birth</label>
          <input
            type="number"
            value={yearOfBirth}
            onChange={e => setYearOfBirth(e.target.value)}
            className="entity-form-field"
            style={fieldStyle}
          />
        </div>

        {/* Year of Death */}
        <div style={{ marginBottom: 12 }}>
          <label>Year of Death</label>
          <input
            type="number"
            value={yearOfDeath}
            onChange={e => setYearOfDeath(e.target.value)}
            className="entity-form-field"
            style={fieldStyle}
          />
        </div>

        {/* Place of Birth */}
        <div style={{ marginBottom: 12 }}>
          <label>Place of Birth</label>
          <input
            value={placeOfBirth}
            onChange={e => setPlaceOfBirth(e.target.value)}
            className="entity-form-field"
            style={fieldStyle}
          />
        </div>

        {/* Place of Death */}
        <div style={{ marginBottom: 12 }}>
          <label>Place of Death</label>
          <input
            value={placeOfDeath}
            onChange={e => setPlaceOfDeath(e.target.value)}
            className="entity-form-field"
            style={fieldStyle}
          />
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 12 }}>
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
          {loading ? 'Saving…' : 'Create artist'}
        </button>
        </div>

        {error && <p style={{ color: 'red' }}>{error}</p>}

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
