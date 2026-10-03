import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}))

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: { from: mocks.from },
}))

import { POST } from '@/app/api/webhooks/acquisition-email/route'

const acquisitionEvent = {
  id: 'event-1',
  artwork_id: 'artwork-1',
  created_at: '2026-10-03T10:00:00.000Z',
  email_sent_at: null as string | null,
}

const eventReadQuery = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}

const eventUpdateQuery = {
  update: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
}

const artworkQuery = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}

let eventTableCalls = 0

function makeRequest(secret?: string) {
  return new NextRequest('https://artmuse.ch/api/webhooks/acquisition-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'x-artmuse-webhook-secret': secret } : {}),
    },
    body: JSON.stringify({
      type: 'INSERT',
      schema: 'public',
      table: 'artwork_acquisition_events',
      record: { id: acquisitionEvent.id },
    }),
  })
}

describe('acquisition email webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('SUPABASE_ACQUISITION_WEBHOOK_SECRET', 'test-webhook-secret')
    vi.stubEnv('RESEND_API_KEY', 'test-resend-key')
    vi.stubEnv('ARTMUSE_EMAIL_FROM', 'ArtMuse <notifications@example.com>')
    vi.stubEnv('ARTMUSE_APP_URL', 'https://artmuse.ch')

    acquisitionEvent.email_sent_at = null
    eventTableCalls = 0

    eventReadQuery.select.mockReturnValue(eventReadQuery)
    eventReadQuery.eq.mockReturnValue(eventReadQuery)
    eventReadQuery.maybeSingle.mockImplementation(async () => ({
      data: acquisitionEvent,
      error: null,
    }))

    eventUpdateQuery.update.mockImplementation((values: { email_sent_at: string }) => {
      acquisitionEvent.email_sent_at = values.email_sent_at
      return eventUpdateQuery
    })
    eventUpdateQuery.eq.mockReturnValue(eventUpdateQuery)
    eventUpdateQuery.is.mockImplementation(async () => ({ error: null }))

    artworkQuery.select.mockReturnValue(artworkQuery)
    artworkQuery.eq.mockReturnValue(artworkQuery)
    artworkQuery.maybeSingle.mockImplementation(async () => ({
      data: {
        id: 'artwork-1',
        title: 'The artwork',
        artist: [{ first_name: 'First', last_name: 'Last' }],
      },
      error: null,
    }))

    mocks.from.mockImplementation((table: string) => {
      if (table === 'artworks') return artworkQuery
      eventTableCalls += 1
      return eventTableCalls % 2 === 1 ? eventReadQuery : eventUpdateQuery
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('sends one email with the artwork details to the configured recipients', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const firstResponse = await POST(makeRequest('test-webhook-secret'))
    const secondResponse = await POST(makeRequest('test-webhook-secret'))
    const emailPayload = JSON.parse(fetchMock.mock.calls[0][1].body as string)

    expect(firstResponse.status).toBe(200)
    expect(secondResponse.status).toBe(200)
    expect(await secondResponse.json()).toEqual({ sent: true, alreadySent: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(emailPayload.to).toEqual(['sandrine@blondeau.ch', 'anouk@blondeau.ch'])
    expect(emailPayload.subject).toBe('New acquisition: First Last — The artwork')
    expect(emailPayload.text).toContain('Open artwork: https://artmuse.ch/artworks/print/artwork-1')
    expect(acquisitionEvent.email_sent_at).toBeTruthy()
  })

  it('rejects webhook requests without the shared secret', async () => {
    const response = await POST(makeRequest())

    expect(response.status).toBe(401)
    expect(mocks.from).not.toHaveBeenCalled()
  })
})