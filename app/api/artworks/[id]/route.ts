
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
    .select('*')
    .eq('id', id)
    .limit(1)

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


  /* ---- Relations ---- */
  const loadContact = async (contactId: string | null) => {
    if (!contactId) return null
    const { data } = await supabase
      .from('contacts')
      .select('id,first_name,last_name,company_name')
      .eq('id', contactId)
      .limit(1)
    return data?.[0] ?? null
  }

  const artist = artwork.artist_id
    ? (await supabase
        .from('artists')
        .select('id,first_name,last_name,year_of_birth,year_of_death')
        .eq('id', artwork.artist_id)
        .limit(1)
      ).data?.[0] ?? null
    : null

  const proposed_by = await loadContact(artwork.proposed_by_id)
  const auction_house = await loadContact(artwork.auction_contact_id)
  const buyer = await loadContact(artwork.buyer_contact_id)
  const destination = await loadContact(artwork.destination_contact_id)

  return NextResponse.json({
    ...artwork,
    artist,
    proposed_by,
    auction_house,
    buyer,
    destination,
  })
}

/* =========================================================
   PATCH /api/artworks/[id]
   ========================================================= */
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
