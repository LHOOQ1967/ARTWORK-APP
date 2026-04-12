
import { NextRequest, NextResponse } from 'next/server'

/**
 * ✅ LIRE les artworks
 */
export async function GET(req: NextRequest) {
  const accessToken = req.cookies.get('sb-access-token')?.value

  if (!accessToken) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    )
  }


    const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/artworks?select=id,title,status,artist_id,artists(id,last_name)&order=created_at.desc`,
    {
        headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${accessToken}`,
        },
    }
    )


  const text = await response.text()

  if (!response.ok) {
    return NextResponse.json(
      { error: 'Failed to fetch artworks' },
      { status: response.status }
    )
  }

  return NextResponse.json(JSON.parse(text))
}

/**
 * ✅ CRÉER un artwork
 */
export async function POST(req: NextRequest) {
  const accessToken = req.cookies.get('sb-access-token')?.value

  if (!accessToken) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    )
  }

  const body = await req.json()

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/artworks`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    }
  )

  
if (!response.ok) {
  const text = await response.text()
  console.error('SUPABASE INSERT ERROR:', response.status, text)

  return NextResponse.json(
    { error: text },
    { status: response.status }
  )
}


  return NextResponse.json({ success: true })
}
