'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseBrowser'
import { fetchWithAuth } from '@/lib/fetchWithAuth'
import { addressLabel, type ContactAddress } from '@/lib/contactAddress'
import { certificateAddressLabel, certificateContactLabel, certificateContactName, type CertificateLocationRow } from '@/lib/certificateLocations'

type Contact = NonNullable<CertificateLocationRow['certificate_contact']> & { id: string }

export function useCertificateContactOptions(canEdit: boolean) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactsError, setContactsError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!canEdit) return
    let active = true
    void (async () => {
      setContactsLoading(true)
      setContactsError('')
      try {
        const options: Contact[] = []
        for (let offset = 0; active; offset += 500) {
          const { data, error } = await supabase.from('contacts')
            .select('id, company_name, first_name, last_name').order('id').range(offset, offset + 499)
          if (error) throw error
          options.push(...(data ?? []))
          if (!data || data.length < 500) break
        }
        options.sort((a, b) => certificateContactName(a)
          .localeCompare(certificateContactName(b), 'en', { sensitivity: 'base' }))
        if (active) setContacts(options)
      } catch (cause) {
        console.error('LOAD CERTIFICATE CONTACT OPTIONS FAILED:', cause)
        if (active) setContactsError('Unable to load contacts.')
      } finally {
        if (active) setContactsLoading(false)
      }
    })()
    return () => { active = false }
  }, [canEdit, retry])

  return { contacts, contactsLoading, contactsError, retryContacts: () => setRetry(value => value + 1) }
}

export default function CertificateLocationCells({ row, canEdit, onSaved, contactOptions }: {
  row: CertificateLocationRow
  canEdit: boolean
  onSaved: (row: CertificateLocationRow, included: boolean) => void
  contactOptions: ReturnType<typeof useCertificateContactOptions>
}) {
  const { contacts, contactsLoading, contactsError, retryContacts } = contactOptions
  const [baseline, setBaseline] = useState({
    contactId: row.certificate_location_contact_id ?? row.certificate_contact?.id ?? '',
    addressId: row.certificate_location_address_id ?? row.certificate_address?.id ?? '',
  })
  const [contactId, setContactId] = useState(baseline.contactId)
  const [addressId, setAddressId] = useState(baseline.addressId)
  const dirty = contactId !== baseline.contactId || addressId !== baseline.addressId
  const [retry, setRetry] = useState(0)
  const [addresses, setAddresses] = useState<ContactAddress[]>([])
  const [addressesLoading, setAddressesLoading] = useState(false)
  const [addressesError, setAddressesError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!canEdit || !contactId) return
    let active = true
    void (async () => {
      setAddressesLoading(true)
      setAddressesError('')
      try {
        const options: ContactAddress[] = []
        for (let offset = 0; active; offset += 500) {
          const { data, error } = await supabase.from('contact_addresses')
            .select('id, contact_id, label, address, postal_code, city, country')
            .eq('contact_id', contactId).order('id').range(offset, offset + 499)
          if (error) throw error
          options.push(...(data ?? []))
          if (!data || data.length < 500) break
        }
        if (active) setAddresses(options)
      } catch (cause) {
        console.error('LOAD CERTIFICATE ADDRESS OPTIONS FAILED:', cause)
        if (active) setAddressesError('Unable to load addresses.')
      } finally {
        if (active) setAddressesLoading(false)
      }
    })()
    return () => { active = false }
  }, [canEdit, contactId, retry])

  function cancel() {
    setContactId(baseline.contactId)
    setAddressId(baseline.addressId)
    setAddresses([])
    setAddressesLoading(Boolean(baseline.contactId))
    setAddressesError('')
    setSaveError('')
    setSaved(false)
    setRetry(value => value + 1)
  }

  async function save() {
    if (!canEdit || !dirty || saving || contactsLoading || addressesLoading || contactsError || addressesError) return
    const contact = contacts.find(option => option.id === contactId) ?? null
    const address = addresses.find(option => option.id === addressId) ?? null
    if ((contactId && !contact) || (addressId && (!address || address.contact_id !== contactId))) {
      setSaveError('Select a valid certificate contact and address before saving.')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      const response = await fetchWithAuth(`/api/artworks/${row.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certificate_location_contact_id: contactId || null,
          certificate_location_address_id: addressId || null,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to save certificate location.')
      if (result?.id !== row.id) throw new Error('Artwork update was not confirmed. Reload and retry.')
      onSaved({
        ...row, certificate_location_contact_id: result.certificate_location_contact_id,
        certificate_location_address_id: result.certificate_location_address_id,
        certificate_contact: contact, certificate_address: address,
      }, result.certificate === true || Boolean(result.certificate_location_contact_id || result.certificate_location_address_id))
      setBaseline({ contactId, addressId })
      setSaved(true)
    } catch (cause) {
      console.error('SAVE CERTIFICATE LOCATION FAILED:', cause)
      setSaveError(cause instanceof Error ? cause.message : 'Unable to save certificate location.')
    } finally {
      setSaving(false)
    }
  }

  return <>
    <td className="p-3">
      {canEdit ? <>
        <select aria-label="Certificate contact" className="w-full rounded border p-2"
          value={contactId} disabled={saving || contactsLoading || Boolean(contactsError)}
          onChange={event => {
            setContactId(event.target.value)
            setAddressId('')
            setAddresses([])
            setAddressesLoading(Boolean(event.target.value))
            setAddressesError('')
            setSaveError('')
            setSaved(false)
          }}>
          <option value="">Not specified</option>
          {contactId && !contacts.some(contact => contact.id === contactId) && (
            <option value={contactId}>{certificateContactLabel(row) || 'Current contact'}</option>
          )}
          {contacts.map(contact => <option key={contact.id} value={contact.id}>
            {certificateContactName(contact) || 'Unnamed contact'}
          </option>)}
        </select>
        {contactsLoading && <p role="status">Loading contacts...</p>}
        {contactsError && <p role="alert" className="text-red-700">{contactsError}</p>}
        {saved && <p role="status">Certificate location saved.</p>}
      </> : <>
        <div>{certificateContactLabel(row) || 'Not specified'}</div>
      </>}
    </td>
    <td className="p-3">
      {canEdit ? <>
        <select aria-label="Certificate address" className="w-full rounded border p-2"
          value={addressId} disabled={!contactId || saving || addressesLoading || Boolean(addressesError)}
          onChange={event => { setAddressId(event.target.value); setSaveError(''); setSaved(false) }}>
          <option value="">Not specified</option>
          {addressId && !addresses.some(address => address.id === addressId) && (
            <option value={addressId}>{certificateAddressLabel(row) || 'Current address'}</option>
          )}
          {addresses.map(address => <option key={address.id} value={address.id}>{addressLabel(address)}</option>)}
        </select>
        {addressesLoading && <p role="status">Loading addresses...</p>}
        {addressesError && <p role="alert" className="text-red-700">{addressesError}</p>}
        {saveError && <p role="alert" className="text-red-700">{saveError}</p>}
        {(contactsError || addressesError) && <button type="button" className="underline" onClick={() => {
          if (contactsError) retryContacts()
          if (addressesError) setRetry(value => value + 1)
        }}>Retry</button>}
        {dirty && <div className="mt-2 flex gap-3">
          <button type="button" className="underline"
            disabled={saving || contactsLoading || addressesLoading || Boolean(contactsError || addressesError)}
            onClick={() => void save()}>{saving ? 'Saving...' : 'Save'}</button>
          <button type="button" className="underline" disabled={saving} onClick={cancel}>Cancel</button>
        </div>}
      </> : certificateAddressLabel(row) || 'Not specified'}
    </td>
  </>
}
