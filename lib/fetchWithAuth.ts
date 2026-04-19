
export async function fetchWithAuth(
  input: RequestInfo,
  init?: RequestInit
) {
  const res = await fetch(input, {
    credentials: 'include',
    ...init,
  })

  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Session expired')
  }

  return res
}