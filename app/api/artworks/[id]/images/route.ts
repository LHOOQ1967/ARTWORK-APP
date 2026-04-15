
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params  // ✅ obligatoire en Next 16

  const accessToken = req.cookies.get('sb-access-token')?.value
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const filename = `${id}/${Date.now()}-${file.name}`

  // 🔹 Upload vers Supabase Storage
  const uploadRes = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/artwork-images/${filename}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': file.type,
      },
      body: file,
    }
  )

  if (!uploadRes.ok) {
    const text = await uploadRes.text()
    return NextResponse.json(
      { error: 'Upload failed', details: text },
      { status: 400 }
    )
  }

  const publicUrl =
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/artwork-images/${filename}`

  // 🔹 Sauvegarde dans la table documents
  const docRes = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/documents`,
    {
      method: 'POST',
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        artwork_id: id,
        document_type: 'image',
        label: 'Image',
        url: publicUrl,
      }),
    }
  )

  if (!docRes.ok) {
    const text = await docRes.text()
    return NextResponse.json(
      { error: 'Failed to save document', details: text },
      { status: 400 }
    )
  }

  return NextResponse.json({ url: publicUrl }, { status: 201 })
}
