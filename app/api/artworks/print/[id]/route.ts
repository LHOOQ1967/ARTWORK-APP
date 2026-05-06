
import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json(
      { error: 'Missing artwork id' },
      { status: 400 }
    )
  }
const supabase = await supabaseServer()

  const { data, error } = await supabase
    .from('artworks')
    .select(`
      *,
      artist:artists (
        id,
        first_name,
        last_name,
        year_of_birth,
        year_of_death
      ),
      documents:documents (
        id,
        document_type,
        label,
        url,
        artwork_id
      ),
      proposedBy:contacts!artworks_proposed_by_id_fkey (
        id,
        first_name,
        last_name,
        company_name
      ),
      auctionHouse:contacts!artworks_auction_contact_id_fkey (
        id,
        first_name,
        last_name,
        company_name
      ),
      buyer:contacts!artworks_buyer_contact_id_fkey (
        id,
        first_name,
        last_name,
        company_name
      ),
      location:contacts!artworks_location_contact_fkey (
        id,
        first_name,
        last_name,
        company_name
      ),
      certificateLocation:contacts!artworks_certificate_location_contact_id_fkey (
        id,
        first_name,
        last_name,
        company_name
      )
    `)
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: 'Artwork not found' },
      { status: 404 }
    )
  }

  return NextResponse.json(data)
}
