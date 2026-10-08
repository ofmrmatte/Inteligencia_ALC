"use client";
import { createBrowserClient } from "@supabase/ssr";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [factor, setFactor] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
        key =
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key)
        throw new Error("A configuração de acesso ainda está pendente.");
      const client = createBrowserClient(url, key);
      if (factor) {
        const result = await client.auth.mfa.challengeAndVerify({
          factorId: factor,
          code: String(data.get("code")),
        });
        if (result.error) throw result.error;
      } else {
        const result = await client.auth.signInWithPassword({
          email: String(data.get("email")).trim(),
          password: String(data.get("password")),
        });
        if (result.error) throw new Error("E-mail ou senha inválidos.");
        const factors = await client.auth.mfa.listFactors();
        if (factors.error) throw factors.error;
        if (factors.data.totp[0]) {
          setFactor(factors.data.totp[0].id);
          return;
        }
      }
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no acesso.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="stack">
      {factor ? (
        <label>
          Código do autenticador
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            required
            maxLength={6}
          />
        </label>
      ) : (
        <>
          <label>
            E-mail
            <input
              type="email"
              name="email"
              autoComplete="username"
              required
              placeholder="seuemail@alc.com.br"
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </label>
        </>
      )}
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="primary" disabled={busy}>
        {busy
          ? "Verificando…"
          : factor
            ? "Confirmar acesso"
            : "Entrar no Atendimento"}
        <span>→</span>
      </button>
    </form>
  );
}
