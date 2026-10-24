import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'
import type { CertificateLocationRow } from '@/lib/certificateLocations'

export async function GET(request: NextRequest) {
  const authorization = await requireUser(request)
  if (authorization.response) return authorization.response
  const { supabase } = authorization
  const rows: CertificateLocationRow[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('artworks')
      .select(`id, title, year_execution, year_execution_start, certificate,
        certificate_location_contact_id, certificate_location_address_id,
        images:documents!documents_artwork_id_fkey(url),
        artist:artists(first_name, last_name),
        certificate_contact:contacts!artworks_certificate_location_contact_id_fkey(id, company_name, first_name, last_name),
        certificate_address:contact_addresses!artworks_certificate_location_address_id_fkey(id, contact_id, label, address, postal_code, city, country)`)
      .or('certificate.eq.true,certificate_location_contact_id.not.is.null,certificate_location_address_id.not.is.null')
      .eq('images.document_type', 'image')
      .order('position', { referencedTable: 'images', nullsFirst: false })
      .order('id', { referencedTable: 'images' }).limit(1, { referencedTable: 'images' })
      .order('id').range(offset, offset + 499)
      .returns<(CertificateLocationRow & { images: { url: string | null }[] })[]>()
    if (error) {
      console.error('LOAD CERTIFICATE LOCATIONS FAILED:', error)
      return NextResponse.json({ error: 'Unable to load certificate locations.' }, { status: 500 })
    }
    rows.push(...(data ?? []).map(({ images, ...row }) => ({
      ...row, image_url: images?.[0]?.url ?? null,
    })))
    if (!data || data.length < 500) break
  }
  return NextResponse.json({ artworks: rows })
}
