
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function getSupabase() {
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

export async function DELETE(
  req: NextRequest,
  context: {
    params: Promise<{ id: string; proposalId: string }>
  }
) {
  const { proposalId } = await context.params
  const supabase = await getSupabase()

  const { error } = await supabase
    .from('artwork_proposals')
    .delete()
    .eq('id', proposalId)

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    )
  }

  return NextResponse.json({ success: true })
}