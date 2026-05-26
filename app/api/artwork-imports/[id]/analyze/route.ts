
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { runLabelOcr } from "@/lib/imports/ocr";
import { parseLabelText } from "@/lib/imports/parseLabelText";
import { findBestArtistMatch } from "@/lib/imports/findBestArtistMatch";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let id: string | null = null;
  let supabase: Awaited<ReturnType<typeof supabaseServer>> | null = null;

  try {
    const params = await context.params;
    id = params.id;

    supabase = await supabaseServer();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { data: importRow, error: fetchError } = await supabase
      .from("artwork_imports")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !importRow) {
      return NextResponse.json({ error: "Import introuvable" }, { status: 404 });
    }

    console.log("[ANALYZE] importRow.id =", importRow.id);
    console.log("[ANALYZE] importRow.image_url =", importRow.image_url);
    console.log("[ANALYZE] importRow.status =", importRow.status);

    if (!importRow.image_url) {
      return NextResponse.json(
        { error: "Aucune image_url sur cet import" },
        { status: 400 }
      );
    }

    const { error: processingError } = await supabase
      .from("artwork_imports")
      .update({
        status: "processing",
        error_message: null,
      })
      .eq("id", id);

    if (processingError) {
      console.error("[ANALYZE] processingError =", processingError);
      return NextResponse.json(
        { error: processingError.message },
        { status: 500 }
      );
    }

    const ocr = await runLabelOcr(importRow.image_url);

    console.log("[ANALYZE] OCR provider =", ocr.provider);
    console.log("[ANALYZE] OCR languages =", ocr.languages);
    console.log("[ANALYZE] OCR text =\n", ocr.text);

    const parsed = parseLabelText(ocr.text);

    console.log(
      "[ANALYZE] parsed.parsedData =",
      JSON.stringify(parsed.parsedData, null, 2)
    );
    console.log(
      "[ANALYZE] parsed.confidence =",
      JSON.stringify(parsed.confidence, null, 2)
    );

    const artistName = parsed?.parsedData?.normalized?.artist_name ?? null;
    console.log("[ANALYZE] artistName =", artistName);

    const artistMatch = artistName
      ? await findBestArtistMatch(supabase, artistName)
      : null;

    console.log("[ANALYZE] artistMatch =", artistMatch);

    const { data: updatedImport, error: updateError } = await supabase
      .from("artwork_imports")
      .update({
        ocr_provider: ocr.provider,
        ocr_text: ocr.text,
        ocr_language: ocr.languages ?? [],
        parsed_data: parsed.parsedData,
        confidence: parsed.confidence,
        artist_match_id: artistMatch?.id ?? null,
        status: "parsed",
        error_message: null,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) {
      console.error("[ANALYZE] updateError =", updateError);

      await supabase
        .from("artwork_imports")
        .update({
          status: "failed",
          error_message: updateError.message,
        })
        .eq("id", id);

      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    console.log("[ANALYZE] updatedImport.id =", updatedImport?.id);
    console.log(
      "[ANALYZE] updatedImport.artist_match_id =",
      updatedImport?.artist_match_id
    );
    console.log("[ANALYZE] updatedImport.status =", updatedImport?.status);

    return NextResponse.json({
      import: updatedImport,
      artistMatch,
    });
  } catch (error: any) {
    console.error("[ANALYZE] unexpected error =", error);

    if (supabase && id) {
      await supabase
        .from("artwork_imports")
        .update({
          status: "failed",
          error_message: error?.message ?? "Erreur inattendue",
        })
        .eq("id", id);
    }

    return NextResponse.json(
      { error: error?.message ?? "Erreur inattendue" },
      { status: 500 }
    );
  }
}
