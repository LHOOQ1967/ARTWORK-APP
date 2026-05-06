
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

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
  if (
    pathname === '/login' ||
    pathname.startsWith('/auth')
  ) {
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
     3️⃣ Logué → contrôle des rôles
     --------------------------------------------------- */
  const role = session.user.user_metadata?.role

  // 🔒 Accès admin uniquement
  if (pathname.startsWith('/admin') && role !== 'Administrator' && role !== 'Editor') {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // 🔒 Accès viewer uniquement
  if (pathname.startsWith('/viewer') && role !== 'Viewer') {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  /* ---------------------------------------------------
     4️⃣ Tout le reste est autorisé
     --------------------------------------------------- */
  return res
}

export const config = {
  matcher: [
    '/((?!_next|favicon.ico|assets).*)',
  ],
}
