
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/artworks/[id]/documents
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params   // ✅ OBLIGATOIRE

  const accessToken = req.cookies.get('sb-access-token')?.value
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/documents?artwork_id=eq.${id}&order=created_at.desc`,
    {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: text }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json(data)
}

/**
 * POST /api/artworks/[id]/documents
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params   // ✅ OBLIGATOIRE

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
      Prefer: 'return=representation', // ✅ CLÉ DU FIX
    },
    body: JSON.stringify({
      artwork_id: id,
      document_type: body.type,
      label: body.label ?? null,
      url: body.url,
    }),
  }
)

if (!res.ok) {
  const text = await res.text()
  return NextResponse.json({ error: text }, { status: res.status })
}

const data = await res.json()
return NextResponse.json(data[0], { status: 201 })
}
