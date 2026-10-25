import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_DOCUMENT_ACCESS, parseDocumentAccess, saveDocumentVisibility } from '@/lib/documentVisibility'

const clientId = '11111111-1111-4111-8111-111111111111'

describe('document visibility validation', () => {
  it('defaults omitted visibility to All artwork clients', () => {
    expect(parseDocumentAccess({})).toEqual({ access: DEFAULT_DOCUMENT_ACCESS })
  })

  describe('saving document visibility', () => {
    afterEach(() => vi.unstubAllGlobals())

    it.each(['all_clients', 'internal', 'selected_client'] as const)('saves only access fields for %s', async visibility => {
      const access = { visibility, recipient_contact_id: visibility === 'selected_client' ? clientId : null }
      const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: 'doc', ...access }))
      vi.stubGlobal('fetch', fetchMock)
      await saveDocumentVisibility('work', 'doc', access)
      expect(fetchMock).toHaveBeenCalledWith('/api/artworks/work/documents/doc', expect.objectContaining({
        method: 'PATCH', body: JSON.stringify(access),
      }))
    })

    it('rejects a missing client before making requests', async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      await expect(saveDocumentVisibility('work', 'doc', { visibility: 'selected_client', recipient_contact_id: null }))
        .rejects.toThrow('Select a client')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('surfaces server errors', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'Access denied' }, { status: 403 })))
      await expect(saveDocumentVisibility('work', 'doc', DEFAULT_DOCUMENT_ACCESS)).rejects.toThrow('Access denied')
    })

    it('does not confirm a mismatched recipient or document', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
        id: 'other', ...DEFAULT_DOCUMENT_ACCESS,
      })))
      await expect(saveDocumentVisibility('work', 'doc', DEFAULT_DOCUMENT_ACCESS)).rejects.toThrow('not confirmed')
    })
  })

  it.each(['internal', 'all_clients'] as const)('accepts %s without a recipient', visibility => {
    expect(parseDocumentAccess({ visibility })).toEqual({ access: { visibility, recipient_contact_id: null } })
  })

  it('accepts a selected client with a valid ID', () => {
    expect(parseDocumentAccess({ visibility: 'selected_client', recipient_contact_id: clientId }))
      .toEqual({ access: { visibility: 'selected_client', recipient_contact_id: clientId } })
  })

  it.each([null, '', 'all', 1, {}, false])('rejects invalid visibility %j', visibility => {
    expect(parseDocumentAccess({ visibility })).toEqual({ error: 'Invalid document visibility' })
  })

  it.each([null, undefined, '', 'client-a', 12, {}])('requires a valid selected client: %j', recipient_contact_id => {
    expect(parseDocumentAccess({ visibility: 'selected_client', recipient_contact_id }))
      .toEqual({ error: 'Select a client for this document' })
  })

  it.each(['internal', 'all_clients'] as const)('rejects a recipient for %s', visibility => {
    expect(parseDocumentAccess({ visibility, recipient_contact_id: clientId }))
      .toEqual({ error: 'A recipient is only allowed for Selected client visibility' })
  })
})
