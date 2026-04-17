
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ✅ IMPORTANT : unwrap params
  const { id: documentId } = await params

  const accessToken = req.cookies.get('sb-access-token')?.value

  if (!accessToken) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
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
    return NextResponse.json(
      { error: await res.text() },
      { status: res.status }
    )
  }

  return NextResponse.json({ success: true })
}