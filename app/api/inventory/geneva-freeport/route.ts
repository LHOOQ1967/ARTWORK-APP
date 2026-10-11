import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'
import {
  FREEPORT_ADDRESS_ID, FREEPORT_CONTACT_ID,
  type FreeportArtwork, type FreeportDocument, type FreeportInventory, type FreeportRow,
} from '@/lib/genevaFreeport'

export async function GET(request: NextRequest) {
  const authorization = await requireUser(request)
  if (authorization.response) return authorization.response
  const { supabase } = authorization
  const rows: FreeportRow[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from('artworks')
      .select(`id, title, year_execution, year_execution_start, medium, height_cm, width_cm, depth_cm, signature, edition,
        artist:artists(first_name, last_name)`)
      .eq('location_contact_id', FREEPORT_CONTACT_ID)
      .eq('location_address_id', FREEPORT_ADDRESS_ID)
      .order('id')
      .range(offset, offset + 499)
      .returns<FreeportArtwork[]>()
    if (error) {
      console.error('LOAD GENEVA FREEPORT INVENTORY FAILED:', error)
      return NextResponse.json({ error: 'Unable to load Geneva Freeport inventory. Check that its migration has been applied.' }, { status: 500 })
    }
    const batch = data ?? []
    const ids = batch.map(row => row.id)
    const [inventory, documents, images] = ids.length ? await Promise.all([
      supabase.from('geneva_freeport_inventory').select('*').in('artwork_id', ids).returns<FreeportInventory[]>(),
      supabase.from('geneva_freeport_customs_documents').select('*').in('artwork_id', ids)
        .order('position').returns<(FreeportDocument & { artwork_id: string })[]>(),
      supabase.from('documents').select('artwork_id, url, position').eq('document_type', 'image')
        .in('artwork_id', ids).order('position', { nullsFirst: false }).order('id')
        .returns<{ artwork_id: string; url: string | null; position: number | null }[]>(),
    ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }]
    const detailsError = inventory.error ?? documents.error ?? images.error
    if (detailsError) {
      console.error('LOAD GENEVA FREEPORT DETAILS FAILED:', detailsError)
      return NextResponse.json({ error: 'Unable to load customs records. Check that the Freeport migration has been applied.' }, { status: 500 })
    }
    const inventoryById = new Map((inventory.data ?? []).map(row => [row.artwork_id, row]))
    const imageById = new Map<string, string>()
    for (const image of images.data ?? []) {
      if (image.url && !imageById.has(image.artwork_id)) imageById.set(image.artwork_id, image.url)
    }
    rows.push(...batch.map(row => ({
      ...row,
      image_url: imageById.get(row.id) ?? null,
      inventory: inventoryById.get(row.id) ?? null,
      documents: (documents.data ?? []).filter(document => document.artwork_id === row.id),
    })))
    if (batch.length < 500) break
  }
  return NextResponse.json({ artworks: rows })
}
