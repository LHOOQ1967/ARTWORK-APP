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
