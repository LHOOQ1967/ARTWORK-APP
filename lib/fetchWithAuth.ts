
import { supabase } from '@/lib/supabaseBrowser'

export async function fetchWithAuth(
  input: RequestInfo,
  init?: RequestInit
) {
  const { data } = await supabase.auth.getSession()
  const headers = new Headers(init?.headers)

  if (data.session?.access_token) {
    headers.set('Authorization', `Bearer ${data.session.access_token}`)
  }

  const res = await fetch(input, {
    credentials: 'include',
    ...init,
    headers,
  })

  return res
}