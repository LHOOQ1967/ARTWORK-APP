'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabaseBrowser'
import { addressLabel, type ContactAddress } from '@/lib/contactAddress'

type LocationChange = {
  id: string
  old_location: string | null
  new_location: string | null
  actor_email: string | null
  is_initial: boolean
  created_at: string
}

export function CertificateAddress({ addressId }: { addressId?: string | null }) {
  const [result, setResult] = useState<{ id: string; label?: string; error?: string } | null>(null)
  useEffect(() => {
    if (!addressId) return
    let active = true
    void (async () => {
      try {
        const { data, error } = await supabase.from('contact_addresses')
          .select('id, contact_id, label, address, postal_code, city, country')
          .eq('id', addressId).single<ContactAddress>()
        if (error) throw error
        if (active) setResult({ id: addressId, label: addressLabel(data) })
      } catch (cause) {
        console.error('LOAD CERTIFICATE ADDRESS FAILED:', cause)
        if (active) setResult({ id: addressId, error: 'Unable to load certificate address.' })
      }
    })()
    return () => { active = false }
  }, [addressId])
  if (!addressId) return null
  if (result?.id !== addressId) return <span role="status">Loading certificate address...</span>
  return <span role={result.error ? 'alert' : undefined}>{result.error ?? result.label}</span>
}

export function CertificateLocationHistory({ artworkId }: { artworkId?: string | null }) {
  const [open, setOpen] = useState(false)
  const [changes, setChanges] = useState<LocationChange[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (!open || !artworkId) return
    dialogRef.current?.showModal()
    let active = true
    void (async () => {
      setLoading(true)
      setError('')
      try {
        const history: LocationChange[] = []
        for (let offset = 0; active; offset += 200) {
          const { data, error: queryError } = await supabase.from('artwork_certificate_location_history')
            .select('id, old_location, new_location, actor_email, is_initial, created_at')
            .eq('artwork_id', artworkId).order('created_at', { ascending: false })
            .order('id', { ascending: false }).range(offset, offset + 199)
          if (queryError) throw queryError
          history.push(...(data ?? []))
          if (!data || data.length < 200) break
        }
        if (active) setChanges(history)
      } catch (cause) {
        console.error('LOAD CERTIFICATE LOCATION HISTORY FAILED:', cause)
        if (active) setError('Unable to load certificate location history. Close and reopen to retry.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [open, artworkId])
  if (!artworkId) return null
  return <>
    <button type="button" className="no-print" aria-label="View certificate location history"
      aria-haspopup="dialog" style={{ marginLeft: 8, textDecoration: 'underline', fontSize: 12 }}
      onClick={() => setOpen(true)}>History</button>
    {open && createPortal(
      <dialog ref={dialogRef} aria-label="Certificate location history" onClose={() => setOpen(false)}
        style={{ margin: 'auto', padding: 24, borderRadius: 8, maxWidth: '90vw', maxHeight: '80vh' }}>
        <h2 style={{ fontSize: 20 }}>Certificate location history</h2>
        <p>Initial entries record the known location, not the original move date.</p>
        {loading ? <p role="status">Loading history...</p> : error ? <p role="alert">{error}</p> :
          changes.length === 0 ? <p>No certificate location changes recorded.</p> :
            <table style={{ borderSpacing: 12 }}>
              <thead><tr><th>Date</th><th>Previous location</th><th>New location</th><th>User</th></tr></thead>
              <tbody>{changes.map(change => <tr key={change.id}>
                <td>{new Date(change.created_at).toLocaleString('en-GB')}{change.is_initial ? ' (initial record)' : ''}</td>
                <td>{change.old_location ?? 'Not specified'}</td>
                <td>{change.new_location ?? 'Not specified'}</td>
                <td>{change.actor_email ?? 'System / migration'}</td>
              </tr>)}</tbody>
            </table>}
        <button type="button" autoFocus onClick={() => dialogRef.current?.close()}>Close</button>
      </dialog>, document.body)}
  </>
}
