
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/documents
 * (optionnel — utile pour debug ou admin)
 */
export async function GET(req: NextRequest) {
  const accessToken = req.cookies.get('sb-access-token')?.value

  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/documents` +
      `?select=*` +
      `&order=position.asc`,
    {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (!res.ok) {
    return NextResponse.json(
      { error: await res.text() },
      { status: res.status }
    )
  }

  return NextResponse.json(await res.json())
}

/**
 * POST /api/documents
 * Création d’un document
 */
export async function POST(req: NextRequest) {
  const accessToken = req.cookies.get('sb-access-token')?.value

  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/documents`,
    {
      method: 'POST',
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    return NextResponse.json(
      { error: await res.text() },
      { status: res.status }
    )
  }

  const created = await res.json()
  return NextResponse.json(created[0])
}
