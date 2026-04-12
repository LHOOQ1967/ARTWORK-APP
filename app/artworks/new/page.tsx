
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

  // === STATE ===
  const [artists, setArtists] = useState<Artist[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
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

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // === LOAD ARTISTS ===
  useEffect(() => {
    const loadArtists = async () => {
      const res = await fetch('/api/artists')
      const data = await res.json()
      setArtists(data)
    }
    loadArtists()
  }, [])

  

    useEffect(() => {
    const loadContacts = async () => {
        try {
        const res = await fetch('/api/contacts')
        const data = await res.json()

        if (!res.ok) {
            console.error('Failed to load contacts:', data)
            setContacts([])   // ⬅️ IMPORTANT
            return
        }

        if (Array.isArray(data)) {
            setContacts(data)
        } else {
            console.warn('Contacts is not an array:', data)
            setContacts([])   // ⬅️ IMPORTANT
        }
        } catch (err) {
        console.error('Network error loading contacts', err)
        setContacts([])     // ⬅️ IMPORTANT
        }
    }

    loadContacts()
    }, [])



  // === HANDLERS ===
  const updateField = (key: string, value: any) => {
    setForm((prev: any) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async () => {
    if (!form.title) {
      setError('Title is required')
      return
    }

    setLoading(true)
    setError(null)


    const payload = {
    ...form,
    artist_id: form.artist_id || null,
    proposed_by_id: form.proposed_by_id || null,
    year_execution: form.year_execution ? Number(form.year_execution) : null,
    height_cm: form.height_cm ? Number(form.height_cm) : null,
    width_cm: form.width_cm ? Number(form.width_cm) : null,
    depth_cm: form.depth_cm ? Number(form.depth_cm) : null,
    asking_price: form.asking_price ? Number(form.asking_price) : null,
    }


    const res = await fetch('/api/artworks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Failed to create artwork')
      setLoading(false)
      return
    }

    router.push('/artworks')
  }

  // === UI ===
  return (
    <main style={{ padding: 40, maxWidth: 900 }}>
      <h1>New Artwork</h1>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <section>
        <h2>Identification</h2>

        <input placeholder="Title *"
          value={form.title}
          onChange={e => updateField('title', e.target.value)}
        />

        <select value={form.artist_id}
          onChange={e => updateField('artist_id', e.target.value)}>
          <option value="">— Artist —</option>
          {artists.map(a => (
            <option key={a.id} value={a.id}>{a.last_name}</option>
          ))}
        </select>

        
        <div>
        <label>Proposed by</label><br />
        <select
            value={form.proposed_by_id}
            onChange={(e) => updateField('proposed_by_id', e.target.value)}
            style={{ width: '100%' }}
        >
            <option value="">— Select contact —</option>
            {contacts.map((c) => (
            <option key={c.id} value={c.id}>
                {c.company_name}
                {c.contact_person ? `, ${c.contact_person}` : ''}
            </option>
            ))}
        </select>
        </div>


        <input type="date"
          value={form.date_proposition}
          onChange={e => updateField('date_proposition', e.target.value)}
        />

        <input placeholder="Medium"
          value={form.medium}
          onChange={e => updateField('medium', e.target.value)}
        />
      </section>

      <section>
        <h2>Dimensions</h2>

        <input type="number" placeholder="Year"
          value={form.year_execution}
          onChange={e => updateField('year_execution', e.target.value)}
        />

        <input type="number" placeholder="Height (cm)"
          value={form.height_cm}
          onChange={e => updateField('height_cm', e.target.value)}
        />

        <input type="number" placeholder="Width (cm)"
          value={form.width_cm}
          onChange={e => updateField('width_cm', e.target.value)}
        />

        <input type="number" placeholder="Depth (cm)"
          value={form.depth_cm}
          onChange={e => updateField('depth_cm', e.target.value)}
        />
      </section>

      <section>
        <h2>Market & Documents</h2>

        <textarea placeholder="Condition"
          value={form.condition}
          onChange={e => updateField('condition', e.target.value)}
        />

        <textarea placeholder="Provenance"
          value={form.provenance}
          onChange={e => updateField('provenance', e.target.value)}
        />

        <textarea placeholder="Exhibitions & Literature"
          value={form.exhibition_literature}
          onChange={e => updateField('exhibition_literature', e.target.value)}
        />

        <label>
          <input type="checkbox"
            checked={form.certificate}
            onChange={e => updateField('certificate', e.target.checked)}
          />
          Certificate available
        </label>

        <input placeholder="Certificate location"
          value={form.certificate_location}
          onChange={e => updateField('certificate_location', e.target.value)}
        />
      </section>

      <section>
        <h2>Pricing & Status</h2>

        <input type="number" placeholder="Asking price"
          value={form.asking_price}
          onChange={e => updateField('asking_price', e.target.value)}
        />

        <select value={form.currency}
          onChange={e => updateField('currency', e.target.value)}>
          <option value="CHF">CHF</option>
          <option value="EUR">EUR</option>
          <option value="USD">USD</option>
        </select>

        <input placeholder="Location of work"
          value={form.location_of_work}
          onChange={e => updateField('location_of_work', e.target.value)}
        />

        <input placeholder="Check seller"
          value={form.check_seller}
          onChange={e => updateField('check_seller', e.target.value)}
        />

        <select value={form.priority}
          onChange={e => updateField('priority', e.target.value)}>
          <option value="">— Priority —</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select value={form.status}
          onChange={e => updateField('status', e.target.value)}>
          <option value="draft">Draft</option>
          <option value="viewed">Viewed</option>
          <option value="negotiation">Negotiation</option>
          <option value="bought">Bought</option>
        </select>

        <input type="date"
          value={form.view_date}
          onChange={e => updateField('view_date', e.target.value)}
        />
      </section>

      <section>
        <h2>Notes</h2>
        <textarea
          value={form.notes}
          onChange={e => updateField('notes', e.target.value)}
        />
      </section>

      <button onClick={handleSubmit} disabled={loading}>
        {loading ? 'Saving…' : 'Create artwork'}
      </button>
    </main>
  )
}