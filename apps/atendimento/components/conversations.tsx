"use client";
import { useState, type FormEvent } from "react";
import { api, useData, labels, when } from "./data";
type Conversation = {
  id: string;
  name: string;
  phone: string;
  channel: string;
  status: string;
  unread: number;
  updated_at: string;
  identity_verified: boolean;
  driver_id: string;
  case_id: string;
  agent_state: { step: string; result?: string; receivedAt?: string };
};
type Message = {
  id: string;
  direction: string;
  body: string;
  status: string;
  created_at: string;
  attachment?: { id: string; filename?: string } | null;
};
export function Conversations() {
  const { data, error, refresh } = useData<{ records: Conversation[] }>(
    "conversations",
    8_000,
  );
  const [selected, setSelected] = useState(""),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState("");
  const rows = (data?.records || []).filter(
    (r) =>
      (filter === "all" || r.channel === filter || r.status === filter) &&
      `${r.name} ${r.phone}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <main className="page">
      <div className="page-title">
        <div>
          <p className="eyebrow">CAIXA DE ATENDIMENTO</p>
          <h1>Conversas</h1>
          <p className="muted">
            Contexto, histórico e atendimento humano em um lugar.
          </p>
        </div>
        <span className="badge">{rows.length} atendimentos</span>
      </div>
      {error ? <p className="notice error">{error}</p> : null}
      <div className="inbox">
        <section className="conversation-list">
          <input
            aria-label="Buscar conversa"
            placeholder="Buscar nome ou telefone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label="Filtrar conversas"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Todos os atendimentos</option>
            <option value="driver">Motoristas</option>
            <option value="client">Clientes</option>
            <option value="human">Com a equipe</option>
            <option value="bot">Automático</option>
            <option value="resolved">Concluído</option>
          </select>
          {rows.map((r) => (
            <button
              className={`conversation-item ${selected === r.id ? "selected" : ""}`}
              onClick={() => setSelected(r.id)}
              key={r.id}
            >
              <span className="avatar">{(r.name || r.phone).slice(0, 1)}</span>
              <div>
                <strong>{r.name || `+${r.phone}`}</strong>
                <small>
                  {labels[r.channel]} · {labels[r.status]}
                </small>
                <small>{when(r.updated_at)}</small>
              </div>
              {r.unread > 0 ? <span className="unread">{r.unread}</span> : null}
            </button>
          ))}
          {!rows.length ? (
            <div className="empty">
              <h3>Nenhuma conversa</h3>
              <p>Os atendimentos aparecerão com os canais WhatsApp ativados.</p>
            </div>
          ) : null}
        </section>
        {selected ? (
          <Thread key={selected} id={selected} onUpdate={refresh} />
        ) : (
          <section className="empty thread-empty">
            <span className="icon-tile">↗</span>
            <h2>Selecione um atendimento</h2>
            <p>Clientes e motoristas com o contexto de cada PNR.</p>
          </section>
        )}
      </div>
    </main>
  );
}
function Thread({
  id,
  onUpdate,
}: {
  id: string;
  onUpdate: () => Promise<void>;
}) {
  const { data, error, refresh } = useData<{
      conversation: Conversation;
      messages: Message[];
    }>(`messages?id=${id}`, 5_000),
    { data: profile } = useData<{ admin: boolean }>("profile");
  const [body, setBody] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState(false),
    [verify, setVerify] = useState(false);
  async function action(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      await api("conversation", { id, action, ...extra });
      setNotice("Atualizado.");
      await Promise.all([refresh(), onUpdate()]);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api("conversation", { id, action: note ? "note" : "reply", body });
      setBody("");
      setNotice(note ? "Nota adicionada." : "Resposta na fila de envio.");
      await refresh();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const c = data?.conversation;
  return (
    <section className="thread">
      <header className="thread-header">
        <div>
          <h2>{c?.name || `+${c?.phone || ""}`}</h2>
          <span className="muted">
            {labels[c?.channel || ""]} · {labels[c?.status || ""]} ·{" "}
            {c?.identity_verified
              ? "Identidade validada"
              : "Validação pendente"}
          </span>
        </div>
        <div className="actions">
          <button disabled={busy} onClick={() => action("takeover")}>
            Assumir
          </button>
          <button disabled={busy} onClick={() => action("resume")}>
            Retomar robô
          </button>
          <button disabled={busy} onClick={() => action("resolve")}>
            Concluir
          </button>
          {profile?.admin && c?.channel === "driver" ? (
            <button onClick={() => setVerify((v) => !v)}>
              Validar motorista
            </button>
          ) : null}
        </div>
      </header>
      {error ? <p className="notice error">{error}</p> : null}
      {verify ? (
        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void action("verify_driver", {
              driverId: form.get("driverId"),
              baseKey: form.get("baseKey"),
            });
          }}
        >
          <label>
            ID do motorista
            <input name="driverId" required />
          </label>
          <label>
            Base validada
            <input name="baseKey" required />
          </label>
          <label className="check">
            <input type="checkbox" required />
            Identidade confirmada pela equipe
          </label>
          <button disabled={busy}>Validar</button>
        </form>
      ) : null}
      <div className="messages">
        {data?.messages.map((m) => (
          <article key={m.id} className={`message ${m.direction}`}>
            <small>
              {m.direction === "note"
                ? "Nota interna"
                : m.direction === "out"
                  ? "ALC"
                  : c?.name || "Contato"}
            </small>
            <p>{m.body}</p>
            {m.attachment ? (
              <a className="text-link" href={`/api/media?id=${m.id}`} download>
                Baixar {m.attachment.filename || "anexo"} ↓
              </a>
            ) : null}
            <small>
              {when(m.created_at)} · {m.status}
            </small>
          </article>
        ))}
      </div>
      {c?.agent_state.result ? (
        <div className="notice">
          Tratativa: {c.agent_state.result.replaceAll("_", " ")}
          {c.agent_state.receivedAt
            ? ` · recebimento ${c.agent_state.receivedAt}`
            : ""}
        </div>
      ) : null}
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      <form className="composer" onSubmit={send}>
        <label className="check">
          <input
            type="checkbox"
            checked={note}
            onChange={(e) => setNote(e.target.checked)}
          />
          Nota interna
        </label>
        <label className="sr-only" htmlFor="reply">
          Mensagem
        </label>
        <textarea
          id="reply"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            note ? "Adicionar uma nota para a equipe…" : "Responder ao contato…"
          }
          maxLength={4000}
          required
        />
        <div className="composer-bottom">
          <small>
            Resposta livre disponível por 24h após a última mensagem recebida.
          </small>
          <button className="primary" disabled={busy || !body.trim()}>
            {note ? "Salvar nota" : "Enviar resposta"} →
          </button>
        </div>
      </form>
    </section>
  );
}
