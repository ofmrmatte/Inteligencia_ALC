"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Send, X } from "lucide-react";
import {
  normalize,
  phone,
  templateParameters,
  driverNotificationEligible,
  type CaseRecord,
} from "@/lib/domain";
import { api, useData, labels, when } from "./data";

type Channel = "driver" | "client";
export type DispatchCandidate = {
  case_id: string;
  competence: string;
  classification: string;
  record: CaseRecord;
  initial_status: string | null;
};
type Job = {
  id: string;
  case_id: string;
  channel: Channel;
  phone: string;
  name: string;
  base_key: string;
  sigla: string;
  status: string;
  error: string;
  created_at: string;
  provider_id: string;
  template_name: string;
  message_type: string;
};

// Preflight only: the API still validates scope, Meta approval and the 24h window.
export function previewBlock(
  channel: Channel,
  row: DispatchCandidate,
  current: string,
) {
  if (row.initial_status)
    return labels[row.initial_status] || row.initial_status;
  if (row.competence !== current) return "Competência anterior";
  if (row.classification === "encerrada") return "PNR encerrada";
  if (
    !phone(
      channel === "driver" ? row.record.driverPhone : row.record.customerPhone,
    )
  )
    return "Sem telefone válido";
  if (channel === "driver" && !driverNotificationEligible(row.classification))
    return "Classificação fora das notificações de motoristas";
  if (
    channel === "client" &&
    !["aguardando_comprovante", "penalidade"].includes(row.classification)
  )
    return "Fora da tratativa de clientes";
  try {
    templateParameters(channel, row.record, "Equipe");
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : "Dados incompletos";
  }
}

export function Dispatches({ channel = "client" }: { channel?: Channel }) {
  const preview = useData<{
    records: DispatchCandidate[];
    competence: string;
    limit: number;
  }>(`dispatch-preview?channel=${channel}`, 30_000);
  const history = useData<{ records: Job[]; limit: number }>(
    `outbox?channel=${channel}`,
    8_000,
  );
  const { data: access } = useData<{ admin: boolean }>("profile");
  const [tab, setTab] = useState<"preview" | "history">("preview");
  const [search, setSearch] = useState(""),
    [base, setBase] = useState("all"),
    [status, setStatus] = useState("all");
  const [period, setPeriod] = useState("current"),
    [page, setPage] = useState(0);
  const [selected, setSelected] = useState<DispatchCandidate | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
  }, [selected]);
  const current = preview.data?.competence || "";
  const candidates = preview.data?.records || [],
    jobs = history.data?.records || [];
  const term = normalize(search);
  const rows = candidates.filter(
    (r) =>
      (period === "all" || r.competence === current) &&
      (base === "all" || (r.record.baseKey || r.record.sigla) === base) &&
      (status === "all" || r.classification === status) &&
      normalize(
        `${channel === "driver" ? r.record.driverName : r.record.customerName} ${channel === "driver" ? r.record.driverPhone : r.record.customerPhone} ${r.record.shipmentId} ${r.case_id}`,
      ).includes(term),
  );
  const events = jobs.filter(
    (r) =>
      r.channel === channel &&
      (base === "all" || (r.base_key || r.sigla) === base) &&
      (status === "all" || r.status === status) &&
      normalize(
        `${r.name} ${r.phone} ${r.case_id} ${r.provider_id || ""}`,
      ).includes(term),
  );
  const bases = [
    ...new Set(
      tab === "preview"
        ? candidates.map((r) => r.record.baseKey || r.record.sigla)
        : jobs.map((r) => r.base_key || r.sigla),
    ),
  ]
    .filter(Boolean)
    .sort();
  const count = tab === "preview" ? rows.length : events.length,
    lastPage = Math.max(0, Math.ceil(count / 25) - 1),
    activePage = Math.min(page, lastPage);
  const start = activePage * 25;
  const summary =
    tab === "preview"
      ? [
          [rows.length, "PNRs no filtro"],
          [
            rows.filter((r) => !previewBlock(channel, r, current)).length,
            "com dados para prévia",
          ],
          [
            rows.filter(
              (r) =>
                !phone(
                  channel === "driver"
                    ? r.record.driverPhone
                    : r.record.customerPhone,
                ),
            ).length,
            "sem telefone válido",
          ],
          [
            events.filter(
              (r) => r.status === "uncertain" || r.status === "failed",
            ).length,
            "envios para conferir",
          ],
        ]
      : [
          [events.length, "envios no filtro"],
          [
            events.filter(
              (r) => r.status === "pending" || r.status === "sending",
            ).length,
            "na fila",
          ],
          [
            events.filter(
              (r) => r.status === "delivered" || r.status === "read",
            ).length,
            "entregues ou lidos",
          ],
          [
            events.filter(
              (r) => r.status === "uncertain" || r.status === "failed",
            ).length,
            "envios para conferir",
          ],
        ];
  function reset() {
    setPage(0);
  }
  function changeTab(next: "preview" | "history") {
    setTab(next);
    setStatus("all");
    setBase("all");
    reset();
  }
  async function refresh() {
    await Promise.all([preview.refresh(), history.refresh()]);
  }
  async function send() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const result = await api<{ queued: boolean }>("dispatch", {
        caseId: selected.case_id,
        channel,
      });
      setNotice(
        result.queued
          ? "Contato colocado na fila. Acompanhe a confirmação no histórico."
          : "Esse contato inicial já foi registrado. Nenhum novo envio foi criado.",
      );
      dialog.current?.close();
      await refresh();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selectedPhone = selected
    ? phone(
        channel === "driver"
          ? selected.record.driverPhone
          : selected.record.customerPhone,
      )
    : "";
  const method =
    selected &&
    channel === "driver" &&
    selected.classification !== "aguardando_comprovante"
      ? "Texto em janela de 24h validada"
      : channel === "driver"
        ? "pnraberta · pt_BR"
        : "cliente_loss · pt_BR";
  return (
    <main className="page dispatch-page">
      <div className="page-tools">
        <p className="muted">
          {channel === "driver"
            ? "Notificações e acompanhamento das PNRs dos motoristas."
            : "Contato e tratativa dos clientes vinculados às PNRs."}
        </p>

      </div>
      <div className="dispatch-summary" aria-label="Resumo do recorte">
        {summary.map(([value, label]) => (
          <span key={label}>
            <strong>{value}</strong> {label}
          </span>
        ))}
      </div>
      <div className="dispatch-filters">
        <div className="segmented" aria-label="Visualização dos disparos">
          <button
            aria-pressed={tab === "preview"}
            onClick={() => changeTab("preview")}
          >
            Prévia de envio
          </button>
          <button
            aria-pressed={tab === "history"}
            onClick={() => changeTab("history")}
          >
            Histórico
          </button>
        </div>
        <label>
          Busca
          <input
            type="search"
            placeholder={
              channel === "driver"
                ? "Motorista, telefone ou PNR"
                : "Cliente, telefone ou PNR"
            }
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              reset();
            }}
          />
        </label>
        <label>
          Base
          <select
            value={base}
            onChange={(e) => {
              setBase(e.target.value);
              reset();
            }}
          >
            <option value="all">Todas</option>
            {bases.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              reset();
            }}
          >
            <option value="all">Todos</option>
            {(tab === "preview"
              ? ["aguardando_comprovante", "penalidade", "aberta", "encerrada"]
              : [
                  "pending",
                  "sending",
                  "sent",
                  "delivered",
                  "read",
                  "failed",
                  "uncertain",
                  "cancelled",
                ]
            ).map((s) => (
              <option value={s} key={s}>
                {labels[s]}
              </option>
            ))}
          </select>
        </label>
        {tab === "preview" && (
          <label>
            Competência
            <select
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                reset();
              }}
            >
              <option value="current">
                Vigente · {current || "Carregando"}
              </option>
              <option value="all">Histórico armazenado</option>
            </select>
          </label>
        )}
      </div>
      {preview.error || history.error ? (
        <p className="notice error" role="alert">
          {preview.error || history.error}
        </p>
      ) : null}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <section className="panel">
        <div className="panel__head">
          <h2>
            {tab === "preview" ? "Destinatários e PNRs" : "Histórico de envios"}
          </h2>
          <small>{count} registros no recorte</small>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {(tab === "preview"
                  ? [
                      "Destinatário",
                      "Envio / caso",
                      "Base",
                      "Status PNR",
                      "Contato",
                      "Situação",
                      "",
                    ]
                  : [
                      "Data",
                      "Destinatário",
                      "PNR",
                      "Base",
                      "Modelo",
                      "Status",
                      "Detalhe",
                    ]
                ).map((label, i) => (
                  <th key={i}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tab === "preview"
                ? rows.slice(start, start + 25).map((r) => {
                    const block = previewBlock(channel, r, current),
                      number = phone(
                        channel === "driver"
                          ? r.record.driverPhone
                          : r.record.customerPhone,
                      );
                    return (
                      <tr key={r.case_id}>
                        <td>
                          {(channel === "driver"
                            ? r.record.driverName
                            : r.record.customerName) || "Nome pendente"}
                        </td>
                        <td>
                          <strong>{r.record.shipmentId}</strong>
                          <small>
                            Caso {r.case_id} · {r.competence}
                          </small>
                        </td>
                        <td>
                          {r.record.baseKey ||
                            r.record.sigla ||
                            "Não informada"}
                        </td>
                        <td>
                          <span className={`badge ${r.classification}`}>
                            {labels[r.classification] || r.classification}
                          </span>
                        </td>
                        <td>{number ? `+${number}` : "Não localizado"}</td>
                        <td>
                          {block ||
                            (channel === "driver" &&
                            r.classification !== "aguardando_comprovante"
                              ? "Exige janela validada de 24h"
                              : "Aguardando conferência")}
                        </td>
                        <td>
                          <button
                            disabled={
                              Boolean(block) ||
                              !access?.admin ||
                              Boolean(preview.error) ||
                              busy
                            }
                            title={
                              block ||
                              (!access?.admin
                                ? "Disparo restrito a diretores e desenvolvedores"
                                : "Conferir destinatário")
                            }
                            onClick={() => {
                              setSelected(r);
                              setNotice("");
                            }}
                          >
                            <Send size={14} /> Conferir
                          </button>
                        </td>
                      </tr>
                    );
                  })
                : events.slice(start, start + 25).map((r) => (
                    <tr key={r.id}>
                      <td>{when(r.created_at)}</td>
                      <td>
                        {r.name || "Contato"}
                        <small>+{r.phone}</small>
                      </td>
                      <td>{r.case_id || "Conversa"}</td>
                      <td>{r.base_key || r.sigla || "Não informada"}</td>
                      <td>
                        {r.template_name ||
                          (r.message_type === "text"
                            ? "Janela de 24h"
                            : "Mensagem")}
                      </td>
                      <td>
                        <span className="badge">
                          {labels[r.status] || r.status}
                        </span>
                      </td>
                      <td className="dispatch-detail">
                        {r.error ||
                          r.provider_id ||
                          (["pending", "sending"].includes(r.status)
                            ? "Aguardando processamento"
                            : "Sem detalhe adicional")}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
          {!count && (
            <div className="dispatch-empty">
              <h3>
                {(tab === "preview" ? !preview.data : !history.data) &&
                !(preview.error || history.error)
                  ? "Carregando registros..."
                  : "Nenhum registro neste filtro"}
              </h3>
              {preview.data && tab === "preview" && (
                <Link className="text-link" href="/pnrs">
                  Consultar PNRs e contatos
                </Link>
              )}
            </div>
          )}
        </div>
        <div className="pager">
          <span>
            {count ? start + 1 : 0}–{Math.min(start + 25, count)} de {count}
            {(
              tab === "preview"
                ? candidates.length >= (preview.data?.limit || 10000)
                : jobs.length >= (history.data?.limit || 1000)
            )
              ? " · limite de consulta atingido"
              : ""}
          </span>
          <button
            className="icon-button"
            aria-label="Página anterior"
            title="Página anterior"
            disabled={!activePage}
            onClick={() => setPage(activePage - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="Próxima página"
            title="Próxima página"
            disabled={activePage >= lastPage}
            onClick={() => setPage(activePage + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </section>
      <p className="dispatch-policy">
        Um contato inicial por PNR, canal e telefone. Envios incertos exigem
        conferência; não são reenviados automaticamente.
      </p>
      {selected && (
        <dialog
          ref={dialog}
          className="label-dialog"
          aria-labelledby="dispatch-title"
          onClose={() => setSelected(null)}
        >
          <div className="card-heading">
            <h2 id="dispatch-title">
              Confirmar contato com{" "}
              {channel === "driver" ? "motorista" : "cliente"}
            </h2>
            <button
              className="icon-button"
              aria-label="Fechar prévia"
              title="Fechar prévia"
              disabled={busy}
              onClick={() => dialog.current?.close()}
            >
              <X size={18} />
            </button>
          </div>
          <dl>
            <dt>Destinatário</dt>
            <dd>
              {channel === "driver"
                ? selected.record.driverName
                : selected.record.customerName}
            </dd>
            <dt>WhatsApp</dt>
            <dd>+{selectedPhone}</dd>
            <dt>Envio / caso</dt>
            <dd>
              {selected.record.shipmentId} / {selected.case_id}
            </dd>
            <dt>Base</dt>
            <dd>{selected.record.baseKey || selected.record.sigla}</dd>
            <dt>Modelo</dt>
            <dd>{method}</dd>
            {channel === "client" && (
              <>
                <dt>Produto</dt>
                <dd>
                  {selected.record.products.map((p) => p.title).join(", ")}
                </dd>
                <dt>Entrega</dt>
                <dd>{when(selected.record.deliveryAt)}</dd>
              </>
            )}
          </dl>
          {notice && (
            <p className="notice error" role="alert">
              {notice}
            </p>
          )}
          <button
            className="primary"
            disabled={
              busy ||
              !access?.admin ||
              Boolean(previewBlock(channel, selected, current))
            }
            onClick={() => void send()}
          >
            <Send size={15} />
            {busy ? "Enfileirando..." : "Confirmar envio"}
          </button>
        </dialog>
      )}
    </main>
  );
}
