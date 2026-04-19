
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/* ======================
   PATCH artist
   ====================== */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // ✅ NE JAMAIS accéder directement à params.id
  const { id } = await context.params

  if (!id) {
    return NextResponse.json(
      { error: 'Invalid artist id' },
      { status: 400 }
    )
  }

  const body = await req.json()

  // ✅ cookies() DOIT être await
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

  // ✅ IMPORTANT : ne jamais mettre id dans le payload
  const { id: _ignored, ...payload } = body

  const { data, error } = await supabase
    .from('artists')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('SUPABASE ARTIST UPDATE ERROR:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    )
  }

  return NextResponse.json(data)
}

/* ======================
   DELETE artist
   ====================== */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  if (!id) {
    return NextResponse.json(
      { error: 'Invalid artist id' },
      { status: 400 }
    )
  }

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

  const { error } = await supabase
    .from('artists')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('SUPABASE ARTIST DELETE ERROR:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    )
  }

  return NextResponse.json({ success: true })
}
