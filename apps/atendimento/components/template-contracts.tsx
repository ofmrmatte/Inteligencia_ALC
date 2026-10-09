"use client";
import { useState, type FormEvent } from "react";
import { Check, Plus, Save, X } from "lucide-react";
import { api, labels, useData } from "./data";
import { templateContractDraftSchema, type TemplateContractDraft } from "@/lib/template-contract-fields";
import type { TemplateContractPreview, TemplateContractReview } from "@/lib/template-contract-config";

export function TemplateContracts() {
  const [channel, setChannel] = useState<"client" | "driver">("client");
  const { data, error, refresh } = useData<TemplateContractReview>(`template-contracts?channel=${channel}`);
  return <section className="settings-section">
    <nav className="tabs" aria-label="Canal do contrato Meta">
      {(["client", "driver"] as const).map(value => <button type="button" key={value}
        className={channel === value ? "active" : ""} aria-pressed={channel === value}
        onClick={() => setChannel(value)}>{labels[value]}</button>)}
    </nav>
    {error ? <p className="notice error" role="alert">{error}</p> : null}
    {data ? <TemplateContractEditor key={`${channel}:${data.revision}:${data.contract?.contentVersion || "none"}`}
      review={data} refresh={refresh} /> : !error ? <p role="status">Carregando contrato...</p> : null}
  </section>;
}

export function TemplateContractEditor({ review, refresh }: {
  review: TemplateContractReview; refresh: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<TemplateContractDraft>(() => {
    if (review.contract) {
      const { contentVersion: _version, ...fields } = review.contract;
      void _version;
      return fields;
    }
    return { channel: review.channel, name: review.channel === "driver" ? "pnraberta" : "cliente_loss_v2",
      language: "pt_BR", category: "UTILITY", bodyText: "", headerText: null, footerText: null, buttons: [],
      parameters: review.channel === "driver" ? { header: ["nome_motorista"], body: ["nome_motorista"] }
        : { header: [], body: ["customer_name", "nome_disparou", "product_name", "delivery_date", "delivery_time", "product_id", "purchase_value"] } };
  });
  const [category, setCategory] = useState(review.contract?.category || "");
  const [preview, setPreview] = useState<TemplateContractPreview | null>(null);
  const [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const change = (next: TemplateContractDraft) => { setDraft(next); setPreview(null); setReviewed(false); setNotice(""); };
  async function compare(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setPreview(null); setReviewed(false); setNotice("");
    try {
      const parsed = templateContractDraftSchema.safeParse({ ...draft, category });
      if (!parsed.success) throw new Error("Revise os campos do contrato Meta.");
      setPreview(await api<TemplateContractPreview>("template-contracts", {
        kind: "preview", expectedRevision: review.revision, contract: parsed.data,
      }));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível comparar."); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!preview || !reviewed || busy) return;
    setBusy(true); setNotice("");
    try {
      await api("template-contracts", { kind: "save", ...preview, reviewed: true });
      setPreview(null); setReviewed(false);
      await refresh();
      setNotice("Contrato revisado salvo.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }
  return <form className="stack" onSubmit={compare}>
    <div className="page-tools"><h2>{draft.name}</h2><span className={`badge ${review.contract ? "ready" : "pending"}`}>
      {review.contract ? `Revisão ${review.revision}` : "Disparos bloqueados: contrato não revisado"}</span></div>
    <dl><dt>Remetente</dt><dd>{review.sender.phoneId || "Não configurado"}</dd><dt>WABA</dt><dd>{review.sender.wabaId || "Não configurado"}</dd></dl>
    <fieldset className="contract-fields" disabled={busy}>
      <legend>Conteúdo aprovado</legend>
      <label>Idioma<input value={draft.language} readOnly /></label>
      <label>Categoria<select required value={category} onChange={event => {
        setCategory(event.target.value); setPreview(null); setReviewed(false); setNotice("");
      }}><option value="">Selecionar</option><option value="UTILITY">Utility</option>
        <option value="MARKETING">Marketing</option><option value="AUTHENTICATION">Authentication</option></select></label>
      <label>Cabeçalho<textarea maxLength={60} value={draft.headerText || ""}
        onChange={event => change({ ...draft, headerText: event.target.value || null })} /></label>
      <label>Rodapé<textarea maxLength={60} value={draft.footerText || ""}
        onChange={event => change({ ...draft, footerText: event.target.value || null })} /></label>
      <label className="contract-body">Corpo<textarea required maxLength={1024} rows={7} value={draft.bodyText}
        onChange={event => change({ ...draft, bodyText: event.target.value })} /></label>
      <dl className="contract-body"><dt>Parâmetros do cabeçalho</dt><dd>{draft.parameters.header.join(", ") || "Nenhum"}</dd>
        <dt>Parâmetros do corpo</dt><dd>{draft.parameters.body.join(", ")}</dd></dl>
      <div className="contract-body contract-buttons">
        {draft.buttons.map((button, index) => <div className="contract-button" key={index}>
          <label>Tipo do botão {index + 1}<select value={button.type} onChange={event => {
            const type = event.target.value;
            const next: TemplateContractDraft["buttons"][number] = type === "URL" ? { type, text: button.text, url: "" }
              : type === "PHONE_NUMBER" ? { type, text: button.text, phone_number: "" } : { type: "QUICK_REPLY", text: button.text };
            change({ ...draft, buttons: draft.buttons.map((entry, i) => i === index ? next : entry) });
          }}><option value="QUICK_REPLY">Resposta rápida</option><option value="URL">Link</option><option value="PHONE_NUMBER">Telefone</option></select></label>
          <label>Texto do botão {index + 1}<input required maxLength={25} value={button.text}
            onChange={event => change({ ...draft, buttons: draft.buttons.map((entry, i) => i === index ? { ...entry, text: event.target.value } : entry) })} /></label>
          {button.type === "URL" ? <label>URL<input required type="url" maxLength={2000} value={button.url}
            onChange={event => change({ ...draft, buttons: draft.buttons.map((entry, i) => i === index ? { ...button, url: event.target.value } : entry) })} /></label>
            : button.type === "PHONE_NUMBER" ? <label>Telefone<input required maxLength={16} value={button.phone_number}
              onChange={event => change({ ...draft, buttons: draft.buttons.map((entry, i) => i === index ? { ...button, phone_number: event.target.value } : entry) })} /></label> : null}
          <button type="button" title={`Remover botão ${index + 1}`} aria-label={`Remover botão ${index + 1}`}
            onClick={() => change({ ...draft, buttons: draft.buttons.filter((_, i) => i !== index) })}><X size={16} /></button>
        </div>)}
        <button type="button" disabled={draft.buttons.length >= 10} onClick={() => change({ ...draft,
          buttons: [...draft.buttons, { type: "QUICK_REPLY", text: "" }] })}><Plus size={16} />Adicionar botão</button>
      </div>
      <button type="submit"><Check size={16} />{busy ? "Comparando..." : "Comparar com a Meta"}</button>
    </fieldset>
    {preview ? <section className="contract-preview" aria-label="Contrato validado">
      <h3>Contrato correspondente à Meta</h3>
      <span className="badge">APPROVED · {preview.contract.language} · {preview.contract.category}</span>
      <p>{preview.contract.headerText}</p><p>{preview.contract.bodyText}</p><p>{preview.contract.footerText}</p>
      {preview.contract.buttons.map((button, index) => <p key={index}>{button.text}{button.type === "URL" ? ` · ${button.url}` : button.type === "PHONE_NUMBER" ? ` · ${button.phone_number}` : ""}</p>)}
      <label className="check"><input type="checkbox" checked={reviewed} disabled={busy}
        onChange={event => setReviewed(event.target.checked)} />Revisei o texto, os parâmetros e o remetente deste contrato</label>
      <button className="primary" type="button" disabled={!reviewed || busy} onClick={() => void save()}><Save size={16} />Salvar contrato revisado</button>
    </section> : null}
    {notice ? <p className="notice" role="status">{notice}</p> : null}
  </form>;
}
