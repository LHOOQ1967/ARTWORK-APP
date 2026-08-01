import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiAuth'
import { findBestArtistMatch } from '@/lib/imports/findBestArtistMatch'
import { runLabelOcr } from '@/lib/imports/ocr'
import { parseLabelText } from '@/lib/imports/parseLabelText'

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const authorization = await requireRole(['Editor', 'Administrator'])
  if (authorization.response) {
    return authorization.response
  }

  const { supabase } = authorization
  const { data: importRow, error: fetchError } = await supabase
    .from('artwork_imports')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !importRow) {
    return NextResponse.json({ error: 'Import introuvable' }, { status: 404 })
  }

  if (!importRow.image_url) {
    return NextResponse.json(
      { error: 'Aucune image_url sur cet import' },
      { status: 400 }
    )
  }

  const { error: processingError } = await supabase
    .from('artwork_imports')
    .update({
      status: 'processing',
      error_message: null,
    })
    .eq('id', id)

  if (processingError) {
    return NextResponse.json({ error: processingError.message }, { status: 500 })
  }

  try {
    const ocr = await runLabelOcr(importRow.image_url)
    const parsed = parseLabelText(ocr.text)
    const artistName = parsed.parsedData.normalized?.artist_name ?? null
    const artistMatch = artistName
      ? await findBestArtistMatch(supabase, artistName)
      : null

    const { data: updatedImport, error: updateError } = await supabase
      .from('artwork_imports')
      .update({
        ocr_provider: ocr.provider,
        ocr_text: ocr.text,
        ocr_language: ocr.languages ?? [],
        parsed_data: parsed.parsedData,
        confidence: parsed.confidence,
        artist_match_id: artistMatch?.id ?? null,
        status: 'parsed',
        error_message: null,
      })
      .eq('id', id)
      .select('*')
      .single()

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({
      import: updatedImport,
      artistMatch,
    })
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Erreur inattendue'

    console.error('[ARTWORK_IMPORT_ANALYZE]', errorMessage)

    await supabase
      .from('artwork_imports')
      .update({
        status: 'failed',
        error_message: errorMessage,
      })
      .eq('id', id)

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
