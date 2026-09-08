import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'

const EDITOR_ROLES = ['Editor', 'Administrator'] as const
const STATUSES = new Set(['Open', 'In progress', 'Found', 'Closed'])

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function normalizeBody(body: unknown) {
  if (!body || typeof body !== 'object') return null
  const input = body as Record<string, unknown>
  const requestDate = input.requestDate
  const contactId = input.contactId
  const search = input.search
  const budget = input.budget
  const status = input.status ?? 'Open'
  const notes = input.notes

  if (
    !isIsoDate(requestDate) ||
    typeof contactId !== 'string' ||
    !contactId ||
    typeof search !== 'string' ||
    !search.trim() ||
    (typeof budget !== 'string' && budget !== null && budget !== undefined) ||
    (typeof notes !== 'string' && notes !== null && notes !== undefined) ||
    typeof status !== 'string' ||
    !STATUSES.has(status)
  ) {
    return null
  }

  return {
    request_date: requestDate,
    contact_id: contactId,
    search: search.trim(),
    budget: typeof budget === 'string' ? budget.trim() || null : null,
    status,
    notes: typeof notes === 'string' ? notes.trim() || null : null,
  }
}

const selection = `
  id, request_date, contact_id, search, budget, status, notes, created_at, updated_at,
  contact:contacts!buyer_search_requests_contact_id_fkey(id, company_name, first_name, last_name)
`

export async function GET() {
  const authorization = await requireRole(EDITOR_ROLES)
  if (authorization.response) return authorization.response

  const [requestsResult, contactsResult] = await Promise.all([
    authorization.supabase
      .from('buyer_search_requests')
      .select(selection)
      .order('request_date', { ascending: false })
      .order('created_at', { ascending: false }),
    authorization.supabase
      .from('contacts')
      .select('id, company_name, first_name, last_name')
      .order('company_name', { ascending: true }),
  ])

  if (contactsResult.error) {
    return NextResponse.json({ error: contactsResult.error.message }, { status: 500 })
  }

  return NextResponse.json({
    requests: requestsResult.data ?? [],
    contacts: contactsResult.data ?? [],
    warning: requestsResult.error
      ? 'La table des demandes doit encore être déployée dans Supabase.'
      : null,
  })
}

export async function POST(request: NextRequest) {
  const authorization = await requireRole(EDITOR_ROLES)
  if (authorization.response) return authorization.response

  const payload = normalizeBody(await request.json())
  if (!payload) return NextResponse.json({ error: 'Demande invalide.' }, { status: 400 })

  const { data, error } = await authorization.supabase
    .from('buyer_search_requests')
    .insert({ ...payload, created_by: authorization.userId })
    .select(selection)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ request: data })
}

export async function PATCH(request: NextRequest) {
  const authorization = await requireRole(EDITOR_ROLES)
  if (authorization.response) return authorization.response

  const body = await request.json()
  const id = body?.id
  const payload = normalizeBody(body)
  if (typeof id !== 'string' || !payload) {
    return NextResponse.json({ error: 'Demande invalide.' }, { status: 400 })
  }

  const { data, error } = await authorization.supabase
    .from('buyer_search_requests')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(selection)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ request: data })
}

export async function DELETE(request: NextRequest) {
  const authorization = await requireRole(EDITOR_ROLES)
  if (authorization.response) return authorization.response

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Identifiant manquant.' }, { status: 400 })

  const { error } = await authorization.supabase
    .from('buyer_search_requests')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}