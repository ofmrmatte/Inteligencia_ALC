"use client";
import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  Bot,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Inbox,
  Info,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Send,
  Tag,
  UserRoundCheck,
  X,
} from "lucide-react";
import { StatusBadge } from "@alc/ui/components";
import { api, useData, labels, when } from "./data";
import type { CaseRecord } from "@/lib/domain";
import { MediaViewer, type ChatAttachment } from "./media-viewer";
import { MediaComposer } from "./media-composer";

type Conversation = {
  id: string;
  name: string;
  phone: string;
  channel: string;
  status: string;
  unread: number;
  updated_at: string;
  assigned_to: string | null;
  labels: string[];
  operational_labels?: string[];
  priority?: string;
  last_message?: string;
  identity_verified: boolean;
  driver_id: string;
  base_key: string;
  sigla: string;
  case_id: string;
  last_inbound_at: string;
  agent_state: { step: string; result?: string; receivedAt?: string };
};
type Message = {
  id: string;
  direction: string;
  body: string;
  status: string;
  created_at: string;
  attachment?: ChatAttachment | null;
  sender_kind?: "ai" | "human" | "system" | "contact";
  sender_display_name_snapshot?: string;
};
type Detail = {
  conversation: Conversation;
  messages: Message[];
  queued: {
    id: string;
    payload: {
      text?: { body?: string };
      template?: { name?: string };
      caption?: string;
    };
    media_id?: string;
    status: string;
    error?: string;
    created_at: string;
    sender_kind?: Message["sender_kind"];
    sender_display_name_snapshot?: string;
  }[];
  cases: {
    case_id: string;
    competence: string;
    classification: string;
    record: CaseRecord;
  }[];
  hasMore: boolean;
};
type Agent = { id: string; name: string };
type Profile = { profile: { id: string }; admin: boolean };
function author(
  message: Pick<Message, "sender_kind" | "sender_display_name_snapshot">,
) {
  return message.sender_kind === "ai"
    ? "Agente virtual"
    : message.sender_display_name_snapshot || "ALC · autoria não registrada";
}
function status(value: string) {
  return value === "pending"
    ? "Pendente"
    : value === "resolved"
      ? "Resolvida"
      : value === "bot"
        ? "Aberta · Robô"
        : "Aberta · Atendente";
}
function Badge({ value }: { value: string }) {
  return (
    <StatusBadge
      tone={
        value === "resolved" || value === "read"
          ? "green"
          : value === "failed" || value === "uncertain"
            ? "red"
            : value === "pending"
              ? "amber"
              : "neutral"
      }
    >
      {labels[value] || value}
    </StatusBadge>
  );
}

export function Conversations({
  initialChannel = "all",
  initialView = "all",
  initialStatus = "open",
  initialSelected = "",
}: {
  initialChannel?: string;
  initialView?: string;
  initialStatus?: string;
  initialSelected?: string;
}) {
  const [selected, setSelected] = useState(initialSelected),
    [search, setSearch] = useState(""),
    [channel, setChannel] = useState(initialChannel),
    [view, setView] = useState(initialView),
    [state, setState] = useState(initialStatus),
    [assignee, setAssignee] = useState("all"),
    [label, setLabel] = useState(""),
    [offset, setOffset] = useState(0);
  const [base, setBase] = useState(""),
    [sigla, setSigla] = useState(""),
    [classification, setClassification] = useState("all"),
    [priority, setPriority] = useState("all"),
    [waitingMinutes, setWaitingMinutes] = useState("0");
  const term = useDeferredValue(search),
    tag = useDeferredValue(label);
  const query = new URLSearchParams({
    q: term,
    channel,
    view,
    status: state,
    assignee,
    label: tag,
    offset: String(offset),
    base,
    sigla,
    classification,
    priority,
    waitingMinutes,
  });
  const { data, error, refresh } = useData<{
    records: Conversation[];
    total: number;
    unread: number;
    limit: number;
  }>(`conversations?${query}`, 8_000);
  const { data: agents } = useData<{ records: Agent[] }>("agents"),
    { data: profile } = useData<Profile>("profile");
  function changed(set: (value: string) => void, value: string) {
    set(value);
    setOffset(0);
    setSelected("");
  }
  return (
    <main className="page inbox-page">
      <div className="inbox-filters">
        <div className="segmented" aria-label="Visão da caixa">
          {[
            ["all", "Todas"],
            ["mine", "Minhas"],
            ["uninteracted", "Não interagidas"],
          ].map(([id, title]) => (
            <button
              key={id}
              aria-pressed={view === id}
              onClick={() => changed(setView, id)}
            >
              {title}
            </button>
          ))}
        </div>
        <label>
          Canal
          <select
            value={channel}
            onChange={(e) => changed(setChannel, e.target.value)}
          >
            <option value="all">Todos</option>
            <option value="driver">Atendimento motoristas</option>
            <option value="client">Disparo Cliente</option>
          </select>
        </label>
        <label>
          Status
          <select
            value={state}
            onChange={(e) => changed(setState, e.target.value)}
          >
            <option value="all">Todos</option>
            <option value="open">Abertas</option>
            <option value="human">Com atendente</option>
            <option value="bot">Com robô</option>
            <option value="pending">Pendentes</option>
            <option value="resolved">Resolvidas</option>
          </select>
        </label>
        <label>
          Responsável
          <select
            value={assignee}
            onChange={(e) => changed(setAssignee, e.target.value)}
          >
            <option value="all">Todos</option>
            <option value="unassigned">Sem responsável</option>
            {agents?.records.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <div className="inbox-label-filter">
          <label>
            Etiqueta
            <input
              value={label}
              maxLength={40}
              onChange={(e) => changed(setLabel, e.target.value)}
              placeholder="Filtrar etiqueta"
            />
          </label>
          <button
            className="icon-button"
            title="Atualizar conversas"
            aria-label="Atualizar conversas"
            onClick={() => void refresh()}
          >
            <RefreshCw size={17} />
          </button>
        </div>
      </div>
      <details className="inbox-extra-filters">
        <summary>Filtros operacionais</summary>
        <div className="inbox-filters">
          <label>
            Base
            <input
              value={base}
              onChange={(e) => changed(setBase, e.target.value)}
              maxLength={250}
            />
          </label>
          <label>
            Sigla operacional
            <input
              value={sigla}
              onChange={(e) => changed(setSigla, e.target.value)}
              maxLength={100}
            />
          </label>
          <label>
            Classificação
            <select
              value={classification}
              onChange={(e) => changed(setClassification, e.target.value)}
            >
              <option value="all">Todas</option>
              {[
                "aberta",
                "aguardando_comprovante",
                "penalidade",
                "encerrada",
              ].map((id) => (
                <option key={id} value={id}>
                  {labels[id] || id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Prioridade
            <select
              value={priority}
              onChange={(e) => changed(setPriority, e.target.value)}
            >
              <option value="all">Todas</option>
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select>
          </label>
          <label>
            Sem resposta há
            <select
              value={waitingMinutes}
              onChange={(e) => changed(setWaitingMinutes, e.target.value)}
            >
              <option value="0">Qualquer tempo</option>
              <option value="30">30 minutos</option>
              <option value="60">1 hora</option>
              <option value="240">4 horas</option>
            </select>
          </label>
        </div>
      </details>
      {error && (
        <p className="notice error" role="alert">
          {error}
          <button onClick={() => void refresh()}>
            <RefreshCw size={15} />
            Tentar novamente
          </button>
        </p>
      )}
      <div className="inbox" data-mobile-view={selected ? "thread" : "list"}>
        <section className="conversation-list" aria-label="Lista de conversas">
          <div className="list-search">
            <input
              aria-label="Buscar conversa"
              placeholder="Nome, telefone, base ou PNR"
              value={search}
              maxLength={200}
              onChange={(e) => changed(setSearch, e.target.value)}
            />
            <small className="conversation-count">
              {data?.total ?? "—"} conversas · {data?.unread ?? "—"} não lidas
            </small>
          </div>
          <div className="conversation-rows">
            {data?.records.map((c) => (
              <button
                className={`conversation-item${selected === c.id ? " selected" : ""}`}
                aria-pressed={selected === c.id}
                onClick={() => setSelected(c.id)}
                key={c.id}
              >
                <span className="avatar">
                  {(c.name || c.phone).slice(0, 1)}
                </span>
                <span className="conversation-summary">
                  <strong>{c.name || `+${c.phone}`}</strong>
                  <small>
                    {c.channel === "driver" ? "Motoristas" : "Disparo Cliente"}{" "}
                    · {status(c.status)}
                  </small>
                  <span className="last-message">
                    {c.last_message || "Sem mensagens"}
                  </span>
                  <small>
                    {agents?.records.find((a) => a.id === c.assigned_to)
                      ?.name ||
                      (c.assigned_to
                        ? "Responsável atribuído"
                        : "Sem responsável")}
                  </small>
                  <small>{when(c.updated_at)}</small>
                  <span className="row-labels">
                    {[...(c.operational_labels || []), ...(c.labels || [])].map(
                      (l) => (
                        <span key={l}>{l}</span>
                      ),
                    )}
                  </span>
                </span>
                {c.unread > 0 && <span className="unread">{c.unread}</span>}
              </button>
            ))}
            {!data && !error && (
              <div className="empty" role="status">
                Carregando conversas…
              </div>
            )}
            {data && !data.records.length && (
              <div className="empty">
                <Inbox size={28} />
                <h3>Nenhuma conversa neste filtro</h3>
              </div>
            )}
          </div>
          <div className="pager">
            <span>
              {data?.total
                ? `${offset + 1}–${Math.min(offset + 30, data.total)} de ${data.total}`
                : "0 conversas"}
            </span>
            <button
              className="icon-button"
              title="Página anterior"
              aria-label="Página anterior"
              disabled={!offset}
              onClick={() => {
                setOffset((v) => Math.max(0, v - 30));
                setSelected("");
              }}
            >
              <ChevronLeft size={17} />
            </button>
            <button
              className="icon-button"
              title="Próxima página"
              aria-label="Próxima página"
              disabled={!data || offset + 30 >= data.total}
              onClick={() => {
                setOffset((v) => v + 30);
                setSelected("");
              }}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </section>
        {selected ? (
          <Thread
            key={selected}
            id={selected}
            profile={profile}
            onUpdate={refresh}
            onBack={() => setSelected("")}
          />
        ) : (
          <section className="empty thread-empty">
            <MessageSquare size={30} />
            <h2>Selecione uma conversa</h2>
          </section>
        )}
      </div>
    </main>
  );
}
function Thread({
  id,
  profile,
  onUpdate,
  onBack,
}: {
  id: string;
  profile: Profile | null;
  onUpdate: () => Promise<void>;
  onBack: () => void;
}) {
  const { data, error, refresh } = useData<Detail>(`messages?id=${id}`, 5_000),
    { data: agents } = useData<{ records: Agent[] }>(`agents?id=${id}`);
  const [body, setBody] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState(false),
    [details, setDetails] = useState(false),
    [older, setOlder] = useState<Message[]>([]),
    [historyMore, setHistoryMore] = useState(true),
    [historyBusy, setHistoryBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    messagesEnd = useRef<HTMLDivElement>(null);
  const c = data?.conversation;
  const messages = [
    ...new Map(
      [...older, ...(data?.messages || [])].map((m) => [m.id, m]),
    ).values(),
  ].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  const latestId = data?.messages.at(-1)?.id;
  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ block: "nearest" });
  }, [latestId]);
  useEffect(() => {
    let active = true;
    void api("conversation", { id, action: "read" })
      .then(onUpdate)
      .catch((e: Error) => {
        if (active) setNotice(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, onUpdate]);
  async function action(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setNotice("");
    try {
      await api("conversation", { id, action, ...extra });
      await refresh();
      await onUpdate();
      return true;
    } catch (e) {
      setNotice((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setNotice("");
    try {
      await api("conversation", { id, action: note ? "note" : "reply", body });
      setBody("");
      setNotice(
        note ? "Nota interna registrada." : "Resposta na fila de envio.",
      );
      await refresh();
      await onUpdate();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function history() {
    const first = messages[0];
    if (!first) return;
    setHistoryBusy(true);
    try {
      const page = await api<Detail>(
        `messages?id=${id}&before=${encodeURIComponent(first.created_at)}&beforeId=${first.id}`,
      );
      setOlder((v) => [...page.messages, ...v]);
      setHistoryMore(page.hasMore);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setHistoryBusy(false);
    }
  }
  const owns = c?.status === "human" && c.assigned_to === profile?.profile.id;
  const windowOpen = Boolean(
    c?.last_inbound_at &&
    Date.now() - new Date(c.last_inbound_at).getTime() < 86400000,
  );
  if (error)
    return (
      <section className="thread">
        <button onClick={onBack}>
          <ArrowLeft size={16} />
          Voltar à lista
        </button>
        <p role="alert" className="notice error">
          {error}
        </p>
        <button onClick={() => void refresh()}>
          <RefreshCw size={16} />
          Tentar novamente
        </button>
      </section>
    );
  if (!c)
    return (
      <section className="thread empty" role="status">
        Carregando atendimento…
      </section>
    );
  return (
    <div className="conversation-workspace" data-show-details={details}>
      <section className="thread" aria-label="Histórico e compositor">
        <header className="thread-header">
          <div className="thread-title">
            <button
              className="mobile-inbox-only icon-button"
              aria-label="Voltar à lista"
              title="Voltar à lista"
              onClick={onBack}
            >
              <ArrowLeft size={19} />
            </button>
            <div>
              <h2>{c.name || `+${c.phone}`}</h2>
              <small>
                {c.channel === "driver"
                  ? "Atendimento motoristas"
                  : "Disparo Cliente"}{" "}
                · {status(c.status)}
              </small>
            </div>
            <button
              className="details-toggle icon-button"
              aria-label="Abrir detalhes do contato"
              title="Detalhes do contato"
              onClick={() => setDetails(true)}
            >
              <Info size={19} />
            </button>
          </div>
          <div className="thread-actions">
            {!owns && c.status !== "resolved" && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => void action("takeover")}
              >
                <UserRoundCheck size={16} />
                Assumir
              </button>
            )}
            {c.status !== "resolved" && (
              <>
                <button disabled={busy} onClick={() => void action("pending")}>
                  <Clock3 size={16} />
                  Pendente
                </button>
                <button disabled={busy} onClick={() => void action("resolve")}>
                  <CheckCheck size={16} />
                  Resolver
                </button>
                <button disabled={busy} onClick={() => void action("resume")}>
                  <Bot size={16} />
                  Retomar robô
                </button>
              </>
            )}
            {c.status === "resolved" && (
              <button disabled={busy} onClick={() => void action("reopen")}>
                <RotateCcw size={16} />
                Reabrir
              </button>
            )}
            {c.unread > 0 && (
              <button disabled={busy} onClick={() => void action("read")}>
                <CheckCheck size={16} />
                Marcar lida
              </button>
            )}
          </div>
        </header>
        <div className="messages" aria-label="Mensagens">
          {(older.length ? historyMore : data?.hasMore) && (
            <button
              className="history-button"
              disabled={historyBusy}
              onClick={() => void history()}
            >
              {historyBusy ? "Carregando…" : "Mensagens anteriores"}
            </button>
          )}
          {messages.map((m) => (
            <article key={m.id} className={`message ${m.direction}`}>
              <small>
                {m.direction === "note"
                  ? `Nota interna · ${author(m)}`
                  : m.direction === "out"
                    ? author(m)
                    : c.name || "Contato"}
              </small>
              <p>{m.body}</p>
              {m.attachment && (
                <MediaViewer attachment={m.attachment} messageId={m.id} />
              )}
              <footer>
                <time>{when(m.created_at)}</time>
                <Badge value={m.status} />
              </footer>
            </article>
          ))}
          {data?.queued.map((m) => (
            <article key={m.id} className="message out">
              <small>{author(m)} · envio</small>
              <p>
                {m.media_id
                  ? m.payload.caption || "Anexo"
                  : m.payload.text?.body ||
                    `Modelo: ${m.payload.template?.name || "WhatsApp"}`}
              </p>
              <footer>
                <time>{when(m.created_at)}</time>
                <Badge value={m.status} />
              </footer>
              {m.error && <p className="message-error">{m.error}</p>}
              {m.media_id && m.status === "failed" && owns && windowOpen && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void action("attachment", {
                      mediaId: m.media_id,
                      ...(m.payload.caption ? { body: m.payload.caption } : {}),
                      retry: true,
                    })
                  }
                >
                  <RefreshCw size={15} />
                  Tentar envio novamente
                </button>
              )}
            </article>
          ))}
          {!messages.length && !data?.queued.length && (
            <div className="empty">Nenhuma mensagem registrada.</div>
          )}
          <div ref={messagesEnd} />
        </div>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        <form
          className={`composer${note ? " composer-note" : ""}`}
          onSubmit={send}
        >
          <div className="segmented" aria-label="Tipo de mensagem">
            <button
              type="button"
              aria-pressed={!note}
              onClick={() => setNote(false)}
            >
              Resposta
            </button>
            <button
              type="button"
              aria-pressed={note}
              onClick={() => setNote(true)}
            >
              Nota interna
            </button>
          </div>
          <label className="sr-only" htmlFor="reply">
            {note ? "Nota interna" : "Mensagem"}
          </label>
          <textarea
            id="reply"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              note
                ? "Nota para a equipe"
                : owns
                  ? "Responder ao contato"
                  : "Assuma o atendimento para responder"
            }
            disabled={busy || (!note && (!owns || !windowOpen))}
            maxLength={4000}
            required
          />
          <div className="composer-bottom">
            <small>
              {note
                ? "Visível apenas para a equipe."
                : !owns
                  ? "Resposta restrita ao responsável."
                  : !windowOpen
                    ? "Janela de 24h encerrada. Utilize um modelo aprovado."
                    : "Janela de atendimento aberta."}
            </small>
            <button
              className="primary"
              disabled={
                busy || !body.trim() || (!note && (!owns || !windowOpen))
              }
            >
              <Send size={16} />
              {note ? "Salvar nota" : "Enviar"}
            </button>
          </div>
          {!note && (
            <MediaComposer
              conversationId={id}
              disabled={busy || !owns || !windowOpen}
              onQueued={async () => {
                await refresh();
                await onUpdate();
              }}
            />
          )}
        </form>
      </section>
      <aside className="contact-details" aria-label="Detalhes do contato">
        <div className="details-heading">
          <button
            className="details-toggle icon-button"
            aria-label="Voltar à conversa"
            title="Voltar à conversa"
            onClick={() => setDetails(false)}
          >
            <ArrowLeft size={18} />
          </button>
          <h2>Contato e tratativa</h2>
        </div>
        <dl>
          <dt>Contato</dt>
          <dd>{c.name || "Nome não informado"}</dd>
          <dt>Telefone</dt>
          <dd>+{c.phone}</dd>
          <dt>Identidade</dt>
          <dd>{c.identity_verified ? "Validada" : "Validação pendente"}</dd>
          <dt>Motorista</dt>
          <dd>{c.driver_id || "Não vinculado"}</dd>
          <dt>Base / sigla</dt>
          <dd>
            {c.base_key || "Não vinculada"} · {c.sigla || "—"}
          </dd>
          <dt>Status</dt>
          <dd>{status(c.status)}</dd>
        </dl>
        <label>
          Responsável
          <select
            aria-label="Atribuir responsável"
            value={c.assigned_to || ""}
            disabled={busy || !profile?.admin}
            onChange={(e) =>
              void action("assign", { assignedTo: e.target.value || null })
            }
          >
            <option value="">Sem responsável</option>
            {c.assigned_to &&
              !agents?.records.some((a) => a.id === c.assigned_to) && (
                <option value={c.assigned_to}>Responsável atribuído</option>
              )}
            {agents?.records.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Prioridade
          <select
            aria-label="Prioridade do atendimento"
            value={c.priority || "normal"}
            disabled={busy}
            onChange={(e) =>
              void action("priority", { priority: e.target.value })
            }
          >
            <option value="normal">Normal</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </select>
        </label>
        <div className="details-labels">
          <h3>Etiquetas</h3>
          <div className="row-labels">
            {[...(c.operational_labels || []), ...(c.labels || [])].map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
          <button disabled={busy} onClick={() => dialog.current?.showModal()}>
            <Tag size={15} />
            Editar etiquetas
          </button>
        </div>
        <h3>Resultado da tratativa</h3>
        <p>
          {c.agent_state.result?.replaceAll("_", " ") ||
            "Tratativa em andamento"}
        </p>
        {c.agent_state.receivedAt && (
          <p>Recebimento: {c.agent_state.receivedAt}</p>
        )}
        {c.agent_state.result === "nao_recebido" && (
          <p className="notice">Encaminhamento ao Mercado Livre pendente.</p>
        )}
        <h3>PNRs vinculadas</h3>
        {data?.cases.map((item) => (
          <div className="linked-case" key={item.case_id}>
            <strong>{item.record.shipmentId}</strong>
            <small>
              Caso {item.case_id} · {item.competence}
            </small>
            <Badge value={item.classification} />
            <small>{item.record.driverName}</small>
            <small>
              {item.record.products.map((p) => p.title).join(", ") ||
                "Produto não coletado"}
            </small>
          </div>
        ))}
        {!data?.cases.length && (
          <p className="muted">Nenhuma PNR vinculada e autorizada.</p>
        )}
        {profile?.admin && c.channel === "driver" && (
          <details>
            <summary>Validar motorista</summary>
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void action("verify_driver", {
                  driverId: f.get("driverId"),
                  baseKey: f.get("baseKey"),
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
          </details>
        )}
      </aside>
      <dialog
        className="label-dialog"
        ref={dialog}
        aria-labelledby="label-title"
      >
        <div className="card-heading">
          <h2 id="label-title">Etiquetas da conversa</h2>
          <button
            className="icon-button"
            title="Fechar"
            aria-label="Fechar etiquetas"
            onClick={() => dialog.current?.close()}
          >
            <X size={18} />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void action("labels", {
              labels: String(f.get("labels") || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            }).then((saved) => {
              if (saved) dialog.current?.close();
            });
          }}
        >
          <label>
            Etiquetas separadas por vírgula
            <input
              name="labels"
              defaultValue={c.labels?.join(", ")}
              maxLength={500}
            />
          </label>
          <div className="actions">
            <button type="button" onClick={() => dialog.current?.close()}>
              Cancelar
            </button>
            <button className="primary" disabled={busy}>
              Salvar
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
