import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { logAuditEvent } from '@/lib/audit'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: Request) {
  const authorization = await requireRole(['Administrator'])
  if (authorization.response) {
    return authorization.response
  }

  try {
    const body = await req.json()

    const email = body.email?.trim()
    const role = body.role ?? 'Viewer'

    if (
      !email ||
      !['Viewer', 'Editor', 'Administrator'].includes(role)
    ) {
      return NextResponse.json(
        { error: 'A valid email and role are required' },
        { status: 400 }
      )
    }

    const { data, error } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(
        email,
        {
          data: {
            role,
          },
        }
      )

    if (error) {
      await logAuditEvent({
        actorId: authorization.userId,
        action: 'user_invitation',
        outcome: 'failure',
        errorMessage: error.message,
        metadata: { role },
      })
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    await logAuditEvent({
      actorId: authorization.userId,
      action: 'user_invitation',
      outcome: 'success',
      subjectType: 'user',
      subjectId: data.user.id,
      metadata: { role },
    })

    return NextResponse.json({
      success: true,
      user: data.user,
    })
  } catch (error) {
    console.error(error)
    await logAuditEvent({
      actorId: authorization.userId,
      action: 'user_invitation',
      outcome: 'failure',
      errorMessage: error instanceof Error ? error.message : 'Unexpected error',
    })

    return NextResponse.json(
      { error: 'Unexpected error' },
      { status: 500 }
    )
  }
}