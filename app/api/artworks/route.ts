
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'

/* ======================================
   GET /api/artworks
   ====================================== */

export async function GET(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      console.error('[api/artworks] Missing env variables')
      return NextResponse.json([], { status: 500 })
    }

    const { searchParams } = new URL(req.url)
    const view = searchParams.get('view')

    // ✅ SELECT AVEC LES NOMS EXACTS DES FKs
    const select = `
      *,
      artist:artists!artworks_artist_id_fkey (
        id,
        first_name,
        last_name
      ),
      documents:documents!documents_artwork_id_fkey (
        id,
        document_type,
        url,
        artwork_id
      )
    `


let url =
  `${supabaseUrl}/rest/v1/artworks_with_relations?select=${encodeURIComponent(select)}`


    if (view === 'auctions') {
      url += '&auctions=eq.true'
    }

    const res = await fetch(url, {
      headers: { apikey: supabaseKey },
    })

    if (!res.ok) {
      const txt = await res.text()
      console.error('[api/artworks] Supabase error', res.status, txt)
      return NextResponse.json([], { status: 500 })
    }

    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch (err) {
    console.error('[api/artworks] FATAL', err)
    return NextResponse.json([], { status: 500 })
  }
}





/* ======================================
   POST /api/artworks
   ====================================== */
export async function POST(req: NextRequest) {
  const accessToken = req.cookies.get('sb-access-token')?.value
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/artworks`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json(
      { error: text || 'Insert failed' },
      { status: res.status }
    )
  }

  const data = await res.json()
  return NextResponse.json(data[0], { status: 201 })
}
