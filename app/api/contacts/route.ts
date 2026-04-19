
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
  .from('contacts')
  .select(`
    id,
    company_name,
    first_name,
    last_name,
    city,
    telephone,
    email,
    role,
    notes
  `)
  .order('company_name')
  .range(0, 5000)

  if (error) {
    console.error('CONTACTS ERROR:', error)
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
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/contacts`,
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

  const [contact] = await res.json()
  return NextResponse.json(contact)
}
