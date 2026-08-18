import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("global_data_revision")
    .select("revision,updated_at")
    .eq("id", 1)
    .single();

  if (error) {
    return NextResponse.json({ error: `Falha ao verificar sincronização global: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json(
    { revision: Number(data.revision || 0), updatedAt: data.updated_at || null },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
  );
}
