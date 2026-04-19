
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/* ======================
   PATCH contact
   ====================== */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // ✅ OBLIGATOIRE
  const { id } = await context.params

  if (!id) {
    return NextResponse.json(
      { error: 'Invalid contact id' },
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

  const { data, error } = await supabase
    .from('contacts')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('SUPABASE CONTACT UPDATE ERROR:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    )
  }

  return NextResponse.json(data)
}

/* ======================
   DELETE contact
   ====================== */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  if (!id) {
    return NextResponse.json(
      { error: 'Invalid contact id' },
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
    .from('contacts')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('SUPABASE CONTACT DELETE ERROR:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    )
  }

  return NextResponse.json({ success: true })
}
