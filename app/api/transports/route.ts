import { NextRequest, NextResponse } from 'next/server'
import { requireRole, requireUser } from '@/lib/apiAuth'
import { parseTransportInput } from '@/lib/transports'

const EDITOR_ROLES = ['Editor', 'Administrator'] as const

const TRANSPORT_SELECT = `
  id, artwork_id, origin_contact_id, destination_contact_id, instruction_contact_id,
  origin_address_id, destination_address_id,
  origin_address:contact_addresses!artwork_transports_origin_address_id_fkey(id, label, address, postal_code, city, country),
  destination_address:contact_addresses!artwork_transports_destination_address_id_fkey(id, label, address, postal_code, city, country),
  instruction_date, transport_date, arrival_date, notes, final_invoice_pdf_url, created_at,
  artwork:artworks!artwork_transports_artwork_id_fkey(
    id, title, year_execution, artist:artists(first_name, last_name),
    location:contacts!artworks_location_contact_fkey(id, company_name, first_name, last_name),
    location_address:contact_addresses!artworks_location_address_id_fkey(id, label, address, postal_code, city, country),
    artwork_destination_address:contact_addresses!artworks_destination_address_id_fkey(id, label, address, postal_code, city, country),
    artwork_destination:contacts!artworks_destination_contact_id_fkey(id, company_name, first_name, last_name)
  ),
  origin:contacts!artwork_transports_origin_contact_id_fkey(id, company_name, first_name, last_name),
  destination:contacts!artwork_transports_destination_contact_id_fkey(id, company_name, first_name, last_name),
  quotes:artwork_transport_quotes(
    id, transport_id, carrier_contact_id, quote_date, amount, currency,
    submitted_to_buyer_date, accepted_date, quote_pdf_url, created_at,
    carrier:contacts!artwork_transport_quotes_carrier_contact_id_fkey(id, company_name, first_name, last_name)
  )
`

export async function GET(request: NextRequest) {
  const authorization = await requireUser(request)
  if (authorization.response) return authorization.response

  const { supabase } = authorization
  const artworkId = request.nextUrl.searchParams.get('artworkId')

  let query = supabase
    .from('artwork_transports')
    .select(TRANSPORT_SELECT)
    .order('created_at', { ascending: false })
  if (artworkId) query = query.eq('artwork_id', artworkId)

  const [transports, history, artworks, contacts] = await Promise.all([
    query,
    artworkId
      ? supabase
          .from('artwork_location_history')
          .select(
            'id, started_at, ended_at, contact:contacts(id, company_name, first_name, last_name), address:contact_addresses(id, label, address, postal_code, city, country)'
          )
          .eq('artwork_id', artworkId)
          .order('started_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    artworkId
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from('artworks')
          .select(
            'id, title, year_execution, status, location_contact_id, destination_contact_id, location_address_id, destination_address_id, artist:artists(first_name, last_name)'
          )
          .order('title'),
    artworkId
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from('contacts')
          .select('id, company_name, first_name, last_name')
          .order('company_name'),
  ])

  const error = transports.error ?? history.error ?? artworks.error ?? contacts.error
  if (error) {
    console.error('TRANSPORTS GET FAILED:', error)
    return NextResponse.json({ error: 'Unable to load transports' }, { status: 500 })
  }

  const artworkIds = [...new Set((transports.data ?? []).map((t) => t.artwork_id))]
  const images: Record<string, string> = {}
  if (artworkIds.length > 0) {
    const { data: docs } = await supabase
      .from('documents')
      .select('artwork_id, url, position')
      .eq('document_type', 'image')
      .in('artwork_id', artworkIds)
      .order('position', { ascending: true })
    for (const doc of docs ?? []) {
      if (doc.url && !images[doc.artwork_id]) images[doc.artwork_id] = doc.url
    }
  }

  return NextResponse.json({
    transports: (transports.data ?? []).map((t) => ({
      ...t,
      image_url: images[t.artwork_id] ?? null,
    })),
    history: history.data ?? [],
    artworks: artworks.data ?? [],
    contacts: contacts.data ?? [],
    canEdit: authorization.role !== 'Viewer',
  })
}

export async function POST(request: NextRequest) {
  const authorization = await requireRole(EDITOR_ROLES, request)
  if (authorization.response) return authorization.response

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const input = parseTransportInput(body, true)
  if (!input) {
    return NextResponse.json({ error: 'Invalid transport' }, { status: 400 })
  }

  const { data, error } = await authorization.supabase
    .from('artwork_transports')
    .insert({ ...input, created_by: authorization.userId })
    .select('id')
    .single()

  if (error) {
    console.error('TRANSPORT CREATE FAILED:', error)
    return NextResponse.json({ error: 'Unable to create transport' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}
