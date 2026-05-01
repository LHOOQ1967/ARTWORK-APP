
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('artworks')
    .select(`
      id,
      title,
      date_proposition,
      artists (
        first_name,
        last_name
      ),
      artwork_proposals (
        proposed_at
      )
    `)

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  // Artworks sans AUCUNE proposal avec proposed_at
  const invalidArtworks = data.filter(
    artwork =>
      !artwork.artwork_proposals?.some(
        p => p.proposed_at !== null
      )
  )

  return NextResponse.json({
    checked_at: new Date().toISOString(),
    invalid_count: invalidArtworks.length,
    artworks: invalidArtworks.map(artwork => ({
      id: artwork.id,
      title: artwork.title,
      proposed_by_date: artwork.date_proposition,
      artist_name: artwork.artists
        ? [artwork.artists.first_name, artwork.artists.last_name]
            .filter(Boolean)
            .join(' ')
        : null,
    })),
  })
}
