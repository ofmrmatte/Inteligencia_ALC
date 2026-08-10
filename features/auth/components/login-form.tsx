"use client";

import { LogIn } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    if (!email || !password) {
      setError("Informe email e senha para continuar.");
      return;
    }

    startTransition(async () => {
      const supabase = createBrowserSupabaseClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        setError("Credenciais inválidas ou sessão indisponível.");
        return;
      }

      if (!remember) sessionStorage.setItem("alc-session-ephemeral", "true");

      const next = searchParams.get("next");
      router.replace(next && next.startsWith("/") ? next : "/dashboard");
      router.refresh();
    });
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} noValidate>
      <Input
        label="Email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="nome@empresa.com"
        required
        disabled={pending}
      />
      <PasswordInput
        label="Senha"
        name="password"
        autoComplete="current-password"
        placeholder="Sua senha"
        required
        disabled={pending}
      />

      <label className="checkbox-row">
        <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} disabled={pending} />
        <span>Lembrar sessão neste dispositivo</span>
      </label>

      {error ? <div className="form-alert">{error}</div> : null}

      <Button type="submit" fullWidth disabled={pending} icon={<LogIn size={18} aria-hidden="true" />}>
        {pending ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
