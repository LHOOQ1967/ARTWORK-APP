import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'

export async function GET(request: NextRequest) {
  const authorization = await requireUser(request)
  if (authorization.response) return authorization.response
  const { data, error } = await authorization.supabase
    .from('contact_users')
    .select('contact:contacts!contact_users_contact_id_fkey(id, company_name, first_name, last_name, is_client)')
    .eq('user_id', authorization.userId)
    .returns<{ contact: {
      id: string; company_name: string | null; first_name: string | null; last_name: string | null; is_client: boolean | null
    } | null }[]>()
  if (error) {
    console.error('LOAD INSURANCE VIEWER CLIENTS FAILED:', error)
    return NextResponse.json({ error: 'Unable to load your insurance clients.' }, { status: 500 })
  }
  const clients = (data ?? []).flatMap(row => row.contact?.is_client ? [{
    id: row.contact.id,
    label: row.contact.company_name?.trim() ||
      [row.contact.first_name, row.contact.last_name].filter(Boolean).join(' ') || 'Unnamed client',
  }] : []).sort((a, b) => a.label.localeCompare(b.label, 'en'))
  return NextResponse.json({ clients })
}
