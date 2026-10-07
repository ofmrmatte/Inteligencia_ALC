"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
}

const schema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  password: z.string().min(6, "A senha precisa ter pelo menos 6 caracteres."),
});

const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

async function loginAttemptKey(email: string) {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const remote = forwarded || requestHeaders.get("x-real-ip") || "unknown";
  return `${remote.slice(0, 128)}|${email.trim().toLowerCase()}`;
}

function blockedForSeconds(key: string) {
  const now = Date.now();
  const attempt = loginAttempts.get(key);
  if (!attempt) return 0;
  if (attempt.resetAt <= now) {
    loginAttempts.delete(key);
    return 0;
  }
  return attempt.count >= LOGIN_MAX_FAILURES ? Math.ceil((attempt.resetAt - now) / 1000) : 0;
}

function recordLoginFailure(key: string) {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  current.count += 1;
}

function clearLoginFailures(key: string) {
  loginAttempts.delete(key);
}

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

  const attemptKey = await loginAttemptKey(parsed.data.email);
  const blockedSeconds = blockedForSeconds(attemptKey);
  if (blockedSeconds > 0) {
    return { error: "Muitas tentativas de acesso. Aguarde alguns minutos antes de tentar novamente." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (error.code === "invalid_credentials") {
      recordLoginFailure(attemptKey);
      return { error: "E-mail ou senha inválidos." };
    }

    return { error: "Não foi possível concluir o acesso agora. Tente novamente em alguns instantes." };
  }

  if (!data.session) {
    return { error: "Não foi possível concluir o acesso agora. Tente novamente em alguns instantes." };
  }

  clearLoginFailures(attemptKey);
  redirect("/seguranca/mfa");
}

export async function signOutAction() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
