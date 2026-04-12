
import { NextRequest, NextResponse } from 'next/server'

/* ---------- GET /api/artworks ---------- */
export async function GET(req: NextRequest) {
  const accessToken = req.cookies.get('sb-access-token')?.value
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }


const res = await fetch(
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/artworks?select=*,artist:artists!artworks_artist_id_fkey!inner(first_name,last_name,year_of_birth,year_of_death)`,
  {
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${accessToken}`,
    },
  }
)


  const data = await res.json()
  return NextResponse.json(data)
}

/* ---------- POST /api/artworks ---------- */
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
