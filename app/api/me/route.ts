
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  const accessToken = (await cookies()).get('sb-access-token')
  return NextResponse.json({ loggedIn: !!accessToken })
}
