

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseServer } from '@/lib/supabaseServer'


export async function getSupabaseServerClient() {
  const cookieStore = await cookies()

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
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: artworkId } = await context.params
  const body = await req.json()

  const supabase = await getSupabaseServerClient()

  const { data, error } = await supabase
    .from('documents')
    .insert({
      artwork_id: artworkId,
      document_type: body.document_type,
      url: body.url,
      label: body.label ?? null,
      position: body.position ?? 0,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    )
  }

  return NextResponse.json(data)
}



