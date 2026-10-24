import { addressLabel, type ContactAddress } from '@/lib/contactAddress'

export type CertificateLocationRow = {
  id: string
  certificate?: boolean | null
  certificate_location_contact_id?: string | null
  certificate_location_address_id?: string | null
  image_url?: string | null
  title: string | null
  year_execution: number | null
  year_execution_start: number | null
  artist: { first_name: string | null; last_name: string | null } | null
  certificate_contact: { id?: string; company_name: string | null; first_name: string | null; last_name: string | null } | null
  certificate_address: ContactAddress | null
}

export function certificateContactLabel(row: CertificateLocationRow) {
  return certificateContactName(row.certificate_contact)
}

export function certificateContactName(contact: CertificateLocationRow['certificate_contact']) {
  return contact?.company_name?.trim() ||
    [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') || ''
}

export function certificateArtistLabel(row: CertificateLocationRow) {
  return [row.artist?.first_name, row.artist?.last_name].filter(Boolean).join(' ')
}

export function certificateAddressLabel(row: CertificateLocationRow) {
  return row.certificate_address ? addressLabel(row.certificate_address) : ''
}
