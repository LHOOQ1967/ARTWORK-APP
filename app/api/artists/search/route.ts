
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'


export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()

  if (!q) {
    return NextResponse.json([])
  }

  const token = (await cookies()).get('sb-access-token')?.value
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/artists` +
      `?or=(` +
      `last_name.ilike.*${q}*,` +
      `first_name.ilike.*${q}*)` +
      `&order=last_name.asc` +
      `&limit=50`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      },
    }
  )

  if (!res.ok) {
    return NextResponse.json([], { status: 500 })
  }

  const data = await res.json()
  return NextResponse.json(data)
}

