import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { logAuditEvent } from '@/lib/audit'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const roles = ['Viewer', 'Editor', 'Administrator'] as const
type UserRole = (typeof roles)[number]

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && roles.includes(value as UserRole)
}

export async function POST(req: Request) {
  const authorization = await requireRole(['Administrator'])
  if (authorization.response) {
    return authorization.response
  }

  try {
    const body = await req.json()

    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const requestedRole = body.role ?? 'Viewer'
    const contactId =
      typeof body.contact_id === 'string' ? body.contact_id.trim() : ''

    if (!email || !isUserRole(requestedRole)) {
      return NextResponse.json(
        { error: 'A valid email and role are required' },
        { status: 400 }
      )
    }

    const role = requestedRole

    if (role === 'Viewer' && !contactId) {
      return NextResponse.json(
        { error: 'A contact is required for Viewer users' },
        { status: 400 }
      )
    }

    if (role === 'Viewer') {
      const { data: contact, error: contactError } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('id', contactId)
        .maybeSingle()

      if (contactError) {
        console.error('[USER_INVITATION_CONTACT_LOOKUP_FAILED]', contactError)
        return NextResponse.json(
          { error: 'Unable to validate the selected contact' },
          { status: 500 }
        )
      }

      if (!contact) {
        return NextResponse.json(
          { error: 'The selected contact does not exist' },
          { status: 400 }
        )
      }
    }

    const { data, error } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email)

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

    if (!data.user) {
      await logAuditEvent({
        actorId: authorization.userId,
        action: 'user_invitation',
        outcome: 'failure',
        errorMessage: 'The invitation did not create a user',
        metadata: { role, contact_id: contactId || null },
      })
      return NextResponse.json(
        { error: 'The invitation did not create a user' },
        { status: 500 }
      )
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ role })
      .eq('id', data.user.id)
      .select('id')
      .maybeSingle()

    if (profileError || !profile) {
      const configurationError =
        profileError?.message ?? 'The invited user profile was not created'
      const { error: cleanupError } =
        await supabaseAdmin.auth.admin.deleteUser(data.user.id)
      await logAuditEvent({
        actorId: authorization.userId,
        action: 'user_invitation',
        outcome: 'failure',
        errorMessage: cleanupError
          ? `${configurationError}; cleanup failed: ${cleanupError.message}`
          : configurationError,
        metadata: { role, contact_id: contactId || null },
      })
      return NextResponse.json(
        {
          error: cleanupError
            ? 'The user profile could not be configured or removed'
            : 'The user profile could not be configured',
        },
        { status: 500 }
      )
    }

    if (role === 'Viewer') {
      const { error: accessError } = await supabaseAdmin
        .from('contact_users')
        .insert({
          user_id: data.user.id,
          contact_id: contactId,
          invited: true,
          granted_by: authorization.userId,
        })

      if (accessError) {
          const { error: cleanupError } =
            await supabaseAdmin.auth.admin.deleteUser(data.user.id)
          await logAuditEvent({
            actorId: authorization.userId,
            action: 'user_invitation',
            outcome: 'failure',
            errorMessage: cleanupError
              ? `${accessError.message}; cleanup failed: ${cleanupError.message}`
              : accessError.message,
            metadata: { role, contact_id: contactId },
          })
          return NextResponse.json(
            {
              error: cleanupError
                ? 'The user access could not be configured and the incomplete user could not be removed'
                : 'The user access could not be configured',
            },
            { status: 500 }
          )
      }
    }

    await logAuditEvent({
      actorId: authorization.userId,
      action: 'user_invitation',
      outcome: 'success',
      subjectType: 'user',
      subjectId: data.user.id,
      metadata: { role, contact_id: contactId || null },
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