'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'

type BookTypeRecord = {
  type_number: string | null
  description: string | null
  full_name: string | null
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 42,
  padding: '9px 12px',
  border: '1px solid #aabdb3',
  borderRadius: 8,
  backgroundColor: '#fbfdfb',
  boxShadow: 'inset 0 1px 2px rgba(23, 63, 49, 0.05)',
}

const floatingActionBarStyle: React.CSSProperties = {
  position: 'fixed',
  top: 68,
  right: 24,
  zIndex: 1100,
  display: 'flex',
  gap: 12,
  padding: 12,
  borderRadius: 10,
  backgroundColor: '#f3f5f1',
  boxShadow: '0 8px 24px rgba(31,56,46,0.16)',
}

function FieldRow({
  label,
  children,
}: Readonly<{
  label: string
  children: React.ReactNode
}>) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, padding: '10px 0', borderBottom: '1px solid #eef2ef' }}>
      <div style={{ color: '#557067', fontWeight: 700 }}>{label}</div>
      <div>{children}</div>
    </div>
  )
}

export default function EditBookTypePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [item, setItem] = useState<BookTypeRecord | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return

    let cancelled = false

    void (async () => {
      setLoading(true)
      setError('')

      const { data, error: loadError } = await supabase
        .from('library_book_types')
        .select('type_number, description, full_name')
        .eq('legacy_no', Number(id))
        .maybeSingle()

      if (cancelled) return

      if (loadError || !data) {
        setError('Book type not found')
        setItem(null)
      } else {
        setItem(data as BookTypeRecord)
      }

      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [id])

  async function saveBookType() {
    if (!item) return

    setSaving(true)
    setError('')

    const { error: updateError } = await supabase
      .from('library_book_types')
      .update(item)
      .eq('legacy_no', Number(id))

    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    router.push('/referentials?section=types')
  }

  async function removeBookType() {
    if (!confirm('Delete this book type?')) return

    setSaving(true)
    setError('')

    const { error: deleteError } = await supabase
      .from('library_book_types')
      .delete()
      .eq('legacy_no', Number(id))

    setSaving(false)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    router.push('/referentials?section=types')
  }

  if (loading) {
    return <main style={{ padding: '96px 20px 56px', minHeight: '100vh', background: '#f3f5f1' }}>Loading…</main>
  }

  if (!item) {
    return <main style={{ padding: '96px 20px 56px', minHeight: '100vh', background: '#f3f5f1' }}>{error || 'Book type not found'}</main>
  }

  return (
    <main style={{ padding: '96px 20px 56px', minHeight: '100vh', background: '#f3f5f1' }}>
      <div style={floatingActionBarStyle}>
        <Link className="edit-button" href="/referentials?section=types">Back</Link>
        <button className="edit-button" type="button" onClick={() => void saveBookType()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        <button className="edit-button edit-button-danger" type="button" onClick={() => void removeBookType()} disabled={saving}>Delete</button>
      </div>

      <section style={{ maxWidth: 900, margin: '0 auto', padding: 30, background: '#fff', border: '1px solid #d7dfda', borderRadius: 12, color: 'black', boxShadow: '0 10px 28px rgba(31,56,46,0.06)' }}>
        <header style={{ marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid #e4e9e6' }}>
          <p style={{ margin: 0, color: '#557067', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Type of books</p>
          <h1 style={{ margin: '10px 0 0', color: '#143b2d', fontSize: 'clamp(2rem, 5vw, 3.25rem)' }}>{item.full_name || item.description || item.type_number || '—'}</h1>
          <p style={{ margin: '10px 0 0', color: '#62736c' }}>Edit book type record and update the related details.</p>
        </header>

        {error && <p style={{ margin: '0 0 18px', color: '#a22' }}>{error}</p>}

        <div style={{ display: 'grid', gap: 14 }}>
          <FieldRow label="Type number">
            <input
              style={fieldStyle}
              value={item.type_number ?? ''}
              onChange={(event) => setItem((current) => (current ? { ...current, type_number: event.target.value } : current))}
              placeholder="Type number"
            />
          </FieldRow>
          <FieldRow label="Description">
            <input
              style={fieldStyle}
              value={item.description ?? ''}
              onChange={(event) => setItem((current) => (current ? { ...current, description: event.target.value } : current))}
              placeholder="Description"
            />
          </FieldRow>
          <FieldRow label="Full name">
            <input
              style={fieldStyle}
              value={item.full_name ?? ''}
              onChange={(event) => setItem((current) => (current ? { ...current, full_name: event.target.value } : current))}
              placeholder="Full name"
            />
          </FieldRow>
          <FieldRow label="Record">
            <div>{id}</div>
          </FieldRow>
        </div>
      </section>
    </main>
  )
}
