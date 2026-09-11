'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseBrowser'
import { useSessionProfile } from '@/contexts/SessionContext'

type RelatedNameRecord = {
  name: string | null
  location: string | null
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

export default function EditRelatedNamePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { role, loading: sessionLoading } = useSessionProfile()
  const canWrite = role === 'Editor' || role === 'Administrator'
  const [item, setItem] = useState<RelatedNameRecord | null>(null)
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
        .from('library_related_names')
        .select('name, location')
        .eq('legacy_no', Number(id))
        .maybeSingle()

      if (cancelled) return

      if (loadError || !data) {
        setError('Related name not found')
        setItem(null)
      } else {
        setItem(data as RelatedNameRecord)
      }

      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [id])

  async function saveRelatedName() {
    if (!item || !canWrite) return

    setSaving(true)
    setError('')

    const { error: updateError } = await supabase
      .from('library_related_names')
      .update(item)
      .eq('legacy_no', Number(id))

    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    router.push('/referentials?section=related-names')
  }

  async function removeRelatedName() {
    if (!canWrite) return
    if (!confirm('Delete this related name?')) return

    setSaving(true)
    setError('')

    const { error: deleteError } = await supabase
      .from('library_related_names')
      .delete()
      .eq('legacy_no', Number(id))

    setSaving(false)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    router.push('/referentials?section=related-names')
  }

  if (loading) {
    return <main style={{ padding: '96px 20px 56px', minHeight: '100vh', background: '#f3f5f1' }}>Loading…</main>
  }

  if (!item) {
    return <main style={{ padding: '96px 20px 56px', minHeight: '100vh', background: '#f3f5f1' }}>{error || 'Related name not found'}</main>
  }

  return (
    <main style={{ padding: '96px 20px 56px', minHeight: '100vh', background: '#f3f5f1' }}>
      <div style={floatingActionBarStyle}>
        <Link className="edit-button" href="/referentials?section=related-names">Back</Link>
        <button className="edit-button" type="button" onClick={() => void saveRelatedName()} disabled={saving || !canWrite}>{saving ? 'Saving…' : 'Save'}</button>
        <button className="edit-button edit-button-danger" type="button" onClick={() => void removeRelatedName()} disabled={saving || !canWrite}>Delete</button>
      </div>

      <section style={{ maxWidth: 900, margin: '0 auto', padding: 30, background: '#fff', border: '1px solid #d7dfda', borderRadius: 12, color: 'black', boxShadow: '0 10px 28px rgba(31,56,46,0.06)' }}>
        <header style={{ marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid #e4e9e6' }}>
          <p style={{ margin: 0, color: '#557067', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Related names</p>
          <h1 style={{ margin: '10px 0 0', color: '#143b2d', fontSize: 'clamp(2rem, 5vw, 3.25rem)' }}>{item.name || '—'}</h1>
          <p style={{ margin: '10px 0 0', color: '#62736c' }}>Edit related name record and update the related details.</p>
        </header>

        {!sessionLoading && !canWrite && <p style={{ margin: '0 0 18px', color: '#a66', background: '#fff7e6', border: '1px solid #f0d999', borderRadius: 8, padding: '10px 14px' }}>Mode lecture seule : votre rôle actuel ne permet pas de modifier ou supprimer ce nom lié.</p>}
        {error && <p style={{ margin: '0 0 18px', color: '#a22' }}>{error}</p>}

        <div style={{ display: 'grid', gap: 14 }}>
          <FieldRow label="Name">
            <input
              style={fieldStyle}
              value={item.name ?? ''}
              onChange={(event) => setItem((current) => (current ? { ...current, name: event.target.value } : current))}
              placeholder="Name"
            />
          </FieldRow>
          <FieldRow label="Location">
            <input
              style={fieldStyle}
              value={item.location ?? ''}
              onChange={(event) => setItem((current) => (current ? { ...current, location: event.target.value } : current))}
              placeholder="Location"
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
