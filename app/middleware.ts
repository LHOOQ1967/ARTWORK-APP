
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

type UserRole = 'Viewer' | 'Editor' | 'Administrator'

function isUserRole(value: unknown): value is UserRole {
  return value === 'Viewer' || value === 'Editor' || value === 'Administrator'
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  /* ---------------------------------------------------
     ✅ 0️⃣ BYPASS DEV (LOCAL UNIQUEMENT)
     --------------------------------------------------- */
  if (process.env.NODE_ENV === 'development') {
    return NextResponse.next()
  }

  const res = NextResponse.next()

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
    data: { user },
  } = await supabase.auth.getUser()

  /* ---------------------------------------------------
     1️⃣ Routes PUBLIQUES
     --------------------------------------------------- */
  if (pathname === '/login' || pathname.startsWith('/auth')) {
    return res
  }

  /* ---------------------------------------------------
     ✅ PRINT sécurisé
     --------------------------------------------------- */
  if (pathname.startsWith('/print')) {
    const key = req.nextUrl.searchParams.get('key')
    if (key && key === process.env.PRINT_SECRET) {
      return res
    }
  }

  /* ---------------------------------------------------
     2️⃣ Non logué → LOGIN
     --------------------------------------------------- */
  if (!user) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  /* ---------------------------------------------------
     3️⃣ Rôle utilisateur
     --------------------------------------------------- */
  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = isUserRole(profileData?.role) ? profileData.role : undefined

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

  return res
}

export const config = {
  matcher: [
    '/((?!api|_next|favicon.ico|assets).*)',
  ],
}
