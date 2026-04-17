
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function getSupabase() {
  const cookieStore = await cookies() // ✅ await obligatoire

  return createServerClient(
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
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // ✅ params est une Promise
) {
  const { id } = await context.params // ✅ await obligatoire
  const supabase = await getSupabase()
  const body = await req.json()

  const { contact_id, proposed_at } = body

  if (!contact_id) {
    return NextResponse.json(
      { error: 'contact_id is required' },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('artwork_proposals')
    .insert({
      artwork_id: id,
      contact_id,
      proposed_at: proposed_at || null,
    })

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    )
  }

  return NextResponse.json({ success: true })
}