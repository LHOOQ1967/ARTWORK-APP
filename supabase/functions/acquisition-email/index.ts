const recipients = ['sandrine@blondeau.ch', 'anouk@blondeau.ch']

type Artist = { first_name: string | null; last_name: string | null }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function secretsMatch(received: string | null, expected: string) {
  if (!received || received.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= received.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

Deno.serve(async (request) => {
  const webhookSecret = Deno.env.get('SUPABASE_ACQUISITION_WEBHOOK_SECRET')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromAddress = Deno.env.get('ARTMUSE_EMAIL_FROM')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const appOrigin = (Deno.env.get('ARTMUSE_APP_URL') ?? 'https://artmuse.ch').replace(/\/+$/, '')

  if (!webhookSecret || !resendApiKey || !fromAddress || !supabaseUrl || !serviceKey) {
    return json({ error: 'Function is not configured' }, 503)
  }
  if (!secretsMatch(request.headers.get('x-artmuse-webhook-secret'), webhookSecret)) {
    return json({ error: 'Unauthorized' }, 401)
  }

  let eventId: string | undefined
  try {
    const payload = await request.json()
    if (
      payload.type !== 'INSERT' ||
      payload.schema !== 'public' ||
      payload.table !== 'artwork_acquisition_events'
    ) {
      return json({ error: 'Unexpected webhook payload' }, 400)
    }
    eventId = payload.record?.id
  } catch {
    return json({ error: 'Invalid JSON payload' }, 400)
  }
  if (!eventId) return json({ error: 'Unexpected webhook payload' }, 400)

  const restHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }
  const rest = (path: string, init?: RequestInit) =>
    fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: { ...restHeaders, ...init?.headers },
    })

  const eventResponse = await rest(
    `artwork_acquisition_events?id=eq.${encodeURIComponent(eventId)}&select=id,artwork_id,created_at,email_sent_at`
  )
  if (!eventResponse.ok) return json({ error: 'Unable to load acquisition event' }, 500)
  const [event] = await eventResponse.json()
  if (!event) return json({ error: 'Acquisition event not found' }, 404)
  if (event.email_sent_at) return json({ sent: true, alreadySent: true })

  const artworkResponse = await rest(
    `artworks?id=eq.${encodeURIComponent(event.artwork_id)}&select=id,title,artist:artists(first_name,last_name)`
  )
  if (!artworkResponse.ok) return json({ error: 'Unable to load artwork details' }, 500)
  const [artwork] = await artworkResponse.json()
  if (!artwork) return json({ error: 'Unable to load artwork details' }, 500)

  const artist: Artist | undefined = Array.isArray(artwork.artist)
    ? artwork.artist[0]
    : artwork.artist ?? undefined
  const artistName =
    [artist?.first_name, artist?.last_name].filter(Boolean).join(' ') || 'Unknown artist'
  const artworkTitle = artwork.title?.trim() || 'Untitled artwork'
  const artworkUrl = `${appOrigin}/artworks/print/${event.artwork_id}`
  const acquiredAt = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Zurich',
  }).format(new Date(event.created_at))

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `artwork-acquisition-${event.id}`,
    },
    body: JSON.stringify({
      from: fromAddress,
      to: recipients,
      subject: `New acquisition: ${artistName} — ${artworkTitle}`,
      html: `<h1>New acquisition</h1><p><strong>Artist:</strong> ${escapeHtml(artistName)}</p><p><strong>Artwork:</strong> ${escapeHtml(artworkTitle)}</p><p><strong>Date:</strong> ${escapeHtml(acquiredAt)}</p><p><a href="${escapeHtml(artworkUrl)}">Open artwork</a></p>`,
      text: `New acquisition\nArtist: ${artistName}\nArtwork: ${artworkTitle}\nDate: ${acquiredAt}\nOpen artwork: ${artworkUrl}`,
    }),
  })
  if (!emailResponse.ok) {
    console.error('Resend rejected acquisition email', emailResponse.status)
    return json({ error: 'Email provider rejected the message' }, 502)
  }

  const markResponse = await rest(
    `artwork_acquisition_events?id=eq.${encodeURIComponent(event.id)}&email_sent_at=is.null`,
    {
      method: 'PATCH',
      body: JSON.stringify({ email_sent_at: new Date().toISOString() }),
    }
  )
  if (!markResponse.ok) {
    return json({ error: 'Email sent but delivery status was not saved' }, 500)
  }

  return json({ sent: true })
})
