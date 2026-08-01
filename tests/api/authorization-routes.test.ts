import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  supabaseAdmin: {
    auth: {
      admin: {
        inviteUserByEmail: vi.fn(),
      },
    },
    from: vi.fn(),
    storage: {
      from: vi.fn(),
    },
  },
}))

vi.mock('@/lib/apiAuth', () => ({
  requireRole: mocks.requireRole,
  requireUser: vi.fn(),
}))

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: mocks.supabaseAdmin,
}))

import { POST as createUser } from '@/app/api/admin/users/create/route'
import { POST as createImport } from '@/app/api/artwork-imports/route'
import { POST as createDocument } from '@/app/api/artworks/[id]/documents/route'
import { PATCH as updateArtwork } from '@/app/api/artworks/[id]/route'

function forbiddenAuthorization() {
  return {
    response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
  }
}

describe('protected API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireRole.mockResolvedValue(forbiddenAuthorization())
  })

  it('rejects a Viewer from inviting a user', async () => {
    const response = await createUser(
      new Request('http://localhost/api/admin/users/create', {
        method: 'POST',
        body: JSON.stringify({ email: 'person@example.com', role: 'Viewer' }),
      })
    )

    expect(response.status).toBe(403)
    expect(mocks.supabaseAdmin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('rejects a Viewer from updating an artwork', async () => {
    const response = await updateArtwork(
      new NextRequest('http://localhost/api/artworks/artwork-1', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Blocked update' }),
      }),
      { params: Promise.resolve({ id: 'artwork-1' }) }
    )

    expect(response.status).toBe(403)
  })

  it('rejects a Viewer from adding an artwork document', async () => {
    const response = await createDocument(
      new Request('http://localhost/api/artworks/artwork-1/documents', {
        method: 'POST',
        body: JSON.stringify({
          document_type: 'link',
          url: 'https://example.com/document',
        }),
      }),
      { params: Promise.resolve({ id: 'artwork-1' }) }
    )

    expect(response.status).toBe(403)
  })

  it('rejects a Viewer from importing an artwork label', async () => {
    const formData = new FormData()
    formData.set('file', new File(['image'], 'label.jpg', { type: 'image/jpeg' }))

    const response = await createImport(
      new NextRequest('http://localhost/api/artwork-imports', {
        method: 'POST',
        body: formData,
      })
    )

    expect(response.status).toBe(403)
    expect(mocks.supabaseAdmin.from).not.toHaveBeenCalled()
  })
})
