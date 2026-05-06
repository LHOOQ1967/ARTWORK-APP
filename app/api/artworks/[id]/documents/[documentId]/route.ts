
import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

type RouteParams = {
  id: string
  documentId: string
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  const { id } = await context.params
  const body = await req.json()
const supabase = await supabaseServer()

  const { data, error } = await supabase
    .from('documents')
    .insert({
      artwork_id: id,
      document_type: body.document_type,
      label: body.label,
      url: body.url,
      position: body.position,
    })
    .select()
    .single()

  if (error) {
    console.error('INSERT DOCUMENT ERROR:', error)
    return NextResponse.json(error, { status: 400 })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  const { documentId } = await context.params

  const supabase = await supabaseServer()

  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId)

  if (error) {
    console.error('DELETE DOCUMENT ERROR:', error)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  const { documentId } = await context.params
  const body = await req.json()
const supabase = await supabaseServer()

  const { data, error } = await supabase
    .from('documents')
    .update({
      label: body.label ?? null,
    })
    .eq('id', documentId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(data)
}
