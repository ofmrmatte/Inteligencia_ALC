"use client";

import { useActionState, useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { IdCard, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { driverSignInAction, type DriverLoginState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button className="primary-button login-submit" disabled={pending}><LockKeyhole size={18} />{pending ? "Entrando..." : "Entrar no portal"}</button>;
}

export function DriverLoginForm() {
  const [state, action] = useActionState<DriverLoginState, FormData>(driverSignInAction, {});
  const [activation, setActivation] = useState({ driverCode: "", baseKey: "", confirmation: "", password: "" });
  const [message, setMessage] = useState("");
  const [activating, setActivating] = useState(false);

  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActivating(true);
    setMessage("");
    try {
      const response = await fetch("/api/driver-activation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activation),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Falha ao ativar acesso.");
      setMessage("Acesso ativado. Use seu ID e senha/PIN para entrar.");
      setActivation({ driverCode: "", baseKey: "", confirmation: "", password: "" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao ativar acesso.");
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="driver-login-stack">
      <form action={action} className="login-form">
        <label><span>ID do motorista</span><div><IdCard size={17} /><input name="driverCode" autoComplete="username" placeholder="Seu ID" required /></div></label>
        <label><span>Senha ou PIN</span><div><LockKeyhole size={17} /><input name="password" type="password" autoComplete="current-password" placeholder="Senha definida na ativação" required /></div></label>
        {state.error ? <p className="login-error">{state.error}</p> : null}
        <SubmitButton />
      </form>
      <form className="driver-activation" onSubmit={activate}>
        <strong><ShieldCheck size={16} />Primeiro acesso</strong>
        <label><span>ID</span><input value={activation.driverCode} onChange={(event) => setActivation({ ...activation, driverCode: event.target.value })} required /></label>
        <label><span>Base</span><input value={activation.baseKey} onChange={(event) => setActivation({ ...activation, baseKey: event.target.value })} required placeholder="Base cadastrada" /></label>
        <label><span>Confirmação</span><input value={activation.confirmation} onChange={(event) => setActivation({ ...activation, confirmation: event.target.value })} required placeholder="CPF final ou código temporário" /></label>
        <label><span>Nova senha/PIN</span><input value={activation.password} onChange={(event) => setActivation({ ...activation, password: event.target.value })} type="password" required minLength={6} /></label>
        {message ? <p className="admin-message">{message}</p> : null}
        <button className="secondary-button" disabled={activating} type="submit"><KeyRound size={15} />Ativar acesso</button>
      </form>
    </div>
  );
}
