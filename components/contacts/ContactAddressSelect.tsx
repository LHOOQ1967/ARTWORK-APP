'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseBrowser'

export type ContactAddress = {
  id: string
  contact_id: string
  label: string | null
  address: string | null
  postal_code: string | null
  city: string | null
  country: string | null
}

export function addressLabel(address: Partial<ContactAddress> | null | undefined) {
  if (!address) return ''
  const place = [address.postal_code, address.city].filter(Boolean).join(' ')
  return (
    [address.label, address.address, place, address.country].filter(Boolean).join(', ') ||
    'Adresse sans détail'
  )
}

export function useContactAddresses(contactId: string | null | undefined) {
  const [state, setState] = useState<{ contactId: string; addresses: ContactAddress[] } | null>(
    null
  )

  useEffect(() => {
    if (!contactId) return
    let active = true
    void supabase
      .from('contact_addresses')
      .select('id, contact_id, label, address, postal_code, city, country')
      .eq('contact_id', contactId)
      .order('created_at')
      .then(({ data }) => {
        if (active) setState({ contactId, addresses: (data as ContactAddress[]) ?? [] })
      })
    return () => {
      active = false
    }
  }, [contactId])

  return state && state.contactId === contactId ? state.addresses : []
}

export default function ContactAddressSelect({
  contactId,
  value,
  onChange,
  disabled,
  className,
  style,
}: Readonly<{
  contactId: string | null | undefined
  value: string | null | undefined
  onChange: (addressId: string | null) => void
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
}>) {
  const addresses = useContactAddresses(contactId)

  if (!contactId || addresses.length === 0) return null

  return (
    <select
      className={className}
      style={{ marginTop: 6, width: '100%', ...style }}
      value={value ?? ''}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value || null)}
    >
      <option value="">Adresse…</option>
      {addresses.map((address) => (
        <option key={address.id} value={address.id}>
          {addressLabel(address)}
        </option>
      ))}
    </select>
  )
}
