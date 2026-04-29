
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
    console.error('DOCUMENT INSERT ERROR:', text)
    return NextResponse.json({ error: text }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json(data)
}

/**
 * POST /api/artworks/[id]/documents
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {

  const { id } = await context.params
 

  const body = await req.json()
  

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )


const { data: existingImages } = await supabase
  .from('documents')
  .select('position')
  .eq('artwork_id', id)
  .eq('document_type', body.document_type)


const nextPosition = (existingImages?.length ?? 0) + 1

  const { data, error } = await supabase
    .from('documents')
    .insert({
      artwork_id: id,
      document_type: body.document_type, // ✅ correct
      label: body.label ?? null,
      url: body.url,
      position: nextPosition ?? 0,
    })
    .select()
    .single()

  if (error) {
    console.error('🔥 SUPABASE INSERT ERROR:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    )
  }

 
  return NextResponse.json(data, { status: 201 })
}
