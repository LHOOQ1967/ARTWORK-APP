'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseBrowser'
import type { ContactAddress } from '@/components/contacts/ContactAddressSelect'

const FIELDS = [
  ['label', 'Label (ex. New York)'],
  ['address', 'Adresse'],
  ['postal_code', 'Code postal'],
  ['city', 'Ville'],
  ['country', 'Pays'],
] as const

type Draft = Omit<ContactAddress, 'contact_id'>

const inputStyle: React.CSSProperties = {
  minHeight: 38,
  padding: '7px 10px',
  border: '1px solid #aabdb3',
  borderRadius: 8,
  backgroundColor: '#fbfdfb',
  minWidth: 0,
}

export default function ContactAddressesEditor({
  contactId,
}: Readonly<{ contactId: string }>) {
  const [rows, setRows] = useState<Draft[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('contact_addresses')
      .select('id, label, address, postal_code, city, country')
      .eq('contact_id', contactId)
      .order('created_at')
    if (loadError) setError('Impossible de charger les adresses.')
    else setRows((data as Draft[]) ?? [])
  }, [contactId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  async function run(action: PromiseLike<{ error: unknown }>) {
    setError('')
    const { error: actionError } = await action
    if (actionError) setError('Opération impossible.')
    await load()
  }

  const update = (id: string, key: keyof Draft, value: string) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [key]: value } : row)))

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {error && <p style={{ color: '#a11' }}>{error}</p>}
      {rows.length === 0 && <p style={{ color: '#557067' }}>Aucune adresse.</p>}
      {rows.map((row) => (
        <div
          key={row.id}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}
        >
          {FIELDS.map(([key, placeholder]) => (
            <input
              key={key}
              style={{ ...inputStyle, flex: key === 'address' ? '2 1 220px' : '1 1 130px' }}
              placeholder={placeholder}
              value={row[key] ?? ''}
              onChange={(event) => update(row.id, key, event.target.value)}
            />
          ))}
          <button
            className="edit-button"
            type="button"
            onClick={() =>
              void run(
                supabase
                  .from('contact_addresses')
                  .update({
                    label: row.label?.trim() || null,
                    address: row.address?.trim() || null,
                    postal_code: row.postal_code?.trim() || null,
                    city: row.city?.trim() || null,
                    country: row.country?.trim() || null,
                  })
                  .eq('id', row.id)
              )
            }
          >
            Enregistrer
          </button>
          <button
            className="edit-button"
            type="button"
            onClick={() => {
              if (!window.confirm('Supprimer cette adresse ?')) return
              void run(supabase.from('contact_addresses').delete().eq('id', row.id))
            }}
          >
            Supprimer
          </button>
        </div>
      ))}
      <div>
        <button
          className="edit-button"
          type="button"
          onClick={() =>
            void run(supabase.from('contact_addresses').insert({ contact_id: contactId }))
          }
        >
          Ajouter une adresse
        </button>
      </div>
    </div>
  )
}
