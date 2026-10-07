import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  supabaseAdmin: {
    auth: {
      admin: {
        deleteUser: vi.fn(),
        inviteUserByEmail: vi.fn(),
      },
    },
    from: vi.fn(),
    storage: {
      from: vi.fn(),
    },
  },
  logAuditEvent: vi.fn(),
}))

vi.mock('@/lib/apiAuth', () => ({
  requireRole: mocks.requireRole,
  requireUser: vi.fn(),
}))

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: mocks.supabaseAdmin,
}))

vi.mock('@/lib/audit', () => ({
  logAuditEvent: mocks.logAuditEvent,
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

describe('user invitations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireRole.mockResolvedValue({
      response: null,
      role: 'Administrator',
      userId: 'administrator-1',
    })
    mocks.supabaseAdmin.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: { id: 'invited-user-1' } },
      error: null,
    })
    mocks.supabaseAdmin.auth.admin.deleteUser.mockResolvedValue({
      data: null,
      error: null,
    })
  })

  it('assigns a Viewer to the selected contact', async () => {
    const contactMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'contact-1' },
      error: null,
    })
    const contactEq = vi.fn(() => ({ maybeSingle: contactMaybeSingle }))
    const contactSelect = vi.fn(() => ({ eq: contactEq }))

    const profileMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'invited-user-1' },
      error: null,
    })
    const profileSelect = vi.fn(() => ({ maybeSingle: profileMaybeSingle }))
    const profileEq = vi.fn(() => ({ select: profileSelect }))
    const profileUpdate = vi.fn(() => ({ eq: profileEq }))

    const accessInsert = vi.fn().mockResolvedValue({ error: null })

    mocks.supabaseAdmin.from
      .mockReturnValueOnce({ select: contactSelect })
      .mockReturnValueOnce({ update: profileUpdate })
      .mockReturnValueOnce({ insert: accessInsert })

    const response = await createUser(
      new Request('http://localhost/api/admin/users/create', {
        method: 'POST',
        body: JSON.stringify({
          email: 'viewer@example.com',
          role: 'Viewer',
          contact_id: 'contact-1',
        }),
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.supabaseAdmin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      'viewer@example.com'
    )
    expect(profileUpdate).toHaveBeenCalledWith({ role: 'Viewer' })
    expect(accessInsert).toHaveBeenCalledWith({
      user_id: 'invited-user-1',
      contact_id: 'contact-1',
      invited: true,
      granted_by: 'administrator-1',
    })
    expect(mocks.logAuditEvent).toHaveBeenCalledWith({
      actorId: 'administrator-1',
      action: 'user_invitation',
      outcome: 'success',
      subjectType: 'user',
      subjectId: 'invited-user-1',
      metadata: { role: 'Viewer', contact_id: 'contact-1' },
    })
  })

  it('applies an elevated role only through the administrator API', async () => {
    const profileMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'invited-user-1' },
      error: null,
    })
    const profileSelect = vi.fn(() => ({ maybeSingle: profileMaybeSingle }))
    const profileEq = vi.fn(() => ({ select: profileSelect }))
    const profileUpdate = vi.fn(() => ({ eq: profileEq }))

    mocks.supabaseAdmin.from.mockReturnValueOnce({ update: profileUpdate })

    const response = await createUser(
      new Request('http://localhost/api/admin/users/create', {
        method: 'POST',
        body: JSON.stringify({
          email: 'editor@example.com',
          role: 'Editor',
        }),
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.supabaseAdmin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      'editor@example.com'
    )
    expect(profileUpdate).toHaveBeenCalledWith({ role: 'Editor' })
    expect(mocks.supabaseAdmin.from).toHaveBeenCalledTimes(1)
  })

  it('rejects a Viewer without a contact before sending an invitation', async () => {
    const response = await createUser(
      new Request('http://localhost/api/admin/users/create', {
        method: 'POST',
        body: JSON.stringify({
          email: 'viewer@example.com',
          role: 'Viewer',
        }),
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'A contact is required for Viewer users',
    })
    expect(mocks.supabaseAdmin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('removes an incomplete invited user when contact access cannot be created', async () => {
    const contactMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'contact-1' },
      error: null,
    })
    const contactEq = vi.fn(() => ({ maybeSingle: contactMaybeSingle }))
    const contactSelect = vi.fn(() => ({ eq: contactEq }))

    const profileMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'invited-user-1' },
      error: null,
    })
    const profileSelect = vi.fn(() => ({ maybeSingle: profileMaybeSingle }))
    const profileEq = vi.fn(() => ({ select: profileSelect }))
    const profileUpdate = vi.fn(() => ({ eq: profileEq }))

    const accessInsert = vi.fn().mockResolvedValue({
      error: { message: 'Access insert failed' },
    })

    mocks.supabaseAdmin.from
      .mockReturnValueOnce({ select: contactSelect })
      .mockReturnValueOnce({ update: profileUpdate })
      .mockReturnValueOnce({ insert: accessInsert })

    const response = await createUser(
      new Request('http://localhost/api/admin/users/create', {
        method: 'POST',
        body: JSON.stringify({
          email: 'viewer@example.com',
          role: 'Viewer',
          contact_id: 'contact-1',
        }),
      })
    )

    expect(response.status).toBe(500)
    expect(mocks.supabaseAdmin.auth.admin.deleteUser).toHaveBeenCalledWith(
      'invited-user-1'
    )
    expect(mocks.logAuditEvent).toHaveBeenCalledWith({
      actorId: 'administrator-1',
      action: 'user_invitation',
      outcome: 'failure',
      errorMessage: 'Access insert failed',
      metadata: { role: 'Viewer', contact_id: 'contact-1' },
    })
  })
})
