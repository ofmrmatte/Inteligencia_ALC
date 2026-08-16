"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizeDriverKey } from "@/lib/driver-portal";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export interface DriverLoginState {
  error?: string;
}

const schema = z.object({
  driverCode: z.string().min(2, "Informe seu ID de motorista."),
  password: z.string().min(6, "A senha/PIN precisa ter pelo menos 6 caracteres."),
});

export async function driverSignInAction(_state: DriverLoginState, formData: FormData): Promise<DriverLoginState> {
  if (!isSupabaseConfigured()) return { error: "Autenticação ainda não configurada." };
  const parsed = schema.safeParse({ driverCode: formData.get("driverCode"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revise os dados." };
  const email = `${normalizeDriverKey(parsed.data.driverCode).toLowerCase()}@motorista.alc.local`;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
  if (error) return { error: "ID ou senha inválidos, ou acesso ainda não ativado." };
  redirect("/motorista");
}

export async function driverSignOutAction() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/motorista/login");
}
