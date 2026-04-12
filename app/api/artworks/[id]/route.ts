
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const accessToken = req.cookies.get('sb-access-token')?.value

  if (!accessToken) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    )
  }

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/artworks
      ?id=eq.${params.id}
      &select=*,artists(id,last_name),contacts(id,company_name)`.replace(/\s+/g, ''),
    {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  const text = await response.text()

  if (!response.ok) {
    console.error('SUPABASE ARTWORK ERROR:', response.status, text)
    return NextResponse.json({ error: text }, { status: response.status })
  }

  const data = JSON.parse(text)

  if (data.length === 0) {
    return NextResponse.json(
      { error: 'Artwork not found' },
      { status: 404 }
    )
  }

  return NextResponse.json(data[0])
}
