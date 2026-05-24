
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
    paddingTop: 80,   // espace sous le menu
    paddingLeft: 10,
    paddingRight: 10,
    paddingBottom: 10,
    minHeight: '100vh',
    background: '#006039',
  }}
>
  <section
    style={{
      maxWidth: 640,
      margin: '0 auto',
      padding: 24,
      backgroundColor: '#e6e5e5',
      borderRadius: 6,
      color: 'black',
    }}
  >
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: 24 }}>
          New Artist
        </h1>

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
            style={{ border: '2px solid #ccc', width: '100%', backgroundColor: 'white' }}
          />
        </div>

        {/* Last Name */}
        <div style={{ marginBottom: 12 }}>
          <label>Last Name</label>
          <input
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            style={{ border: '2px solid #ccc', width: '100%', backgroundColor: 'white' }}
          />
        </div>

        {/* Year of Birth */}
        <div style={{ marginBottom: 12 }}>
          <label>Year of Birth</label>
          <input
            type="number"
            value={yearOfBirth}
            onChange={e => setYearOfBirth(e.target.value)}
            style={{ border: '2px solid #ccc', width: '100%', backgroundColor: 'white' }}
          />
        </div>

        {/* Year of Death */}
        <div style={{ marginBottom: 12 }}>
          <label>Year of Death</label>
          <input
            type="number"
            value={yearOfDeath}
            onChange={e => setYearOfDeath(e.target.value)}
            style={{ border: '2px solid #ccc', width: '100%', backgroundColor: 'white' }}
          />
        </div>

        {/* Place of Birth */}
        <div style={{ marginBottom: 12 }}>
          <label>Place of Birth</label>
          <input
            value={placeOfBirth}
            onChange={e => setPlaceOfBirth(e.target.value)}
            style={{ border: '2px solid #ccc', width: '100%', backgroundColor: 'white' }}
          />
        </div>

        {/* Place of Death */}
        <div style={{ marginBottom: 12 }}>
          <label>Place of Death</label>
          <input
            value={placeOfDeath}
            onChange={e => setPlaceOfDeath(e.target.value)}
            style={{ border: '2px solid #ccc', width: '100%', backgroundColor: 'white' }}
          />
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 12 }}>
          <label>Notes</label>
          <textarea
            rows={4}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ border: '2px solid #ccc', width: '100%', backgroundColor: 'white' }}
          />
        </div>


        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          
            <button onClick={() => router.back()} className="edit-button">
            Cancel
          </button>

        <button onClick={handleSubmit} disabled={loading} className="edit-button">
          {loading ? 'Saving…' : 'Create artist'}
        </button>
        </div>

        {error && <p style={{ color: 'red' }}>{error}</p>}

      </section>
    </main>
  )
}
