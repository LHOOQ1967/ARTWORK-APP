
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json()

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({ email, password }),
      }
    )

    const text = await response.text()
    const data = JSON.parse(text)

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error_description || 'Login failed' },
        { status: response.status }
      )
    }

    // ✅ Créer la réponse
    const res = NextResponse.json({ success: true })

    // ✅ Cookies HttpOnly (sécurisés)
    res.cookies.set('sb-access-token', data.access_token, {
      httpOnly: true,
      secure: false, // true en production HTTPS
      sameSite: 'lax',
      path: '/',
    })

    res.cookies.set('sb-refresh-token', data.refresh_token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    })

    return res
  } catch (err) {
    console.error('LOGIN API ERROR:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
