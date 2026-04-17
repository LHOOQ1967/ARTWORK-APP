
import { NextRequest, NextResponse } from 'next/server'


export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!params.id || params.id === 'undefined') {
    return NextResponse.json(
      { error: 'Invalid artist id' },
      { status: 400 }
    )
  }
 
}



export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const accessToken = req.cookies.get('sb-access-token')?.value
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/artists?id=eq.${params.id}`,
    {
      method: 'DELETE',
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

  return NextResponse.json({ success: true })
}

