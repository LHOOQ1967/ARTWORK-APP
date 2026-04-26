
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function NewArtistPage() {
  const router = useRouter()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [yearOfBirth, setYearOfBirth] = useState('')
  const [yearOfDeath, setYearOfDeath] = useState('')
  const [placeOfBirth, setPlaceOfBirth] = useState('')
  const [placeOfDeath, setPlaceOfDeath] = useState('')
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
      })

    if (supabaseError) {
      console.error('Create artist failed:', supabaseError)
      setError('Failed to create artist')
      setLoading(false)
      return
    }

    // ✅ même logique que New Contact
    router.push('/referentials')
  }

  return (
    <main
      style={{
        padding: 40,
        minHeight: '100vh',
        backgroundColor: '#006039',
      }}
    >
      <section
        style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: 24,
          backgroundColor: '#f7f7f7',
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
          New Artist
        </h1>

        {error && (
          <p style={{ color: 'red', marginBottom: 16 }}>
            {error}
          </p>
        )}

        {/* Last name */}
        <div style={{ marginBottom: 12 }}>
          <label>Last name *</label>
          <input
            value={lastName}
            onChange={e => setLastName(e.target.value)}
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

        {/* Year of birth */}
        <div style={{ marginBottom: 12 }}>
          <label>Year of birth</label>
          <input
            type="number"
            value={yearOfBirth}
            onChange={e => setYearOfBirth(e.target.value)}
            style={{ width: 120 }}
          />
        </div>

        {/* Year of death */}
        <div style={{ marginBottom: 12 }}>
          <label>Year of death</label>
          <input
            type="number"
            value={yearOfDeath}
            onChange={e => setYearOfDeath(e.target.value)}
            style={{ width: 120 }}
          />
        </div>

        {/* Place of birth */}
        <div style={{ marginBottom: 12 }}>
          <label>Place of birth</label>
          <input
            value={placeOfBirth}
            onChange={e => setPlaceOfBirth(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        {/* Place of death */}
        <div style={{ marginBottom: 20 }}>
          <label>Place of death</label>
          <input
            value={placeOfDeath}
            onChange={e => setPlaceOfDeath(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => router.back()}>
            Cancel
          </button>

          <button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving…' : 'Create artist'}
          </button>
        </div>
      </section>
    </main>
  )
}
