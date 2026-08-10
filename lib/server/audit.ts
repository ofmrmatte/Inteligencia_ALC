import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/auth/types";

export async function recordAuditLog({
  userId,
  profile,
  action,
  entityType,
  entityId,
  details = {},
}: {
  userId: string;
  profile: Profile | null;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
}) {
  const supabase = await createServerSupabaseClient();
  await supabase.from("audit_logs").insert({
    user_id: userId,
    user_email: profile?.email || null,
    action,
    entity_type: entityType,
    entity_id: entityId || null,
    details,
  });
}
