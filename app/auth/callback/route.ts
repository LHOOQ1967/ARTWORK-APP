
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/'

  // ✅ reconstruire l’origin public derrière reverse proxy
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  const host =
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    url.host

  const publicOrigin = `${proto}://${host}`

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: name => cookieStore.get(name)?.value,
        set: (name, value, options) => {
          cookieStore.set({ name, value, ...options })
        },
        remove: (name, options) => {
          cookieStore.set({ name, value: '', ...options, maxAge: 0 })
        },
      },
    }
  )

  // 1) échange le code OAuth contre une session
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      return NextResponse.redirect(
        new URL('/login?error=oauth_callback_failed', publicOrigin)
      )
    }
  }

  // 2) récupérer l'utilisateur connecté
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.redirect(
      new URL('/login?error=no_user', publicOrigin)
    )
  }

  // 3) vérifier s’il a accès à l’application
  const { data: hasAccess, error: accessError } =
    await supabase.rpc('user_has_any_access')

  if (accessError || !hasAccess) {
    await supabase.auth.signOut()

    return NextResponse.redirect(
      new URL('/not-authorized', publicOrigin)
    )
  }

  // 4) utilisateur autorisé → redirection finale
  return NextResponse.redirect(new URL(next, publicOrigin))
}