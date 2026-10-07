"use client";

import { useEffect, useMemo, useState } from "react";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDashboardStore } from "@/lib/store";

type Stage = "loading" | "enroll" | "verify";

export function MfaSetup({ nextPath }: { nextPath: string }) {
  const supabase = useMemo(() => createClient(), []);
  const clearLocalCache = useDashboardStore((state) => state.clearLocalCache);
  const [stage, setStage] = useState<Stage>("loading");
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;
    void (async () => {
      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (disposed) return;
      if (assurance.error) {
        setError("Não foi possível verificar o segundo fator agora.");
        setStage("verify");
        return;
      }
      if (assurance.data.currentLevel === "aal2") {
        window.location.replace(nextPath);
        return;
      }

      const factors = await supabase.auth.mfa.listFactors();
      if (disposed) return;
      if (factors.error) {
        setError("Não foi possível carregar os fatores de autenticação.");
        setStage("verify");
        return;
      }

      const verifiedTotp = factors.data.totp?.[0];
      if (verifiedTotp) {
        setFactorId(verifiedTotp.id);
        setStage("verify");
      } else {
        setStage("enroll");
      }
    })();

    return () => {
      disposed = true;
    };
  }, [nextPath, supabase]);

  async function startEnrollment() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) throw factors.error;

      const unverifiedTotp =
        factors.data.all?.filter((factor) => factor.factor_type === "totp" && factor.status === "unverified") ?? [];
      for (const factor of unverifiedTotp) {
        const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (removed.error) throw removed.error;
      }

      const enrolled = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Inteligência ALC",
      });
      if (enrolled.error || !enrolled.data?.id || !enrolled.data.totp) {
        throw enrolled.error ?? new Error("Falha ao iniciar o MFA.");
      }
      setFactorId(enrolled.data.id);
      setQrCode(enrolled.data.totp.qr_code);
      setSecret(enrolled.data.totp.secret);
    } catch {
      setError("Não foi possível gerar o autenticador. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    const normalized = code.replace(/\s+/g, "");
    if (!factorId) {
      setError("Configure o autenticador antes de confirmar.");
      return;
    }
    if (!/^\d{6}$/.test(normalized)) {
      setError("Informe o código de 6 dígitos do aplicativo autenticador.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error || !challenge.data?.id) throw challenge.error ?? new Error("Falha ao gerar desafio.");
      const verified = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: normalized,
      });
      if (verified.error) throw verified.error;
      window.location.replace(nextPath);
    } catch {
      setError("Código inválido ou expirado. Gere um novo código no autenticador e tente novamente.");
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

  return (
    <main className="login-page">
      <section className="login-card mfa-card" aria-labelledby="mfa-title">
        <div className="login-brand" aria-label="Inteligência ALC">
          <strong>Inteligência <b>ALC</b></strong>
          <span>SEGURANÇA DE ACESSO</span>
        </div>

        <div className="login-copy">
          <span>AUTENTICAÇÃO EM DUAS ETAPAS</span>
          <h1 id="mfa-title">Confirme sua identidade</h1>
          <p>O segundo fator é obrigatório para acessar dados operacionais do ALC.</p>
        </div>

        {stage === "loading" ? (
          <div className="mfa-status"><ShieldCheck size={20} /><span>Verificando segurança da sessão…</span></div>
        ) : stage === "enroll" ? (
          <div className="mfa-stack">
            {!factorId ? (
              <>
                <div className="mfa-status">
                  <KeyRound size={20} />
                  <span>Configure Google Authenticator, Microsoft Authenticator, 1Password ou outro aplicativo TOTP.</span>
                </div>
                <button className="primary-button login-submit" type="button" disabled={busy} onClick={() => void startEnrollment()}>
                  <ShieldCheck size={18} />
                  {busy ? "Gerando…" : "Configurar autenticador"}
                </button>
              </>
            ) : (
              <>
                <div className="mfa-qr-wrap">
                  {qrCode ? <img className="mfa-qr" src={qrCode} alt="QR Code para configurar o autenticador" /> : null}
                </div>
                <div className="mfa-secret">
                  <span>Chave manual</span>
                  <code>{secret}</code>
                </div>
                <label className="mfa-code-field">
                  <span>Código de 6 dígitos</span>
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                  />
                </label>
                <button className="primary-button login-submit" type="button" disabled={busy} onClick={() => void verify()}>
                  <ShieldCheck size={18} />
                  {busy ? "Confirmando…" : "Ativar e entrar"}
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="mfa-stack">
            <div className="mfa-status">
              <ShieldCheck size={20} />
              <span>Abra seu aplicativo autenticador e informe o código atual.</span>
            </div>
            <label className="mfa-code-field">
              <span>Código de 6 dígitos</span>
              <input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
              />
            </label>
            <button className="primary-button login-submit" type="button" disabled={busy} onClick={() => void verify()}>
              <ShieldCheck size={18} />
              {busy ? "Confirmando…" : "Confirmar segundo fator"}
            </button>
          </div>
        )}

        {error ? <p className="login-error">{error}</p> : null}

        <button className="mfa-signout" type="button" disabled={busy} onClick={() => void signOut()}>
          <LogOut size={15} />
          Sair desta conta
        </button>
      </section>
    </main>
  );
}
