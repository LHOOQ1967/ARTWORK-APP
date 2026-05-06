
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

    router.push('/referentials')
  }

  return (
    <main style={{ padding: 40, minHeight: '100vh', backgroundColor: '#006039' }}>
      <section
        style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: 24,
          backgroundColor: '#ffffff',
          borderRadius: 6,
          color: 'black',
        }}
      >
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: 24 }}>
          New Artist
        </h1>

        {error && <p style={{ color: 'red' }}>{error}</p>}

        <input value={lastName} onChange={e => setLastName(e.target.value)} />
        {/* … autres champs inchangés … */}

        <button onClick={handleSubmit} disabled={loading}>
          {loading ? 'Saving…' : 'Create artist'}
        </button>
      </section>
    </main>
  )
}
