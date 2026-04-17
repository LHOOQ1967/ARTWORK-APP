
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

type Contact = {
  id: string
  first_name: string | null
  last_name: string | null
  company_name: string | null
}

/* =========================================================
   Helper: Supabase server client (SSR, cookies + RLS)
   ========================================================= */
async function getSupabase() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )
}

/* =========================================================
   GET /api/artworks/[id]
   ========================================================= */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const supabase = await getSupabase()

  /* ---- Artwork ---- */


const { data: artworks, error } = await supabase
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
    proposed_by:contacts!artworks_proposed_by_id_fkey (
      id,
      first_name,
      last_name,
      company_name
    ),
    auction_house:contacts!artworks_auction_contact_id_fkey (
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
    destination:contacts!artworks_destination_contact_id_fkey (
      id,
      first_name,
      last_name,
      company_name
    ),
    location_contact:contacts!artworks_location_contact_fkey (
      id,
      first_name,
      last_name,
      company_name
    ),
    certificate_location_contact:contacts!artworks_certificate_location_contact_fkey (
      id,
      first_name,
      last_name,
      company_name
    ),
    artwork_proposals (
      id,
      proposed_at,
      contact:contacts (
        id,
        first_name,
        last_name,
        company_name
      )
    )
  `)
  .eq('id', id)
  .limit(1);


  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    )
  }


const artwork = artworks?.[0]

if (!artwork) {
  return NextResponse.json(
    { warning: 'No visible artwork for this user' },
    { status: 200 }
  )
}

const isBought = artwork.status === 'bought'

return NextResponse.json(artwork)
}

/* =========================================================
   PATCH /api/artworks/[id]
   ========================================================= */

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const supabase = await getSupabase();

  const { error } = await supabase
    .from('artwork_proposals')
    .insert({
      artwork_id: params.id,
      contact_id: body.contact_id,
      proposed_at: body.proposed_at ?? null,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}



   export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const supabase = await getSupabase()
  const body = await req.json()

  const { data, error } = await supabase
    .from('artworks')
    .update(body)
    .eq('id', id)
    .select()
    .limit(1)

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    )
  }

  return NextResponse.json(data?.[0] ?? null)
}
