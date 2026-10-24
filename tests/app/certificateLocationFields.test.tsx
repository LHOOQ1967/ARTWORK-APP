import { Children, isValidElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ArtworkFieldsLayout } from '@/components/artwork/ArtworkFieldsLayout'
import type { ArtworkForm } from '@/app/(protected)/types/artwork'
import ContactAddressSelect from '@/components/contacts/ContactAddressSelect'

vi.mock('@/lib/supabaseBrowser', () => ({ supabase: {} }))

function findRow(node: ReactNode): ReactNode {
  if (Array.isArray(node)) {
    return node.map(findRow).find(Boolean)
  }
  if (!isValidElement<{ label?: string; children?: ReactNode }>(node)) return null
  if (node.props.label === 'Certificate Location') return node.props.children
  return findRow(node.props.children)
}

describe('certificate location creation fields', () => {
  it('clears the certificate address when changing contact without changing artwork location', () => {
    const setArtwork = vi.fn()
    const artwork = {
      certificate: true, certificate_location_contact_id: 'old-contact',
      certificate_location_address_id: 'old-address', location_contact_id: 'artwork-storage',
    } as ArtworkForm
    const children = Children.toArray(findRow(ArtworkFieldsLayout({ artwork, setArtwork, isEditing: true })))
    const contact = children[0]
    if (!isValidElement<{ onChange: (id: string) => void }>(contact)) throw new Error('Missing contact selector')
    contact.props.onChange('new-contact')
    expect(setArtwork).toHaveBeenCalledWith({
      ...artwork, certificate_location_contact_id: 'new-contact', certificate_location_address_id: null,
    })
  })
  it('offers addresses only for the certificate contact and persists the chosen address', () => {
    const setArtwork = vi.fn()
    const artwork = { certificate: true, certificate_location_contact_id: 'certificate-contact' } as ArtworkForm
    const children = Children.toArray(findRow(ArtworkFieldsLayout({ artwork, setArtwork, isEditing: false })))
    const address = children.find(child => isValidElement(child) && child.type === ContactAddressSelect)
    if (!isValidElement<{ contactId: string; disabled: boolean; onChange: (id: string | null) => void }>(address)) {
      throw new Error('Missing certificate address selector')
    }
    expect(address.props.contactId).toBe('certificate-contact')
    expect(address.props.disabled).toBe(true)
    address.props.onChange('certificate-address')
    expect(setArtwork).toHaveBeenCalledWith({ ...artwork, certificate_location_address_id: 'certificate-address' })
  })
})
