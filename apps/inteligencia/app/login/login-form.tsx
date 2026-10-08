"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { LockKeyhole, Mail } from "lucide-react";
import { MfaLoginModal } from "@/components/security/mfa-login-modal";
import { signInAction, type LoginState } from "./actions";

function SubmitButton({ locked }: { locked: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="primary-button login-submit" disabled={pending || locked}>
      <LockKeyhole size={18} />
      {pending ? "Entrando..." : "Entrar no sistema"}
    </button>
  );
}

export function LoginForm({
  supabaseReady,
  initialError,
  nextPath,
  initialMfa = false,
}: {
  supabaseReady: boolean;
  initialError?: string;
  nextPath: string;
  initialMfa?: boolean;
}) {
  const [state, action] = useActionState<LoginState, FormData>(signInAction, {});
  const showMfa = Boolean(initialMfa || state.mfaRequired);

  return (
    <>
      <form action={action} className="login-form">
        <input type="hidden" name="next" value={nextPath} />
        <label>
          <span>E-mail</span>
          <div>
            <Mail size={17} />
            <input name="email" type="email" autoComplete="email" placeholder="usuario@alc.com.br" disabled={!supabaseReady || showMfa} required />
          </div>
        </label>
        <label>
          <span>Senha</span>
          <div>
            <LockKeyhole size={17} />
            <input name="password" type="password" autoComplete="current-password" placeholder="Senha de acesso" disabled={!supabaseReady || showMfa} required />
          </div>
        </label>
        {state.error ?? initialError ? <p className="login-error">{state.error ?? initialError}</p> : null}
        {!supabaseReady ? <p className="login-error">Autenticação do painel ainda não configurada neste ambiente.</p> : null}
        <SubmitButton locked={showMfa} />
      </form>

      {showMfa ? <MfaLoginModal nextPath={nextPath} /> : null}
    </>
  );
}
