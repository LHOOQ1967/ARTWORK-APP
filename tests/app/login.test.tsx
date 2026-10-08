import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import LoginButton from '@/app/login/LoginButton'

const { signInWithOAuth, setErrorMessage } = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  setErrorMessage: vi.fn(),
}))

vi.mock('@/lib/supabaseBrowser', () => ({
  supabase: { auth: { signInWithOAuth } },
}))

vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: () => [null, setErrorMessage],
}))

describe('login providers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('window', { location: { origin: 'https://artwork.example' } })
    signInWithOAuth.mockResolvedValue({ error: null })
  })

  it('renders Microsoft and Google sign-in buttons', () => {
    const html = renderToStaticMarkup(<LoginButton />)
    expect(html).toContain('Sign in with Microsoft')
    expect(html).toContain('Sign in with Google')
  })

  it.each([
    [0, 'azure'],
    [1, 'google'],
  ])('uses the application callback for button %s (%s)', async (index, provider) => {
    const component = LoginButton()
    await component.props.children[index].props.onClick()

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider,
      options: { redirectTo: 'https://artwork.example/auth/callback' },
    })
    expect(setErrorMessage).toHaveBeenCalledWith(null)
  })

  it('reports an OAuth error', async () => {
    signInWithOAuth.mockResolvedValue({ error: { message: 'Provider disabled' } })
    await LoginButton().props.children[1].props.onClick()
    expect(setErrorMessage).toHaveBeenLastCalledWith('Provider disabled')
  })

  it('reports a rejected OAuth request', async () => {
    signInWithOAuth.mockRejectedValue(new Error('Network unavailable'))
    await LoginButton().props.children[1].props.onClick()
    expect(setErrorMessage).toHaveBeenLastCalledWith('Network unavailable')
  })
})
