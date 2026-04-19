
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET() {
  // ✅ OBLIGATOIRE : await cookies()
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )


const { data, error } = await supabase
  .from('artists')
  .select(`
    id,
    first_name,
    last_name,
    year_of_birth,
    year_of_death,
    place_of_birth,
    place_of_death,
    notes
  `)
  .order('last_name')
  .range(0, 5000)


  if (error) {
    console.error('ARTISTS ERROR:', error)
    return NextResponse.json([], { status: 200 })
  }

  return NextResponse.json(data ?? [], { status: 200 })
}


export async function POST(req: NextRequest) {
  const accessToken = (await cookies()).get('sb-access-token')?.value
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/artists`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    return NextResponse.json(
      { error: await res.text() },
      { status: 400 }
    )
  }

  const [artist] = await res.json()
  return NextResponse.json(artist)
}
