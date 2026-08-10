import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/auth/types";

export type DashboardSetting = {
  key: string;
  value: Record<string, unknown>;
  updated_by_email: string | null;
  updated_at: string | null;
};

export type ProcessedFileRow = {
  id: string;
  module_key: string | null;
  file_name: string | null;
  competencia: string | null;
  row_count: number | null;
  status: string | null;
  processed_at: string | null;
  raw_file_deleted: boolean | null;
  file_role: string | null;
};

export type AuditLogRow = {
  id: string;
  user_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string | null;
  details: Record<string, unknown> | null;
};

export type AdminSettingsPageData = {
  profiles: Profile[];
  pnrGoal: DashboardSetting | null;
  files: ProcessedFileRow[];
  auditLogs: AuditLogRow[];
  error: string | null;
};

export async function getAdminSettingsPage(): Promise<AdminSettingsPageData> {
  try {
    const supabase = await createServerSupabaseClient();
    const [profilesResult, settingsResult, filesResult, auditResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,name,email,role,is_admin,cargo,setor,avatar_url")
        .order("email", { ascending: true }),
      supabase
        .from("dashboard_settings")
        .select("key,value,updated_by_email,updated_at")
        .eq("key", "pnr_goal")
        .maybeSingle(),
      supabase
        .from("processed_dashboard_files")
        .select("id,module_key,file_name,competencia,row_count,status,processed_at,raw_file_deleted,file_role")
        .order("processed_at", { ascending: false, nullsFirst: false })
        .limit(250),
      supabase
        .from("audit_logs")
        .select("id,user_email,action,entity_type,entity_id,created_at,details")
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(40),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (settingsResult.error) throw settingsResult.error;
    if (filesResult.error) throw filesResult.error;
    if (auditResult.error) throw auditResult.error;

    return {
      profiles: (profilesResult.data ?? []) as Profile[],
      pnrGoal: (settingsResult.data as DashboardSetting | null) ?? null,
      files: (filesResult.data ?? []) as ProcessedFileRow[],
      auditLogs: (auditResult.data ?? []) as AuditLogRow[],
      error: null,
    };
  } catch (error) {
    return {
      profiles: [],
      pnrGoal: null,
      files: [],
      auditLogs: [],
      error: error instanceof Error ? error.message : "Falha ao carregar configurações.",
    };
  }
}
