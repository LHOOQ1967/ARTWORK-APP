import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export type UserRole = 'Viewer' | 'Editor' | 'Administrator'

type AuthorizedRequest = {
  response: null
  role: UserRole
  userId: string
  supabase: Awaited<ReturnType<typeof supabaseServer>>
}

type RejectedRequest = {
  response: NextResponse
}

type AuthorizationResult = AuthorizedRequest | RejectedRequest

function isUserRole(value: unknown): value is UserRole {
  return value === 'Viewer' || value === 'Editor' || value === 'Administrator'
}

export async function requireUser(): Promise<AuthorizationResult> {
  const supabase = await supabaseServer()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return {
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !isUserRole(profile?.role)) {
    return {
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return {
    response: null,
    role: profile.role,
    userId: user.id,
    supabase,
  }
}

export async function requireRole(
  allowedRoles: readonly UserRole[]
): Promise<AuthorizationResult> {
  const authorization = await requireUser()

  if (authorization.response) {
    return authorization
  }

  if (!allowedRoles.includes(authorization.role)) {
    return {
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return authorization
}
