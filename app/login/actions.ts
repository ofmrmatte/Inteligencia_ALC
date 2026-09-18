"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { isTransientSupabaseError, retrySupabaseResult } from "@/lib/supabase/retry";

export interface LoginState {
  error?: string;
}

const schema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  password: z.string().min(6, "A senha precisa ter pelo menos 6 caracteres."),
});

export async function signInAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  if (!isSupabaseConfigured()) {
    return { error: "Autenticação do painel ainda não configurada neste ambiente." };
  }

  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revise os dados de login." };
  }

  const supabase = await createClient();
  const { error } = await retrySupabaseResult(
    () => supabase.auth.signInWithPassword(parsed.data),
    [250, 750],
  );

  if (error) {
    if (isTransientSupabaseError(error)) {
      return { error: "O serviço de autenticação está temporariamente sobrecarregado. Tente novamente em alguns segundos." };
    }
    return { error: "E-mail ou senha inválidos, ou usuário sem acesso liberado." };
  }

  redirect("/");
}

export async function signOutAction() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
