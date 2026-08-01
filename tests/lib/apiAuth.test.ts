import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  profileMaybeSingle: vi.fn(),
  supabaseServer: vi.fn(),
}))

vi.mock('@/lib/supabaseServer', () => ({
  supabaseServer: mocks.supabaseServer,
}))

import { requireRole, requireUser } from '@/lib/apiAuth'

function configureSession(
  user: { id: string } | null,
  profile: { role: string } | null,
  userError: Error | null = null,
  profileError: Error | null = null
) {
  mocks.authGetUser.mockResolvedValue({
    data: { user },
    error: userError,
  })
  mocks.profileMaybeSingle.mockResolvedValue({
    data: profile,
    error: profileError,
  })
  mocks.supabaseServer.mockResolvedValue({
    auth: {
      getUser: mocks.authGetUser,
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: mocks.profileMaybeSingle,
        })),
      })),
    })),
  })
}

describe('API authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects an unauthenticated request', async () => {
    configureSession(null, null)

    const result = await requireUser()

    expect(result.response?.status).toBe(401)
  })

  it('rejects a user without a valid application role', async () => {
    configureSession({ id: 'user-1' }, { role: 'Unknown' })

    const result = await requireUser()

    expect(result.response?.status).toBe(403)
  })

  it('rejects a Viewer from an editor-only action', async () => {
    configureSession({ id: 'viewer-1' }, { role: 'Viewer' })

    const result = await requireRole(['Editor', 'Administrator'])

    expect(result.response?.status).toBe(403)
  })

  it('allows an Editor to perform an editor action', async () => {
    configureSession({ id: 'editor-1' }, { role: 'Editor' })

    const result = await requireRole(['Editor', 'Administrator'])

    expect(result.response).toBeNull()
    if (!result.response) {
      expect(result.userId).toBe('editor-1')
      expect(result.role).toBe('Editor')
    }
  })

  it('allows only an Administrator to perform an administrator action', async () => {
    configureSession({ id: 'admin-1' }, { role: 'Administrator' })

    const result = await requireRole(['Administrator'])

    expect(result.response).toBeNull()
    if (!result.response) {
      expect(result.role).toBe('Administrator')
    }
  })
})
