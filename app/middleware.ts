
import { NextResponse, type NextRequest } from 'next/server'
import { createMiddlewareClient } from '@supabase/ssr'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  const supabase = createMiddlewareClient({
    req,
    res,
    cookieOptions: {
      secure: false, // ✅ indispensable en HTTP localhost
    },
  })

  // ✅ CET APPEL DOIT S’EXÉCUTER SUR LE CALLBACK OAUTH
  await supabase.auth.getSession()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = req.nextUrl

  if (pathname.startsWith('/login')) {
    return res
  }

  if (!user) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  return res
}

export const config = {
  matcher: [
    '/api/:path*',
    '/auth/:path*',      // ✅ CRUCIAL
    '/login',
    '/',
    '/artworks/:path*',
    '/referentials/:path*',
  ],
}
