import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

const recipients = ['sandrine@blondeau.ch', 'anouk@blondeau.ch']

type AcquisitionWebhookPayload = {
  type?: string
  schema?: string
  table?: string
  record?: { id?: string }
}

type ArtworkDetails = {
  id: string
  title: string | null
  artist: {
    first_name: string | null
    last_name: string | null
  }[] | null
}

function secretsMatch(received: string | null, expected: string) {
  if (!received) return false

  const receivedBuffer = Buffer.from(received)
  const expectedBuffer = Buffer.from(expected)

  return receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.SUPABASE_ACQUISITION_WEBHOOK_SECRET
  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'Acquisition email webhook is not configured' },
      { status: 503 }
    )
  }

  if (!secretsMatch(request.headers.get('x-artmuse-webhook-secret'), webhookSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: AcquisitionWebhookPayload
  try {
    payload = (await request.json()) as AcquisitionWebhookPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  const eventId = payload.record?.id
  if (
    payload.type !== 'INSERT' ||
    payload.schema !== 'public' ||
    payload.table !== 'artwork_acquisition_events' ||
    !eventId
  ) {
    return NextResponse.json({ error: 'Unexpected webhook payload' }, { status: 400 })
  }

  const resendApiKey = process.env.RESEND_API_KEY
  const fromAddress = process.env.ARTMUSE_EMAIL_FROM
  if (!resendApiKey || !fromAddress) {
    return NextResponse.json(
      { error: 'Email provider is not configured' },
      { status: 503 }
    )
  }

  const { data: event, error: eventError } = await supabaseAdmin
    .from('artwork_acquisition_events')
    .select('id, artwork_id, created_at, email_sent_at')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError) {
    console.error('Acquisition email event lookup failed:', eventError.message)
    return NextResponse.json({ error: 'Unable to load acquisition event' }, { status: 500 })
  }
  if (!event) {
    return NextResponse.json({ error: 'Acquisition event not found' }, { status: 404 })
  }
  if (event.email_sent_at) {
    return NextResponse.json({ sent: true, alreadySent: true })
  }

  const { data: artworkData, error: artworkError } = await supabaseAdmin
    .from('artworks')
    .select('id, title, artist:artists(first_name, last_name)')
    .eq('id', event.artwork_id)
    .maybeSingle()

  if (artworkError || !artworkData) {
    console.error('Acquisition email artwork lookup failed:', artworkError?.message ?? 'Artwork not found')
    return NextResponse.json({ error: 'Unable to load artwork details' }, { status: 500 })
  }

  const artwork = artworkData as ArtworkDetails
  const artist = artwork.artist?.[0]
  const artistName = [artist?.first_name, artist?.last_name]
    .filter(Boolean)
    .join(' ') || 'Unknown artist'
  const artworkTitle = artwork.title?.trim() || 'Untitled artwork'
  const appOrigin = process.env.ARTMUSE_APP_URL?.replace(/\/+$/, '') || new URL(request.url).origin
  const artworkUrl = new URL(`/artworks/print/${event.artwork_id}`, appOrigin).toString()
  const safeArtistName = escapeHtml(artistName)
  const safeArtworkTitle = escapeHtml(artworkTitle)
  const safeArtworkUrl = escapeHtml(artworkUrl)
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
      html: `<h1>New acquisition</h1><p><strong>Artist:</strong> ${safeArtistName}</p><p><strong>Artwork:</strong> ${safeArtworkTitle}</p><p><strong>Date:</strong> ${escapeHtml(acquiredAt)}</p><p><a href="${safeArtworkUrl}">Open artwork</a></p>`,
      text: `New acquisition\nArtist: ${artistName}\nArtwork: ${artworkTitle}\nDate: ${acquiredAt}\nOpen artwork: ${artworkUrl}`,
    }),
  })

  if (!emailResponse.ok) {
    console.error('Resend rejected acquisition email:', { status: emailResponse.status })
    return NextResponse.json({ error: 'Email provider rejected the message' }, { status: 502 })
  }

  const { error: markSentError } = await supabaseAdmin
    .from('artwork_acquisition_events')
    .update({ email_sent_at: new Date().toISOString() })
    .eq('id', event.id)
    .is('email_sent_at', null)

  if (markSentError) {
    console.error('Unable to mark acquisition email as sent:', markSentError.message)
    return NextResponse.json({ error: 'Email sent but delivery status was not saved' }, { status: 500 })
  }

  return NextResponse.json({ sent: true })
}