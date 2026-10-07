import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function safeNext(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.startsWith("/login") || value.startsWith("/seguranca/mfa")) return "/";
  return value;
}

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!isSupabaseConfigured()) redirect("/login");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) redirect("/login");

  const params = await searchParams;
  const query = new URLSearchParams({
    mfa: "1",
    next: safeNext(params.next),
  });

  redirect(`/login?${query.toString()}`);
}
