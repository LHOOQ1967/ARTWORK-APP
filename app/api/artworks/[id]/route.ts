export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireRole, requireUser } from '@/lib/apiAuth'
import { logAuditEvent } from '@/lib/audit'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

/* =========================================================
   GET /api/artworks/[id]
   ========================================================= */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json(
      { error: 'Missing artwork id' },
      { status: 400 }
    )
  }

  const authorization = await requireUser()
  if (authorization.response) {
    return authorization.response
  }

  const { supabase } = authorization

  const { data, error } = await supabase
    .from('artworks')
    .select(`
      *,
      artist:artists (
        id,
        first_name,
        last_name,
        year_of_birth,
        year_of_death
      ),
      proposed_by:contacts!artworks_proposed_by_id_fkey (
        id,
        first_name,
        last_name,
        company_name
      ),
      auction_house:contacts!artworks_auction_contact_id_fkey (
        id,
        first_name,
        last_name,
        company_name
      ),
      buyer:contacts!artworks_buyer_contact_id_fkey (
        id,
        first_name,
        last_name,
        company_name
      ),
      destination:contacts!artworks_destination_contact_id_fkey (
        id,
        first_name,
        last_name,
        company_name
      ),
      location_contact:contacts!artworks_location_contact_fkey (
        id,
        first_name,
        last_name,
        company_name
      ),
      certificate_location_contact:contacts!artworks_certificate_location_contact_id_fkey (
        id,
        first_name,
        last_name,
        company_name
      ),
      artwork_proposals (
        id,
        proposed_at,
        contact:contacts (
          id,
          first_name,
          last_name,
          company_name
        )
      )
    `)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('Supabase GET artwork error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  if (!data) {
    return NextResponse.json(
      { error: 'Artwork not found' },
      { status: 404 }
    )
  }

  return NextResponse.json(data)
}

/* =========================================================
   PATCH /api/artworks/[id]
   ========================================================= */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) {
    return NextResponse.json(
      { error: 'Missing artwork id' },
      { status: 400 }
    )
  }

  const authorization = await requireRole(['Editor', 'Administrator'])
  if (authorization.response) {
    return authorization.response
  }

  const { supabase } = authorization
  const body = await req.json()

  const {
    title,
    medium,
    year_execution,
    signature,
    dimensions,
    height_cm,
    width_cm,
    depth_cm,
    location_contact_id,
    status,
    priority,
    asking_price,
    currency,
    auctions,
    auction_contact_id,
    sale_date,
    sale_time,
    auction_link,
    estimate_low,
    estimate_high,
    auction_currency,
    auction_max_hammer,
    auction_max_premium,
    sold_hammer,
    sold_premium,
    underbidder,
    guarantee,
    buyer_contact_id,
    destination_contact_id,
    acquired,
    date_acquisition,
    cost_amount,
    cost_currency,
    commission_blondeau,
    purchase_cost,
    date_proposition,
    proposed_by_id,
    view_date,
    condition,
    certificate,
    certificate_location_contact_id,
    check_seller,
    notes,
    artist_id,
    insurance_value,
    insurance_currency,
    rapport_heritier,
    rapport_heritier_document_id,
    updated_at,
  } = body

  const { data, error } = await supabase
    .from('artworks')
    .update({
      title,
      medium,
      year_execution,
      signature,
      dimensions,
      height_cm,
      width_cm,
      depth_cm,
      location_contact_id,
      status,
      priority,
      asking_price,
      currency,
      auctions,
      auction_contact_id,
      sale_date,
      sale_time,
      auction_link,
      estimate_low,
      estimate_high,
      auction_currency,
      auction_max_hammer,
      auction_max_premium,
      sold_hammer,
      sold_premium,
      underbidder,
      guarantee,
      buyer_contact_id,
      destination_contact_id,
      acquired,
      date_acquisition,
      cost_amount,
      cost_currency,
      purchase_cost,
      date_proposition,
      proposed_by_id,
      view_date,
      condition,
      certificate,
      certificate_location_contact_id,
      check_seller,
      notes,
      artist_id,
      insurance_value,
      insurance_currency,
      commission_blondeau,
      rapport_heritier,
      rapport_heritier_document_id,
      updated_at,
    })
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) {
    await logAuditEvent({
      actorId: authorization.userId,
      action: 'artwork_update',
      outcome: 'failure',
      subjectType: 'artwork',
      subjectId: id,
      errorMessage: error.message,
    })
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    )
  }

  await logAuditEvent({
    actorId: authorization.userId,
    action: 'artwork_update',
    outcome: 'success',
    subjectType: 'artwork',
    subjectId: id,
  })

  return NextResponse.json(data)
}

/* =========================================================
   DELETE /api/artworks/[id]
   ========================================================= */


export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json(
      { error: 'Missing artwork id' },
      { status: 400 }
    )
  }

  const authorization = await requireRole(['Editor', 'Administrator'])
  if (authorization.response) {
    return authorization.response
  }

  const { data, error } = await supabaseAdmin
    .from('artworks')
    .delete()
    .eq('id', id)
    .select()

  if (error) {
    console.error('DELETE ARTWORK FAILED', error)
    await logAuditEvent({
      actorId: authorization.userId,
      action: 'artwork_delete',
      outcome: 'failure',
      subjectType: 'artwork',
      subjectId: id,
      errorMessage: error.message,
    })
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    )
  }

  if (!data || data.length === 0) {
    await logAuditEvent({
      actorId: authorization.userId,
      action: 'artwork_delete',
      outcome: 'failure',
      subjectType: 'artwork',
      subjectId: id,
      errorMessage: 'Artwork not deleted (blocked by constraints or not found)',
    })
    return NextResponse.json(
      { error: 'Artwork not deleted (blocked by constraints or not found)' },
      { status: 404 }
    )
  }

  await logAuditEvent({
    actorId: authorization.userId,
    action: 'artwork_delete',
    outcome: 'success',
    subjectType: 'artwork',
    subjectId: id,
  })

  return NextResponse.json({ success: true })
}
