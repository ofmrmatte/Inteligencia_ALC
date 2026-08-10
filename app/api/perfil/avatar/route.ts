import { NextResponse, type NextRequest } from "next/server";
import { recordAuditLog } from "@/lib/server/audit";
import { apiError } from "@/lib/server/api-response";
import { requireAuthenticated } from "@/lib/server/authz";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const MAX_SIZE = 5 * 1024 * 1024;
const MIME_BY_SIGNATURE = [
  { mime: "image/jpeg", test: (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  { mime: "image/png", test: (bytes: Uint8Array) => bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 },
  { mime: "image/webp", test: (bytes: Uint8Array) => String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" },
];

export async function POST(request: NextRequest) {
  const { session, response } = await requireAuthenticated();
  if (response) return response;

  const formData = await request.formData();
  const file = formData.get("avatar");
  if (!(file instanceof File)) {
    return apiError("Envie uma imagem válida.", 400);
  }
  if (file.size > MAX_SIZE) {
    return apiError("Imagem maior que 5 MB.", 413);
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const signature = MIME_BY_SIGNATURE.find((item) => item.test(bytes));
  if (!signature || signature.mime !== file.type) {
    return apiError("Formato de imagem inválido.", 400);
  }

  const extension = signature.mime.split("/")[1].replace("jpeg", "jpg");
  const path = `${session.user.id}/avatar-${Date.now()}.${extension}`;
  const supabase = await createServerSupabaseClient();
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, Buffer.from(buffer), { contentType: signature.mime, upsert: true });

  if (uploadError) return apiError("Não foi possível enviar o avatar agora.", 400);

  const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(path);
  const avatarUrl = publicData.publicUrl;
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq("id", session.user.id);

  if (profileError) return apiError("Não foi possível atualizar o avatar agora.", 400);

  await recordAuditLog({
    userId: session.user.id,
    profile: session.profile,
    action: "update_own_avatar",
    entityType: "profiles",
    entityId: session.user.id,
    details: { path },
  });

  return NextResponse.json({ avatarUrl });
}
