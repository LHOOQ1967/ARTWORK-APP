
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const accessToken = req.cookies.get('sb-access-token')?.value

  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1️⃣ Fetch artwork (sans jointure)
  const artworkRes = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/artworks?id=eq.${id}&select=*`,
    {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (!artworkRes.ok) {
    return NextResponse.json(
      { error: 'Failed to fetch artwork' },
      { status: artworkRes.status }
    )
  }

  const artworks = await artworkRes.json()
  const artwork = artworks[0]

  if (!artwork) {
    return NextResponse.json({ error: 'Artwork not found' }, { status: 404 })
  }

  // 2️⃣ Fetch artist explicitly
  let artist = null
  if (artwork.artist_id) {
    const artistRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/artists?id=eq.${artwork.artist_id}&select=first_name,last_name,year_of_birth,year_of_death`,
      {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (artistRes.ok) {
      const artists = await artistRes.json()
      artist = artists[0] ?? null
    }
  }

  // 3️⃣ Return merged object
  return NextResponse.json({
    ...artwork,
    artist,
  })
}
