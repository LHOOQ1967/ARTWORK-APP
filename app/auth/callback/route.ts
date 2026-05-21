
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')

  // (optionnel mais utile) support d’un paramètre next=/quelquechose
  const next = url.searchParams.get('next') ?? '/'

  const cookieStore = await cookies()

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name) => cookieStore.get(name)?.value,
          set: (name, value, options) => {
            cookieStore.set({ name, value, ...options })
          },
          remove: (name, options) => {
            cookieStore.set({ name, value: '', ...options, maxAge: 0 })
          },
        },
      }
    )

    // ✅ échange le code contre une session
    await supabase.auth.exchangeCodeForSession(code)
  }

  // ✅ IMPORTANT : reconstruire l’origin PUBLIC derrière reverse proxy
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  const host =
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    url.host

  const publicOrigin = `${proto}://${host}`

  // ✅ redirection finale vers le domaine public
  return NextResponse.redirect(new URL(next, publicOrigin))
}
