
export async function fetchWithAuth(
  input: RequestInfo,
  init?: RequestInit
) {
  const res = await fetch(input, {
    credentials: 'include',
    ...init,
  })


if (res.status === 401) {
  console.warn('401 ignored during OAuth bootstrap')
}


  return res
}