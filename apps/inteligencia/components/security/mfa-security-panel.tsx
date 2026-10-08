"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { KeyRound, LoaderCircle, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Panel, StatusBadge } from "@/components/ui";

type SecurityStatus = "loading" | "enabled" | "disabled" | "error";
type DialogMode = "enable" | "disable" | null;
type DialogPhase = "loading" | "ready" | "success";

type VerifiedFactor = {
  id: string;
  friendly_name?: string;
};

export function MfaSecurityPanel() {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<SecurityStatus>("loading");
  const [verifiedFactors, setVerifiedFactors] = useState<VerifiedFactor[]>([]);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [dialogPhase, setDialogPhase] = useState<DialogPhase>("loading");
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refreshStatus() {
    const factors = await supabase.auth.mfa.listFactors();
    if (factors.error) {
      setStatus("error");
      return false;
    }

    const verified = (factors.data.totp ?? []).map((factor) => ({
      id: factor.id,
      friendly_name: factor.friendly_name,
    }));
    setVerifiedFactors(verified);
    setStatus(verified.length > 0 ? "enabled" : "disabled");
    return true;
  }

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function openEnable() {
    setDialogMode("enable");
    setDialogPhase("loading");
    setError("");
    setCode("");
    setQrCode("");
    setSecret("");
    setFactorId("");

    try {
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) throw factors.error;

      const existingVerified = factors.data.totp?.[0];
      if (existingVerified) {
        setVerifiedFactors((factors.data.totp ?? []).map((factor) => ({
          id: factor.id,
          friendly_name: factor.friendly_name,
        })));
        setStatus("enabled");
        setDialogMode(null);
        return;
      }

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
        throw enrolled.error ?? new Error("Falha ao iniciar cadastro do autenticador.");
      }

      setFactorId(enrolled.data.id);
      setQrCode(enrolled.data.totp.qr_code);
      setSecret(enrolled.data.totp.secret);
      setDialogPhase("ready");
    } catch {
      setError("Não foi possível iniciar a configuração do autenticador. Tente novamente.");
      setDialogPhase("ready");
    }
  }

  async function verifyEnable() {
    const normalized = code.replace(/\s+/g, "");
    if (!factorId) {
      setError("Gere o QR Code antes de confirmar.");
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
      if (challenge.error || !challenge.data?.id) throw challenge.error ?? new Error("Falha no desafio MFA.");

      const verified = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: normalized,
      });
      if (verified.error) throw verified.error;

      await refreshStatus();
      setDialogPhase("success");
      window.setTimeout(() => setDialogMode(null), 420);
    } catch {
      setError("Código inválido ou expirado. Aguarde o próximo código e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  function openDisable() {
    setDialogMode("disable");
    setDialogPhase("ready");
    setCode("");
    setError("");
  }

  async function verifyDisable() {
    const normalized = code.replace(/\s+/g, "");
    const primaryFactor = verifiedFactors[0];

    if (!primaryFactor) {
      setError("Nenhum autenticador ativo foi encontrado.");
      return;
    }
    if (!/^\d{6}$/.test(normalized)) {
      setError("Informe o código atual de 6 dígitos antes de desativar.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId: primaryFactor.id });
      if (challenge.error || !challenge.data?.id) throw challenge.error ?? new Error("Falha no desafio MFA.");

      const verified = await supabase.auth.mfa.verify({
        factorId: primaryFactor.id,
        challengeId: challenge.data.id,
        code: normalized,
      });
      if (verified.error) throw verified.error;

      for (const factor of verifiedFactors) {
        const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (removed.error) throw removed.error;
      }

      const remaining = await supabase.auth.mfa.listFactors();
      if (!remaining.error) {
        const incomplete =
          remaining.data.all?.filter((factor) => factor.factor_type === "totp" && factor.status === "unverified") ?? [];
        for (const factor of incomplete) {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }
      }

      await supabase.auth.refreshSession();
      setVerifiedFactors([]);
      setStatus("disabled");
      setDialogPhase("success");
      window.setTimeout(() => setDialogMode(null), 420);
    } catch {
      setError("Não foi possível desativar o MFA. Confirme o código atual e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  const enabled = status === "enabled";

  return (
    <>
      <Panel
        title="Segurança da conta"
        subtitle="Controle de autenticação em duas etapas"
        action={
          status === "loading"
            ? <StatusBadge><LoaderCircle className="spin" size={12} /> Verificando</StatusBadge>
            : status === "error"
              ? <StatusBadge tone="red">Indisponível</StatusBadge>
              : <StatusBadge tone={enabled ? "green" : "neutral"}>{enabled ? "MFA ativado" : "MFA desativado"}</StatusBadge>
        }
      >
        <div className="profile-security">
          <div className="profile-security__icon">
            {enabled ? <ShieldCheck size={22} /> : <ShieldOff size={22} />}
          </div>
          <div className="profile-security__copy">
            <strong>Autenticação em duas etapas</strong>
            <p>
              {enabled
                ? "Sua conta exige um código TOTP após a senha. O segundo fator protege o acesso mesmo se a senha for comprometida."
                : "Ative um aplicativo autenticador para adicionar uma segunda verificação ao entrar no painel."}
            </p>
            {enabled ? (
              <span><Smartphone size={13} /> Aplicativo autenticador (TOTP) • {verifiedFactors.length} fator{verifiedFactors.length === 1 ? "" : "es"} ativo{verifiedFactors.length === 1 ? "" : "s"}</span>
            ) : null}
          </div>
          <div className="profile-security__action">
            {status === "error" ? (
              <button className="secondary-button" type="button" onClick={() => void refreshStatus()}>Tentar novamente</button>
            ) : enabled ? (
              <button className="danger-button profile-security__button" type="button" onClick={openDisable}>Desativar MFA</button>
            ) : (
              <button className="primary-button profile-security__button" type="button" disabled={status === "loading"} onClick={() => void openEnable()}>
                <KeyRound size={16} /> Ativar MFA
              </button>
            )}
          </div>
        </div>
      </Panel>

      {dialogMode ? (
        <div className="mfa-modal-backdrop" role="presentation">
          <section className={`mfa-modal mfa-modal--settings ${dialogPhase === "success" ? "is-success" : ""}`} role="dialog" aria-modal="true" aria-labelledby="mfa-settings-title">
            {dialogPhase === "success" ? (
              <div className="mfa-modal__success">
                <span><ShieldCheck size={28} /></span>
                <strong>{dialogMode === "enable" ? "MFA ativado" : "MFA desativado"}</strong>
                <p>{dialogMode === "enable" ? "A segunda etapa já está protegendo sua conta." : "A conta voltará a usar somente a autenticação por senha."}</p>
              </div>
            ) : dialogPhase === "loading" ? (
              <div className="mfa-modal__loading mfa-modal__loading--large">
                <LoaderCircle className="spin" size={22} />
                <span>Preparando configuração segura…</span>
              </div>
            ) : dialogMode === "enable" ? (
              <>
                <div className="mfa-modal__eyebrow"><KeyRound size={16} /> Segurança da conta</div>
                <div className="mfa-modal__heading">
                  <h2 id="mfa-settings-title">Ativar autenticação em duas etapas</h2>
                  <p>Escaneie o QR Code no seu aplicativo autenticador e confirme com o código gerado.</p>
                </div>

                {qrCode ? (
                  <div className="mfa-enroll-grid">
                    <div className="mfa-enroll-grid__qr">
                      <Image src={qrCode} alt="QR Code para configurar o autenticador" width={220} height={220} unoptimized />
                    </div>
                    <div className="mfa-enroll-grid__secret">
                      <span>Chave manual</span>
                      <code>{secret}</code>
                    </div>
                  </div>
                ) : null}

                <label className="mfa-modal__code">
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

                {error ? <p className="mfa-modal__error">{error}</p> : null}

                <div className="mfa-modal__actions">
                  <button className="secondary-button" type="button" disabled={busy} onClick={() => setDialogMode(null)}>Cancelar</button>
                  <button className="primary-button" type="button" disabled={busy || !qrCode} onClick={() => void verifyEnable()}>
                    <ShieldCheck size={16} /> {busy ? "Confirmando…" : "Ativar MFA"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mfa-modal__eyebrow"><ShieldOff size={16} /> Segurança da conta</div>
                <div className="mfa-modal__heading">
                  <h2 id="mfa-settings-title">Desativar autenticação em duas etapas</h2>
                  <p>Para confirmar que é você, informe um código atual do aplicativo autenticador antes de remover a proteção.</p>
                </div>

                <label className="mfa-modal__code">
                  <span>Código TOTP atual</span>
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

                {error ? <p className="mfa-modal__error">{error}</p> : null}

                <div className="mfa-modal__actions">
                  <button className="secondary-button" type="button" disabled={busy} onClick={() => setDialogMode(null)}>Cancelar</button>
                  <button className="danger-button mfa-modal__danger" type="button" disabled={busy} onClick={() => void verifyDisable()}>
                    <ShieldOff size={16} /> {busy ? "Desativando…" : "Confirmar desativação"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
