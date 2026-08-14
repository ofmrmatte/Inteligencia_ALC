"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { LockKeyhole, Mail } from "lucide-react";
import { signInAction, type LoginState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="primary-button login-submit" disabled={pending}>
      <LockKeyhole size={18} />
      {pending ? "Entrando..." : "Entrar"}
    </button>
  );
}

export function LoginForm({ supabaseReady }: { supabaseReady: boolean }) {
  const [state, action] = useActionState<LoginState, FormData>(signInAction, {});

  return (
    <form action={action} className="login-form">
      <label>
        <span>E-mail</span>
        <div>
          <Mail size={17} />
          <input name="email" type="email" autoComplete="email" placeholder="usuario@alc.com.br" disabled={!supabaseReady} required />
        </div>
      </label>
      <label>
        <span>Senha</span>
        <div>
          <LockKeyhole size={17} />
          <input name="password" type="password" autoComplete="current-password" placeholder="Senha de acesso" disabled={!supabaseReady} required />
        </div>
      </label>
      {state.error ? <p className="login-error">{state.error}</p> : null}
      {!supabaseReady ? <p className="login-error">Autenticação do painel ainda não configurada neste ambiente.</p> : null}
      <SubmitButton />
    </form>
  );
}
