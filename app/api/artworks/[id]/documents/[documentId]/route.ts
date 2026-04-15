
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(
  req: NextRequest,
  context: {
    params: Promise<{ id: string; documentId: string }>
  }
) {
  const { documentId } = await context.params

  const accessToken = req.cookies.get('sb-access-token')?.value
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/documents?id=eq.${documentId}`,
    {
      method: 'DELETE',
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

  return NextResponse.json({ success: true })
}

export async function PATCH(
  req: NextRequest,
  context: {
    params: Promise<{ id: string; documentId: string }>
  }
) {
  const { documentId } = await context.params

  const accessToken = req.cookies.get('sb-access-token')?.value
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/documents?id=eq.${documentId}`,
    {
      method: 'PATCH',
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        label: body.label ?? null,
      }),
    }
  )

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: text }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json(data[0])
}
