
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
  const supabase = await supabaseServer();
  
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
console.log("ADMIN OK")
console.log("SERVICE ROLE:", process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 10))
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
    }

    // 1) user courant
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // 2) créer ligne import

    const { data: importRow, error: insertError } = await admin
      .from("artwork_imports")
      .insert({
        created_by: user.id,
        status: "pending",
        source_type: "label_photo",
      })

      .select("*")
      .single();

    if (insertError || !importRow) {
      return NextResponse.json({ error: insertError?.message ?? "Création import impossible" }, { status: 500 });
    }

    // 3) upload storage
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const filePath = `${user.id}/${importRow.id}/label.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await admin.storage
      .from("artwork-imports")
      .upload(filePath, buffer, {
        contentType: file.type || "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      await supabase
        .from("artwork_imports")
        .update({
          status: "failed",
          error_message: uploadError.message,
        })
        .eq("id", importRow.id);

      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: publicUrlData } = admin.storage
      .from("artwork-imports")
      .getPublicUrl(filePath);

    const { data: updatedImport, error: updateError } = await admin
      .from("artwork_imports")
      .update({
        image_path: filePath,
        image_url: publicUrlData.publicUrl,
        status: "uploaded",
      })
      .eq("id", importRow.id)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ import: updatedImport });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Erreur inattendue" },
      { status: 500 }
    );
  }
}
