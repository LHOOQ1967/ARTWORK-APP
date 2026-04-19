
import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ success: true })

  /* ✅ Supprimer les cookies Supabase */
  response.cookies.set('sb-access-token', '', {
    path: '/',
    maxAge: 0,
  })

  response.cookies.set('sb-refresh-token', '', {
    path: '/',
    maxAge: 0,
  })

  return response
}


