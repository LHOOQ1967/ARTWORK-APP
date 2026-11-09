import type { supabaseServer } from '@/lib/supabaseServer'
import { auctionHouseNames, type AuctionContactDefaults, type AuctionProvider } from './auction'

export async function resolveAuctionContact(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  currency: string | null,
  provider: AuctionProvider,
): Promise<AuctionContactDefaults> {
  const house = auctionHouseNames[provider]
  const search = provider === 'sothebys' ? 'sotheby' : provider === 'christies' ? 'christie' : 'phillips'
  const { data: contacts, error: contactError } = await supabase.from('contacts')
    .select('id, company_name').ilike('company_name', `%${search}%`)
  if (contactError) throw new Error(`Could not load the ${house} contact.`)
  const matches = (contacts ?? []).filter(contact =>
    contact.company_name?.trim().toLowerCase().replace(/[\u2019']/g, '') === house.toLowerCase().replace(/'/g, ''))
  if (matches.length !== 1) throw new Error(`A unique ${house} company contact is required to prefill the import.`)
  const contactId = matches[0].id
  const city = currency === 'USD' ? 'New York' : currency === 'GBP' ? 'London' : currency === 'EUR' ? 'Paris' : null
  if (!city) return {
    contact_id: contactId, location_address_id: null, city: null,
    warning: `No automatic ${house} address is configured for this currency. Select the location address in the creation form.`,
  }
  const { data: addresses, error: addressError } = await supabase.from('contact_addresses')
    .select('id, city').eq('contact_id', contactId).ilike('city', city)
  if (addressError) throw new Error(`Could not load the ${house} location address.`)
  if (addresses?.length !== 1) throw new Error(`A unique ${house} ${city} address is required to prefill this import.`)
  return { contact_id: contactId, location_address_id: addresses[0].id, city, warning: null }
}
