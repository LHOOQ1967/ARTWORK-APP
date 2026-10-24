'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabaseBrowser'

type QualityChange = {
  id: string
  old_quality: number | null
  new_quality: number | null
  created_at: string
}

export function QualitySelect({
  value,
  onChange,
  disabled = false,
  style,
  unratedLabel = 'Not rated',
}: {
  value?: number | null
  onChange: (value: number | null) => void
  disabled?: boolean
  style?: CSSProperties
  unratedLabel?: string
}) {
  return (
    <select
      aria-label="Quality"
      value={value ?? ''}
      disabled={disabled}
      onChange={event => onChange(event.target.value === '' ? null : Number(event.target.value))}
      style={style}
    >
      <option value="">{unratedLabel}</option>
      {Array.from({ length: 10 }, (_, index) => index + 1).map(score => (
        <option key={score} value={score}>{score}/10</option>
      ))}
    </select>
  )
}

export function QualityHistory({
  artworkId,
  children = 'History',
  style,
}: {
  artworkId: string
  children?: ReactNode
  style?: CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const [changes, setChanges] = useState<QualityChange[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (!open) return
    dialogRef.current?.showModal()
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const history: QualityChange[] = []
        const pageSize = 200
        for (let offset = 0; !cancelled; offset += pageSize) {
          const { data, error: queryError } = await supabase
            .from('artwork_quality_history')
            .select('id, old_quality, new_quality, created_at')
            .eq('artwork_id', artworkId)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(offset, offset + pageSize - 1)
          if (queryError) throw queryError
          history.push(...(data ?? []))
          if (!data || data.length < pageSize) break
        }
        if (!cancelled) setChanges(history)
      } catch (cause) {
        console.error('Failed to load quality history', cause)
        if (!cancelled) setError('Failed to load quality history. Close and reopen to retry.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [open, artworkId])

  return (
    <>
      <button
        type="button"
        aria-label="View quality history"
        aria-haspopup="dialog"
        onClick={event => { event.stopPropagation(); setOpen(true) }}
        style={{ fontSize: 11, cursor: 'pointer', textDecoration: 'underline', ...style }}
      >
        {children}
      </button>
      {open && createPortal(
        <dialog
          ref={dialogRef}
          aria-label="Quality history"
          onClose={() => setOpen(false)}
          onClick={event => event.stopPropagation()}
          style={{ margin: 'auto', padding: 24, border: '1px solid #ccc', borderRadius: 8, maxWidth: '90vw', maxHeight: '80vh' }}
        >
          <h2 style={{ fontSize: 20, marginBottom: 16 }}>Quality history</h2>
          {loading ? <p role="status">Loading quality history...</p> : error ? (
            <p role="alert">{error}</p>
          ) : changes.length === 0 ? <p>No quality changes recorded.</p> : (
            <table style={{ borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ padding: 8 }}>Date</th><th style={{ padding: 8 }}>Previous quality</th><th style={{ padding: 8 }}>New quality</th></tr></thead>
              <tbody>
                {changes.map(change => (
                  <tr key={change.id}>
                    <td style={{ padding: 8 }}>{new Date(change.created_at).toLocaleString('en-GB')}</td>
                    <td style={{ padding: 8 }}>{change.old_quality == null ? 'Not rated' : `${change.old_quality}/10`}</td>
                    <td style={{ padding: 8 }}>{change.new_quality == null ? 'Not rated' : `${change.new_quality}/10`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button type="button" autoFocus onClick={() => dialogRef.current?.close()} style={{ marginTop: 16 }}>Close</button>
        </dialog>,
        document.body
      )}
    </>
  )
}
