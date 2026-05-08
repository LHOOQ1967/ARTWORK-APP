
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

type UserRole = 'Viewer' | 'Editor' | 'Administrator'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const { pathname } = req.nextUrl

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => req.cookies.get(name)?.value,
        set: (name, value, options) => {
          res.cookies.set({ name, value, ...options })
        },
        remove: (name, options) => {
          res.cookies.set({ name, value: '', ...options, maxAge: 0 })
        },
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  /* ---------------------------------------------------
     1️⃣ Routes PUBLIQUES (toujours autorisées)
     --------------------------------------------------- */
  if (pathname === '/login' || pathname.startsWith('/auth')) {
    return res
  }

  /* ---------------------------------------------------
     2️⃣ Non logué → REDIRECTION LOGIN
     --------------------------------------------------- */
  if (!session) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  /* ---------------------------------------------------
     3️⃣ Logué → contrôle des rôles via profiles
     --------------------------------------------------- */
  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  const profileRole = profileData?.role as UserRole | undefined
  const metadataRole = session.user.user_metadata?.role as UserRole | undefined
  const role = profileRole ?? metadataRole

  const redirectToHome = () => {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  if (pathname.startsWith('/admin') && role !== 'Administrator' && role !== 'Editor') {
    return redirectToHome()
  }

  if (pathname.startsWith('/viewer') && role !== 'Viewer') {
    return redirectToHome()
  }

  /* ---------------------------------------------------
     4️⃣ Si le profil n’existe pas mais la session est valide,
     on laisse quand même l’accès général au site.
     Les contrôles de route spécifiques restent actifs.
     --------------------------------------------------- */
  return res
}

export const config = {
  matcher: [
    '/((?!_next|favicon.ico|assets).*)',
  ],
}
