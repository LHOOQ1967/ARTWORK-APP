
// app/api/artists/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const accessToken = req.cookies.get('sb-access-token')?.value

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/artists?select=id,last_name&order=last_name`,
    {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  const text = await response.text()

  if (!response.ok) {
    console.error('SUPABASE ARTISTS ERROR:', response.status, text)
    return NextResponse.json({ error: text }, { status: response.status })
  }

  return NextResponse.json(JSON.parse(text))
}
