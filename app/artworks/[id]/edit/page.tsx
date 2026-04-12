
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type ArtworkForm = {
  title: string
  status: string
  asking_price: number | null
  currency: string
}

export default function EditArtworkPage() {
  const params = useParams()
  const router = useRouter()

  const id = typeof params.id === 'string' ? params.id : null

  const [form, setForm] = useState<ArtworkForm>({
    title: '',
    status: 'draft',
    asking_price: null,
    currency: 'CHF',
  })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Charger l’artwork existant
   */
  useEffect(() => {
    if (!id) return

    const loadArtwork = async () => {
      try {
        const res = await fetch(`/api/artworks/${id}`)
        const data = await res.json()

        if (!res.ok) {
          setError(data.error || 'Failed to load artwork')
          return
        }

        setForm({
          title: data.title ?? '',
          status: data.status ?? 'draft',
          asking_price: data.asking_price ?? null,
          currency: data.currency ?? 'CHF',
        })
      } catch {
        setError('Network error')
      } finally {
        setLoading(false)
      }
    }

    loadArtwork()
  }, [id])

  /**
   * Mise à jour des champs
   */
  const updateField = (field: keyof ArtworkForm, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  /**
   * Sauvegarde
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return

    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/artworks/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to save artwork')
        setSaving(false)
        return
      }

      // ✅ retour vers la page détail
      router.push(`/artworks/${id}`)
    } catch {
      setError('Network error')
      setSaving(false)
    }
  }

  if (!id) {
    return <p style={{ padding: 40 }}>Invalid artwork id</p>
  }

  if (loading) {
    return <p style={{ padding: 40 }}>Loading artwork…</p>
  }

  if (error) {
    return <p style={{ padding: 40, color: 'red' }}>{error}</p>
  }

  return (
    <main style={{ padding: 40, maxWidth: 600 }}>
      <h1>Edit artwork</h1>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label>Title</label><br />
          <input
            value={form.title}
            onChange={(e) => updateField('title', e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>Status</label><br />
          <select
            value={form.status}
            onChange={(e) => updateField('status', e.target.value)}
          >
            <option value="draft">Draft</option>
            <option value="viewed">Viewed</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>Asking price</label><br />
          <input
            type="number"
            value={form.asking_price ?? ''}
            onChange={(e) =>
              updateField(
                'asking_price',
                e.target.value ? Number(e.target.value) : null
              )
            }
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label>Currency</label><br />
          <input
            value={form.currency}
            onChange={(e) => updateField('currency', e.target.value)}
            style={{ width: 100 }}
          />
        </div>

        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>

        {' '}
        <button
          type="button"
          onClick={() => router.push(`/artworks/${id}`)}
        >
          Cancel
        </button>
      </form>
    </main>
  )
}
