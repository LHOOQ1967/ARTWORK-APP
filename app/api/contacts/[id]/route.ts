
import { NextRequest, NextResponse } from 'next/server'

/* ======================
   PATCH contact (UPDATE)
   ====================== */
export async function PATCH(
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

  const body = await req.json()

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/contacts?id=eq.${params.id}`,
    {
      method: 'PATCH',
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    }
  )

  const text = await response.text()

  if (!response.ok) {
    console.error('SUPABASE CONTACT UPDATE ERROR:', response.status, text)
    return NextResponse.json(
      { error: text },
      { status: response.status }
    )
  }

  const data = JSON.parse(text)
  return NextResponse.json(data[0])
}

/* ======================
   DELETE contact
   ====================== */
export async function DELETE(
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
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/contacts?id=eq.${params.id}`,
    {
      method: 'DELETE',
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (!response.ok) {
    return NextResponse.json(
      { error: await response.text() },
      { status: response.status }
    )
  }

  return NextResponse.json({ success: true })
}
