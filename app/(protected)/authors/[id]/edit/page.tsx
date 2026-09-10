'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'

type AuthorRecord = {
  first_name: string | null
  last_name: string | null
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

export default function EditAuthorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [item, setItem] = useState<AuthorRecord | null>(null)
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
        .from('library_authors')
        .select('first_name, last_name')
        .eq('legacy_no', Number(id))
        .maybeSingle()

      if (cancelled) return

      if (loadError || !data) {
        setError('Author not found')
        setItem(null)
      } else {
        setItem(data as AuthorRecord)
      }

      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [id])

  async function saveAuthor() {
    if (!item) return

    setSaving(true)
    setError('')

    const { error: updateError } = await supabase
      .from('library_authors')
      .update(item)
      .eq('legacy_no', Number(id))

    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    router.push('/referentials?section=authors')
  }

  async function removeAuthor() {
    if (!confirm('Delete this author?')) return

    setSaving(true)
    setError('')

    const { error: deleteError } = await supabase
      .from('library_authors')
      .delete()
      .eq('legacy_no', Number(id))

    setSaving(false)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    router.push('/referentials?section=authors')
  }

  if (loading) {
    return <main style={{ padding: '96px 20px 56px', minHeight: '100vh', background: '#f3f5f1' }}>Loading…</main>
  }

  if (!item) {
    return <main style={{ padding: '96px 20px 56px', minHeight: '100vh', background: '#f3f5f1' }}>{error || 'Author not found'}</main>
  }

  const displayName = [item.last_name, item.first_name].filter(Boolean).join(' ') || '—'

  return (
    <main style={{ padding: '96px 20px 56px', minHeight: '100vh', background: '#f3f5f1' }}>
      <div style={floatingActionBarStyle}>
        <Link className="edit-button" href="/referentials?section=authors">Back</Link>
        <button className="edit-button" type="button" onClick={() => void saveAuthor()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        <button className="edit-button edit-button-danger" type="button" onClick={() => void removeAuthor()} disabled={saving}>Delete</button>
      </div>

      <section style={{ maxWidth: 900, margin: '0 auto', padding: 30, background: '#fff', border: '1px solid #d7dfda', borderRadius: 12, color: 'black', boxShadow: '0 10px 28px rgba(31,56,46,0.06)' }}>
        <header style={{ marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid #e4e9e6' }}>
          <p style={{ margin: 0, color: '#557067', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Authors</p>
          <h1 style={{ margin: '10px 0 0', color: '#143b2d', fontSize: 'clamp(2rem, 5vw, 3.25rem)' }}>{displayName}</h1>
          <p style={{ margin: '10px 0 0', color: '#62736c' }}>Edit author record and update the related details.</p>
        </header>

        {error && <p style={{ margin: '0 0 18px', color: '#a22' }}>{error}</p>}

        <div style={{ display: 'grid', gap: 14 }}>
          <FieldRow label="Last name">
            <input
              style={fieldStyle}
              value={item.last_name ?? ''}
              onChange={(event) => setItem((current) => (current ? { ...current, last_name: event.target.value } : current))}
              placeholder="Last name"
            />
          </FieldRow>
          <FieldRow label="First name">
            <input
              style={fieldStyle}
              value={item.first_name ?? ''}
              onChange={(event) => setItem((current) => (current ? { ...current, first_name: event.target.value } : current))}
              placeholder="First name"
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
