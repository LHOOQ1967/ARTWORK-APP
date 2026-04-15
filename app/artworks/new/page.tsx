
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Artist = {
  id: string
  last_name: string
}

type Contact = {
  id: string
  company_name: string
  contact_person: string | null
}

export default function NewArtworkPage() {
  const router = useRouter()

  const [artists, setArtists] = useState<Artist[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState<any>({
    title: '',
    artist_id: '',
    proposed_by_id: '',
    date_proposition: '',
    medium: '',
    year_execution: '',
    height_cm: '',
    width_cm: '',
    depth_cm: '',
    condition: '',
    provenance: '',
    exhibition_literature: '',
    certificate: false,
    certificate_location: '',
    asking_price: '',
    currency: 'CHF',
    location_of_work: '',
    check_seller: '',
    priority: '',
    status: 'draft',
    view_date: '',
    notes: '',
  })

  /* ---------- LOAD ARTISTS ---------- */
  useEffect(() => {
    fetch('/api/artists')
      .then(res => res.json())
      .then(setArtists)
      .catch(() => setArtists([]))
  }, [])

  /* ---------- LOAD CONTACTS ---------- */
  useEffect(() => {
    fetch('/api/contacts')
      .then(res => res.json())
      .then(data => Array.isArray(data) ? setContacts(data) : setContacts([]))
      .catch(() => setContacts([]))
  }, [])

  const updateField = (key: string, value: any) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  /* ---------- SUBMIT ---------- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)


const payload = {
  title: form.title.trim(),

  // relations
  artist_id: form.artist_id || null,
  proposed_by_id: form.proposed_by_id || null,

  // dates (IMPORTANT)
  date_proposition: form.date_proposition || null,
  view_date: null, // ✅ pas encore connu à la création

  // description
  medium: form.medium || null,

  // numbers
  year_execution: form.year_execution ? Number(form.year_execution) : null,
  height_cm: form.height_cm ? Number(form.height_cm) : null,
  width_cm: form.width_cm ? Number(form.width_cm) : null,
  depth_cm: form.depth_cm ? Number(form.depth_cm) : null,

  // documentation
  condition: form.condition || null,
  provenance: form.provenance || null,
  exhibition_literature: form.exhibition_literature || null,
  certificate: form.certificate,
  certificate_location: form.certificate_location || null,

  // market
  asking_price: form.asking_price ? Number(form.asking_price) : null,
  currency: form.currency || 'CHF',
  location_of_work: form.location_of_work || null,
  check_seller: form.check_seller || null,

  // workflow
  priority: form.priority || 'medium',   // ✅ valeur par défaut métier
  status: form.status || 'draft',        // ✅ valeur par défaut
  notes: form.notes || null,
}


    try {
      const res = await fetch('/api/artworks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })


if (!res.ok) {
  const text = await res.text()
  console.error('CREATE ARTWORK ERROR:', text)
  setError(text || 'Failed to create artwork')
  setLoading(false)
  return
}


      router.push('/artworks')
    } catch {
      setError('Network error')
      setLoading(false)
    }
  }

  return (
    
return (
  <main style={{ padding: 40 }}>
    <h1>Artwork debug view</h1>
    <pre style={{ whiteSpace: 'pre-wrap' }}>
      {JSON.stringify(artwork, null, 2)}
    </pre>

    <hr />

    <pre style={{ whiteSpace: 'pre-wrap' }}>
      {JSON.stringify(form, null, 2)}
    </pre>
  </main>
)

    <main style={{ padding: 40, maxWidth: 900 }}>
      <h1>New Artwork</h1>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <form onSubmit={handleSubmit}>
        <section>
          <h2>Identification</h2>

          <input placeholder="Title *"
            value={form.title}
            onChange={e => updateField('title', e.target.value)}
          />

          <select
            value={form.artist_id}
            onChange={e => updateField('artist_id', e.target.value)}
          >
            <option value="">— Artist —</option>
            {artists.map(a => (
              <option key={a.id} value={a.id}>{a.last_name}</option>
            ))}
          </select>

          <select
            value={form.proposed_by_id}
            onChange={e => updateField('proposed_by_id', e.target.value)}
          >
            <option value="">— Select contact —</option>
            {contacts.map(c => (
              <option key={c.id} value={c.id}>
                {c.company_name}{c.contact_person ? `, ${c.contact_person}` : ''}
              </option>
            ))}
          </select>

          <input type="date"
            value={form.date_proposition}
            onChange={e => updateField('date_proposition', e.target.value)}
          />
        </section>

        <section>
          <h2>Description</h2>
          <input placeholder="Medium"
            value={form.medium}
            onChange={e => updateField('medium', e.target.value)}
          />
        </section>

        <button type="submit" disabled={loading}>
          {loading ? 'Saving…' : 'Create artwork'}
        </button>
      </form>
    </main>
  )
}
