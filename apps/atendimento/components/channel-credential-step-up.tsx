"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api } from "./data";

type Channel = "driver" | "client";
export type ChannelCredentialPayload =
  | { operation: "reveal_token_verification"; channel: Channel }
  | { operation: "replace_access_token"; channel: Channel; token: string }
  | { operation: "replace_app_secret"; channel: Channel; appSecret: string }
  | {
      operation: "change_webhook_critical";
      channel: Channel;
      phoneId: string;
      wabaId: string;
      number: string;
      verifyToken?: string;
    };
type CredentialResult = { ok: true } | { verifyToken: string };
type Factor = { id: string; friendlyName: string };

function operationLabel(operation: ChannelCredentialPayload["operation"]) {
  return operation === "reveal_token_verification"
    ? "revelar o token de verificação"
    : operation === "replace_access_token"
      ? "substituir o token de acesso"
      : operation === "replace_app_secret"
        ? "substituir o App Secret"
        : "alterar a configuração crítica do webhook";
}

export function ChannelCredentialStepUp({
  payload,
  onComplete,
  onCancel,
}: {
  payload: ChannelCredentialPayload;
  onComplete: (result: CredentialResult) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void api<{ factors: Factor[] }>("channel-credentials")
      .then(({ factors: available }) => {
        if (!active) return;
        setFactors(available);
        setFactorId(available[0]?.id || "");
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "MFA indisponível.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [payload]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = code.replace(/\s+/g, "");
    if (!factorId) {
      setError("Nenhum autenticador TOTP verificado foi encontrado.");
      return;
    }
    if (!/^\d{6}$/.test(normalizedCode)) {
      setError("Informe o código atual de 6 dígitos.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const challenge = await api<{
        challengeId: string;
        factorId: string;
        nonce: string;
      }>("channel-credentials", {
        action: "challenge",
        payload,
        factorId,
      });
      const verified = await api<{ proofId: string }>("channel-credentials", {
        action: "verify",
        payload,
        factorId: challenge.factorId,
        challengeId: challenge.challengeId,
        nonce: challenge.nonce,
        code: normalizedCode,
      });
      const result = await api<CredentialResult>("channel-credentials", {
        action: "execute",
        payload,
        proofId: verified.proofId,
      });
      await onComplete(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "MFA indisponível.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog className="label-dialog" open aria-modal="true" aria-labelledby="channel-step-up-title">
      <h2 id="channel-step-up-title">Confirmação MFA necessária</h2>
      <p className="muted">
        Confirme o TOTP para {operationLabel(payload.operation)} em {payload.channel === "driver" ? "Motoristas" : "Clientes"}.
      </p>
      {loading ? <p role="status">Consultando autenticadores verificados…</p> : null}
      {!loading && !factors.length ? (
        <p className="notice error" role="alert">
          Nenhum autenticador TOTP verificado está disponível. Configure o MFA no Inteligência ALC.
        </p>
      ) : null}
      {!loading && factors.length ? (
        <form className="stack" onSubmit={submit}>
          <label>
            Autenticador
            <select value={factorId} onChange={(event) => setFactorId(event.target.value)} disabled={busy}>
              {factors.map((factor) => (
                <option key={factor.id} value={factor.id}>
                  {factor.friendlyName || "Aplicativo autenticador"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Código TOTP
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              disabled={busy}
              autoFocus
            />
          </label>
          <div className="actions">
            <button type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
            <button className="primary" disabled={busy}>
              {busy ? "Confirmando…" : "Confirmar e continuar"}
            </button>
          </div>
        </form>
      ) : null}
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      {!loading && !factors.length ? (
        <div className="actions">
          <button type="button" onClick={onCancel}>Fechar</button>
        </div>
      ) : null}
    </dialog>
  );
}
