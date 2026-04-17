
import { NextRequest, NextResponse } from 'next/server'

type ReorderPayload = {
  id: string
  position: number
}[]

export async function PATCH(req: NextRequest) {
  const accessToken = req.cookies.get('sb-access-token')?.value

  if (!accessToken) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  let payload: ReorderPayload

  try {
    payload = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON payload' },
      { status: 400 }
    )
  }

  if (!Array.isArray(payload)) {
    return NextResponse.json(
      { error: 'Payload must be an array' },
      { status: 400 }
    )
  }

  const updates = payload.map(({ id, position }) =>
    fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/documents?id=eq.${id}`,
      {
        method: 'PATCH',
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ position }),
      }
    )
  )

  try {
    const results = await Promise.all(updates)

    const failed = results.find(r => !r.ok)
    if (failed) {
      return NextResponse.json(
        { error: 'One or more updates failed' },
        { status: 500 }
      )
    }
  } catch (err) {
    console.error('Reorder error:', err)
    return NextResponse.json(
      { error: 'Reorder failed' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
