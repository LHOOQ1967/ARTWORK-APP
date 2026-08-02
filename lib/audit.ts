import { supabaseAdmin } from '@/lib/supabaseAdmin'

type AuditOutcome = 'success' | 'failure'

type AuditEvent = {
  actorId?: string
  action: string
  outcome: AuditOutcome
  subjectType?: string
  subjectId?: string
  errorMessage?: string
  metadata?: Record<string, boolean | number | string | null>
}

export async function logAuditEvent(event: AuditEvent): Promise<void> {
  const { error } = await supabaseAdmin.from('audit_events').insert({
    actor_id: event.actorId ?? null,
    action: event.action,
    outcome: event.outcome,
    subject_type: event.subjectType ?? null,
    subject_id: event.subjectId ?? null,
    error_message: event.errorMessage ?? null,
    metadata: event.metadata ?? {},
  })

  if (error) {
    console.error('[AUDIT_LOG_WRITE_FAILED]', error.message)
  }
}
