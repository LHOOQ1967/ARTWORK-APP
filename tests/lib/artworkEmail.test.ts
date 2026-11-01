import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleArtworkEmail } from '@/supabase/functions/acquisition-email/handler'

const config = {
  webhookSecret: 'test-webhook-secret',
  resendApiKey: 'test-resend-key',
  fromAddress: 'ArtMuse <notifications@example.com>',
  supabaseUrl: 'https://example.supabase.co',
  serviceKey: 'test-service-key',
  appUrl: 'https://artmuse.ch/',
}
const event = {
  id: 'event-1',
  artwork_id: 'artwork-1',
  created_at: '2026-11-01T12:00:00Z',
  email_sent_at: null,
  buyer_name: 'Buyer <One> & Co',
}
const artwork = {
  id: 'artwork-1',
  title: 'A <title>',
  artist: { first_name: 'First', last_name: 'Last' },
}
const fetchMock = vi.fn<typeof fetch>()

function request(table = 'artwork_buyer_events', secret = config.webhookSecret) {
  return new Request('https://example.supabase.co/functions/v1/acquisition-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-artmuse-webhook-secret': secret },
    body: JSON.stringify({
      type: 'INSERT', schema: 'public', table,
      record: { id: event.id, buyer_name: 'Untrusted webhook label' },
    }),
  })
}

function deliveryResponses() {
  fetchMock
    .mockResolvedValueOnce(Response.json([event]))
    .mockResolvedValueOnce(Response.json([artwork]))
    .mockResolvedValueOnce(Response.json({ id: 'email-1' }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
}

function sentEmail() {
  const init = fetchMock.mock.calls[2][1]!
  return { init, body: JSON.parse(String(init.body)) }
}

describe('artwork email notifications', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('sends buyer details from the saved event to Sandrine alone', async () => {
    deliveryResponses()
    const response = await handleArtworkEmail(request(), config)
    expect(await response.json()).toEqual({ sent: true })
    expect(fetchMock.mock.calls[0][0]).toContain('artwork_buyer_events?id=eq.event-1')
    const { init, body } = sentEmail()
    expect(body.to).toEqual(['sandrine@blondeau.ch'])
    expect(body.subject).toBe('Buyer assigned: First Last — A <title>')
    expect(body.text).toContain('Buyer: Buyer <One> & Co')
    expect(body.html).toContain('Buyer &lt;One&gt; &amp; Co')
    expect(body.html).toContain('A &lt;title&gt;')
    expect(body.text).not.toContain('Untrusted webhook label')
    expect(body.text).toContain('Open artwork: https://artmuse.ch/artworks/print/artwork-1')
    expect(body.text).toContain('Date: 1 Nov 2026, 13:00')
    expect(init.headers).toMatchObject({ 'Idempotency-Key': 'artwork-buyer-event-1' })
    expect(fetchMock.mock.calls[3][0]).toContain('artwork_buyer_events?id=eq.event-1&email_sent_at=is.null')
    expect(fetchMock.mock.calls[3][1]?.method).toBe('PATCH')
    expect(JSON.parse(String(fetchMock.mock.calls[3][1]?.body))).toEqual({
      email_sent_at: expect.any(String),
    })
  })

  it('preserves acquisition recipients, content, event table and idempotency key', async () => {
    deliveryResponses()
    await handleArtworkEmail(request('artwork_acquisition_events'), config)
    const { init, body } = sentEmail()
    expect(body.to).toEqual(['sandrine@blondeau.ch', 'anouk@blondeau.ch'])
    expect(body.subject).toBe('New acquisition: First Last — A <title>')
    expect(body.text).toBe('New acquisition\nArtist: First Last\nArtwork: A <title>\nDate: 1 Nov 2026, 13:00\nOpen artwork: https://artmuse.ch/artworks/print/artwork-1')
    expect(body.html).not.toContain('Buyer:')
    expect(init.headers).toMatchObject({ 'Idempotency-Key': 'artwork-acquisition-event-1' })
    expect(fetchMock.mock.calls[3][0]).toContain('artwork_acquisition_events?')
  })

  it('handles array-shaped artists and absent titles', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json([event]))
      .mockResolvedValueOnce(Response.json([{ ...artwork, title: null, artist: [] }]))
      .mockResolvedValueOnce(Response.json({ id: 'email-1' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    await handleArtworkEmail(request(), config)
    expect(sentEmail().body.subject).toBe('Buyer assigned: Unknown artist — Untitled artwork')
  })

  it.each(['artwork_buyer_events', 'artwork_acquisition_events'])('does not resend a delivered %s event', async table => {
    fetchMock.mockResolvedValueOnce(Response.json([{ ...event, email_sent_at: '2026-11-01T13:00:01Z' }]))
    const response = await handleArtworkEmail(request(table), config)
    expect(await response.json()).toEqual({ sent: true, alreadySent: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uses the same provider idempotency key if saving the delivery status fails', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json([event]))
      .mockResolvedValueOnce(Response.json([artwork]))
      .mockResolvedValueOnce(Response.json({ id: 'email-1' }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
    expect((await handleArtworkEmail(request(), config)).status).toBe(500)
    deliveryResponses()
    expect((await handleArtworkEmail(request(), config)).status).toBe(200)
    expect(fetchMock.mock.calls[2][1]?.headers).toMatchObject({
      'Idempotency-Key': 'artwork-buyer-event-1',
    })
    expect(fetchMock.mock.calls[6][1]?.headers).toMatchObject({
      'Idempotency-Key': 'artwork-buyer-event-1',
    })
  })

  it('rejects invalid authentication and missing configuration before fetching data', async () => {
    expect((await handleArtworkEmail(request(undefined, 'wrong-secret'), config)).status).toBe(401)
    expect((await handleArtworkEmail(request(), { ...config, resendApiKey: undefined })).status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    null,
    { type: 'UPDATE', schema: 'public', table: 'artwork_buyer_events', record: { id: event.id } },
    { type: 'INSERT', schema: 'private', table: 'artwork_buyer_events', record: { id: event.id } },
    { type: 'INSERT', schema: 'public', table: 'contacts', record: { id: event.id } },
    { type: 'INSERT', schema: 'public', table: 'artwork_buyer_events', record: { id: 42 } },
    { type: 'INSERT', schema: 'public', table: 'artwork_buyer_events', record: {} },
  ])('rejects an unexpected webhook payload %j', async payload => {
    const incoming = request()
    const invalid = new Request(incoming, { body: JSON.stringify(payload) })
    expect((await handleArtworkEmail(invalid, config)).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects invalid JSON explicitly', async () => {
    expect((await handleArtworkEmail(new Request(request(), { body: '{' }), config)).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    { response: new Response(null, { status: 500 }), expectedStatus: 500 },
    { response: Response.json([]), expectedStatus: 404 },
    { response: Response.json([{ ...event, buyer_name: null }]), expectedStatus: 500 },
  ])('surfaces event loading errors without sending email ($expectedStatus)', async ({ response, expectedStatus }) => {
    fetchMock.mockResolvedValueOnce(response)
    expect((await handleArtworkEmail(request(), config)).status).toBe(expectedStatus)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([500, 200])('surfaces missing or inaccessible artwork details (HTTP %s)', async status => {
    fetchMock
      .mockResolvedValueOnce(Response.json([event]))
      .mockResolvedValueOnce(Response.json([], { status }))
    expect((await handleArtworkEmail(request(), config)).status).toBe(500)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('logs provider rejection and leaves the event pending', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock
      .mockResolvedValueOnce(Response.json([event]))
      .mockResolvedValueOnce(Response.json([artwork]))
      .mockResolvedValueOnce(Response.json({ error: 'rejected' }, { status: 429 }))
    expect((await handleArtworkEmail(request(), config)).status).toBe(502)
    expect(log).toHaveBeenCalledWith('Resend rejected buyer email', 429)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
