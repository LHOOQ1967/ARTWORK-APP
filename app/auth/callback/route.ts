
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const cookieStore = await cookies()

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name) => cookieStore.get(name)?.value,
          // ✅ OBLIGATOIRE : autoriser l’écriture
          set: (name, value, options) => {
            cookieStore.set({ name, value, ...options })
          },
          remove: (name, options) => {
            cookieStore.set({ name, value: '', ...options, maxAge: 0 })
          },
        },
      }
    )

    // ✅ ÉCHANGE LE CODE CONTRE UNE SESSION RÉELLE
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(`${origin}/`)
}
