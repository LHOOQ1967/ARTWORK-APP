'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchWithAuth } from '@/lib/fetchWithAuth'
import { addressLabel, type ContactAddress } from '@/lib/contactAddress'

type HistoryRow = {
  id: string
  started_at: string
  contact: {
    company_name: string | null
    first_name: string | null
    last_name: string | null
  } | null
  address: Partial<ContactAddress> | null
}

function contactLabel(contact: HistoryRow['contact']) {
  if (!contact) return 'Unknown location'
  return (
    contact.company_name ||
    [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
    'Unnamed contact'
  )
}

export default function ArtworkLocationHistory({ artworkId }: { artworkId: string }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (!open) return
    dialogRef.current?.showModal()
    let active = true
    void (async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetchWithAuth(`/api/transports?artworkId=${artworkId}`)
        const payload = (await response.json().catch(() => ({}))) as {
          history?: HistoryRow[]
          error?: string
        }
        if (!response.ok) throw new Error(payload.error ?? 'Unable to load location history.')
        if (active) setRows(payload.history ?? [])
      } catch (cause) {
        console.error('LOAD LOCATION HISTORY FAILED:', cause)
        if (active) setError('Unable to load location history. Close and reopen to retry.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [open, artworkId])

  return (
    <>
      <button
        type="button"
        className="no-print"
        aria-label="View location history"
        aria-haspopup="dialog"
        style={{
          marginLeft: 0, textDecoration: 'underline', fontSize: 15, minHeight: 0,
          padding: 0, border: 0, background: 'transparent', boxShadow: 'none', fontWeight: 400,
        }}
        onClick={() => setOpen(true)}
      >
        History
      </button>
      {open &&
        createPortal(
          <dialog
            ref={dialogRef}
            aria-label="Location history"
            onClose={() => setOpen(false)}
            style={{ margin: 'auto', padding: 24, borderRadius: 8, maxWidth: '90vw', maxHeight: '80vh' }}
          >
            <h2 style={{ fontSize: 20 }}>Location history</h2>
            {loading ? (
              <p role="status">Loading history...</p>
            ) : error ? (
              <p role="alert">{error}</p>
            ) : rows.length === 0 ? (
              <p>No location history recorded.</p>
            ) : (
              <ul style={{ margin: '12px 0', paddingLeft: 0, listStyle: 'none' }}>
                {rows.map((row) => (
                  <li key={row.id} style={{ padding: '2px 0' }}>
                    {new Date(row.started_at).toLocaleDateString('en-GB')} — {contactLabel(row.contact)}
                    {row.address ? ` (${addressLabel(row.address)})` : ''}
                  </li>
                ))}
              </ul>
            )}
            <button type="button" autoFocus onClick={() => dialogRef.current?.close()}>
              Close
            </button>
          </dialog>,
          document.body
        )}
    </>
  )
}
