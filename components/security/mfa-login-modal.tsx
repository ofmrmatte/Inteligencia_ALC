"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { KeyRound, LoaderCircle, LogOut, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDashboardStore } from "@/lib/store";

type Phase = "loading" | "verify" | "success";

export function MfaLoginModal({ nextPath }: { nextPath: string }) {
  const supabase = useMemo(() => createClient(), []);
  const clearLocalCache = useDashboardStore((state) => state.clearLocalCache);
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>("loading");
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let disposed = false;

    void (async () => {
      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (disposed) return;

      if (!assurance.error && assurance.data.currentLevel === "aal2") {
        window.location.replace(nextPath);
        return;
      }

      const factors = await supabase.auth.mfa.listFactors();
      if (disposed) return;

      if (factors.error) {
        setError("Não foi possível carregar o segundo fator. Entre novamente e tente de novo.");
        setPhase("verify");
        return;
      }

      const verifiedTotp = factors.data.totp?.[0];
      if (!verifiedTotp) {
        window.location.replace(nextPath);
        return;
      }

      setFactorId(verifiedTotp.id);
      setPhase("verify");
    })();

    return () => {
      disposed = true;
    };
  }, [nextPath, supabase]);

  async function verify() {
    const normalized = code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(normalized)) {
      setError("Informe o código de 6 dígitos do aplicativo autenticador.");
      return;
    }
    if (!factorId) {
      setError("O fator de autenticação ainda não foi carregado.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error || !challenge.data?.id) {
        throw challenge.error ?? new Error("Falha ao gerar desafio MFA.");
      }

      const verified = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: normalized,
      });
      if (verified.error) throw verified.error;

      setPhase("success");
      window.setTimeout(() => window.location.replace(nextPath), 420);
    } catch {
      setError("Código inválido ou expirado. Aguarde o próximo código e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await clearLocalCache();
      await supabase.auth.signOut();
      window.location.replace("/login");
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div className="mfa-modal-backdrop" role="presentation">
      <section
        className={`mfa-modal ${phase === "success" ? "is-success" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mfa-login-title"
        aria-describedby="mfa-login-description"
      >
        {phase === "success" ? (
          <div className="mfa-modal__success">
            <span><ShieldCheck size={28} /></span>
            <strong>Acesso confirmado</strong>
            <p>Identidade validada. Abrindo o painel…</p>
          </div>
        ) : (
          <>
            <div className="mfa-modal__eyebrow"><KeyRound size={16} /> Segunda etapa de segurança</div>
            <div className="mfa-modal__heading">
              <h2 id="mfa-login-title">Confirme sua identidade</h2>
              <p id="mfa-login-description">Abra seu aplicativo autenticador e informe o código atual para concluir o acesso.</p>
            </div>

            {phase === "loading" ? (
              <div className="mfa-modal__loading">
                <LoaderCircle className="spin" size={20} />
                <span>Verificando seu autenticador…</span>
              </div>
            ) : (
              <div className="mfa-modal__body">
                <label className="mfa-modal__code">
                  <span>Código de 6 dígitos</span>
                  <input
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void verify();
                      }
                    }}
                    placeholder="000000"
                    aria-invalid={Boolean(error)}
                  />
                </label>

                {error ? <p className="mfa-modal__error">{error}</p> : null}

                <button className="primary-button mfa-modal__primary" type="button" disabled={busy} onClick={() => void verify()}>
                  <ShieldCheck size={17} />
                  {busy ? "Confirmando…" : "Confirmar e entrar"}
                </button>
              </div>
            )}

            <button className="mfa-modal__secondary" type="button" disabled={busy} onClick={() => void signOut()}>
              <LogOut size={15} />
              Sair desta conta
            </button>
          </>
        )}
      </section>
    </div>,
    document.body,
  );
}
