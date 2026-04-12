
import { NextResponse, type NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const accessToken = req.cookies.get('sb-access-token')

  const isAuthPage = req.nextUrl.pathname.startsWith('/login')

  // ✅ Pas connecté → redirection login
  if (!accessToken && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // ✅ Connecté → empêcher retour au login
  if (accessToken && isAuthPage) {
    return NextResponse.redirect(new URL('/artworks', req.url))
  }

  return NextResponse.next()
}

// ✅ Pages protégées
export const config = {
  matcher: ['/artworks/:path*'],
}
``
