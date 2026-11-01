const acquisitionRecipients = ['sandrine@blondeau.ch', 'anouk@blondeau.ch']
const buyerRecipients = ['sandrine@blondeau.ch']

type Artist = { first_name: string | null; last_name: string | null }
type Artwork = { title: string | null; artist: Artist | Artist[] | null }
type EmailEvent = {
  id: string
  artwork_id: string
  created_at: string
  email_sent_at: string | null
  buyer_name?: string
}

type EmailConfig = {
  webhookSecret?: string
  resendApiKey?: string
  fromAddress?: string
  supabaseUrl?: string
  serviceKey?: string
  appUrl?: string
}

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

export async function handleArtworkEmail(request: Request, config: EmailConfig) {
  const { webhookSecret, resendApiKey, fromAddress, supabaseUrl, serviceKey } = config
  const appOrigin = (config.appUrl ?? 'https://artmuse.ch').replace(/\/+$/, '')

  if (!webhookSecret || !resendApiKey || !fromAddress || !supabaseUrl || !serviceKey) {
    return json({ error: 'Function is not configured' }, 503)
  }
  if (!secretsMatch(request.headers.get('x-artmuse-webhook-secret'), webhookSecret)) {
    return json({ error: 'Unauthorized' }, 401)
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'Invalid JSON payload' }, 400)
  }
  if (
    !payload || typeof payload !== 'object' ||
    !('type' in payload) || payload.type !== 'INSERT' ||
    !('schema' in payload) || payload.schema !== 'public' ||
    !('table' in payload) ||
    (payload.table !== 'artwork_acquisition_events' && payload.table !== 'artwork_buyer_events') ||
    !('record' in payload) || !payload.record || typeof payload.record !== 'object' ||
    !('id' in payload.record) || typeof payload.record.id !== 'string' || !payload.record.id
  ) {
    return json({ error: 'Unexpected webhook payload' }, 400)
  }
  const eventTable = payload.table
  const eventId = payload.record.id
  const isBuyerEvent = eventTable === 'artwork_buyer_events'
  const eventLabel = isBuyerEvent ? 'buyer' : 'acquisition'

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
    `${eventTable}?id=eq.${encodeURIComponent(eventId)}&select=id,artwork_id,created_at,email_sent_at${isBuyerEvent ? ',buyer_name' : ''}`
  )
  if (!eventResponse.ok) return json({ error: `Unable to load ${eventLabel} event` }, 500)
  const events: EmailEvent[] = await eventResponse.json()
  const [event] = events
  if (!event) return json({ error: `${isBuyerEvent ? 'Buyer' : 'Acquisition'} event not found` }, 404)
  if (event.email_sent_at) return json({ sent: true, alreadySent: true })
  let buyerName = ''
  if (isBuyerEvent) {
    if (typeof event.buyer_name !== 'string' || !event.buyer_name.trim()) {
      return json({ error: 'Buyer event is missing buyer details' }, 500)
    }
    buyerName = event.buyer_name
  }

  const artworkResponse = await rest(
    `artworks?id=eq.${encodeURIComponent(event.artwork_id)}&select=id,title,artist:artists(first_name,last_name)`
  )
  if (!artworkResponse.ok) return json({ error: 'Unable to load artwork details' }, 500)
  const artworks: Artwork[] = await artworkResponse.json()
  const [artwork] = artworks
  if (!artwork) return json({ error: 'Unable to load artwork details' }, 500)

  const artist: Artist | undefined = Array.isArray(artwork.artist)
    ? artwork.artist[0]
    : artwork.artist ?? undefined
  const artistName =
    [artist?.first_name, artist?.last_name].filter(Boolean).join(' ') || 'Unknown artist'
  const artworkTitle = artwork.title?.trim() || 'Untitled artwork'
  const artworkUrl = `${appOrigin}/artworks/print/${event.artwork_id}`
  const eventAt = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Zurich',
  }).format(new Date(event.created_at))
  const heading = isBuyerEvent ? 'Buyer assigned' : 'New acquisition'
  const buyerHtml = isBuyerEvent ? `<p><strong>Buyer:</strong> ${escapeHtml(buyerName)}</p>` : ''
  const buyerText = isBuyerEvent ? `\nBuyer: ${buyerName}` : ''

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `artwork-${eventLabel}-${event.id}`,
    },
    body: JSON.stringify({
      from: fromAddress,
      to: isBuyerEvent ? buyerRecipients : acquisitionRecipients,
      subject: `${heading}: ${artistName} — ${artworkTitle}`,
      html: `<h1>${heading}</h1><p><strong>Artist:</strong> ${escapeHtml(artistName)}</p><p><strong>Artwork:</strong> ${escapeHtml(artworkTitle)}</p>${buyerHtml}<p><strong>Date:</strong> ${escapeHtml(eventAt)}</p><p><a href="${escapeHtml(artworkUrl)}">Open artwork</a></p>`,
      text: `${heading}\nArtist: ${artistName}\nArtwork: ${artworkTitle}${buyerText}\nDate: ${eventAt}\nOpen artwork: ${artworkUrl}`,
    }),
  })
  if (!emailResponse.ok) {
    console.error(`Resend rejected ${eventLabel} email`, emailResponse.status)
    return json({ error: 'Email provider rejected the message' }, 502)
  }

  const markResponse = await rest(
    `${eventTable}?id=eq.${encodeURIComponent(event.id)}&email_sent_at=is.null`,
    {
      method: 'PATCH',
      body: JSON.stringify({ email_sent_at: new Date().toISOString() }),
    }
  )
  if (!markResponse.ok) {
    return json({ error: 'Email sent but delivery status was not saved' }, 500)
  }

  return json({ sent: true })
}
