import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getAll: vi.fn(),
  set: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: mocks.createServerClient,
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: mocks.getAll, set: mocks.set }),
}))

import { GET } from '@/app/auth/callback/route'

describe('OAuth callback', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.createServerClient.mockReturnValue({
      auth: {
        exchangeCodeForSession: mocks.exchangeCodeForSession,
        getUser: mocks.getUser,
        signOut: mocks.signOut,
      },
      rpc: mocks.rpc,
    })
    mocks.getAll.mockReturnValue([])
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null })
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })
    mocks.rpc.mockResolvedValue({ data: true, error: null })
    mocks.signOut.mockResolvedValue({ error: null })
  })

  it('exchanges the code and redirects an authorized user over local HTTP', async () => {
    const response = await GET(
      new Request('http://localhost:3000/auth/callback?code=test-code')
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/')
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('test-code')
    expect(mocks.rpc).toHaveBeenCalledWith('user_has_any_access')
  })

  it('honors the public HTTPS origin behind a reverse proxy', async () => {
    const response = await GET(
      new Request('http://localhost:3000/auth/callback?code=test-code', {
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'artwork.example',
        },
      })
    )

    expect(response.headers.get('location')).toBe('https://artwork.example/')
  })

  it('reads all cookie chunks and writes refreshed and deleted cookies', async () => {
    await GET(new Request('http://localhost:3000/auth/callback?code=test-code'))
    const { cookies } = mocks.createServerClient.mock.calls[0][2]
    const chunks = [
      { name: 'session.0', value: 'first' },
      { name: 'session.1', value: 'second' },
    ]
    mocks.getAll.mockReturnValue(chunks)
    expect(cookies.getAll()).toEqual(chunks)

    cookies.setAll([
      { name: 'session.0', value: 'new', options: { path: '/', httpOnly: true } },
      { name: 'session.1', value: '', options: { path: '/', maxAge: 0 } },
    ])
    expect(mocks.set).toHaveBeenCalledWith({
      name: 'session.0', value: 'new', path: '/', httpOnly: true,
    })
    expect(mocks.set).toHaveBeenCalledWith({
      name: 'session.1', value: '', path: '/', maxAge: 0,
    })
  })

  it('returns failed code exchanges to login without checking access', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: { message: 'Expired code' } })
    const response = await GET(
      new Request('http://localhost:3000/auth/callback?code=expired')
    )

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?error=oauth_callback_failed'
    )
    expect(mocks.getUser).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('returns a missing session to login instead of a 404', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const response = await GET(new Request('http://localhost:3000/auth/callback'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/login?error=no_user')
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each([
    { data: false, error: null },
    { data: null, error: { message: 'Access check failed' } },
  ])('signs out when access is not granted (%j)', async accessResult => {
    mocks.rpc.mockResolvedValue(accessResult)
    const response = await GET(
      new Request('http://localhost:3000/auth/callback?code=test-code')
    )

    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(response.headers.get('location')).toBe('http://localhost:3000/not-authorized')
  })

  it.each([
    ['/artworks', '/artworks'],
    ['https://external.example', '/'],
    ['//external.example', '/'],
  ])('handles the next path %s', async (next, expected) => {
    const url = new URL('http://localhost:3000/auth/callback?code=test-code')
    url.searchParams.set('next', next)
    const response = await GET(new Request(url))

    expect(response.headers.get('location')).toBe(`http://localhost:3000${expected}`)
  })
})
