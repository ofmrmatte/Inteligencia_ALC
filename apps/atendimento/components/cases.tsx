"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { api, useData, labels, when } from "./data";
import type { CaseRecord } from "@/lib/domain";
import { request } from "./collector";
type Row = {
  case_id: string;
  competence: string;
  classification: string;
  source_at: string;
  record: CaseRecord;
};
export function Cases() {
  const dialog = useRef<HTMLDialogElement>(null);
  const { data, error, refresh } = useData<{
      records: Row[];
      competence: string;
    }>("cases", 30_000),
    { data: profile } = useData<{ admin: boolean }>("profile");
  const [candidate, setCandidate] = useState<{
    shipmentId: string;
    name: string;
    phone: string;
    document?: string;
    address?: string;
    sourceUrl: string;
  } | null>(null);
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("current"),
    [selected, setSelected] = useState<Row | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
  }, [selected]);
  const rows = (data?.records || []).filter(
    (r) =>
      (filter === "all" || filter === "closed"
        ? filter === "all" || r.classification === "encerrada"
        : filter === "current"
          ? r.competence === data?.competence
          : r.classification === filter) &&
      `${r.record.shipmentId} ${r.record.driverName} ${r.record.baseKey} ${r.case_id}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function dispatch(channel: "driver" | "client") {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await api<{ queued: boolean }>("dispatch", {
        caseId: selected.case_id,
        channel,
      });
      setNotice(
        result.queued
          ? "Modelo colocado na fila de envio."
          : "Esse contato já foi realizado para a PNR.",
      );
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function contact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("customer", {
        caseId: selected?.case_id,
        name: form.get("name"),
        phone: form.get("phone"),
        verified: true,
        ...(candidate
          ? {
              document: candidate.document || "",
              address: candidate.address || "",
              sourceUrl: candidate.sourceUrl,
            }
          : {}),
      });
      setNotice("Contato validado e registrado.");
      await refresh();
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  return (
    <main className="page">
      <div className="page-title">
        <div>
          <p className="eyebrow">GESTÃO DE CASOS</p>
          <h1>PNRs</h1>
          <p className="muted">
            Classificação, dados coletados e histórico de cada envio.
          </p>
        </div>
        <span className="badge">
          {data?.competence || "Competência vigente"}
        </span>
      </div>
      {error ? <p className="notice error">{error}</p> : null}
      <div className="toolbar">
        <input
          aria-label="Pesquisar PNR"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Envio, motorista, base ou caso"
        />
        <select
          aria-label="Filtrar PNRs"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="current">Competência vigente</option>
          <option value="aguardando_comprovante">Aguardando comprovante</option>
          <option value="penalidade">Com penalidade</option>
          <option value="closed">Encerradas</option>
          <option value="all">Histórico armazenado</option>
        </select>
        <span>{rows.length} casos</span>
      </div>
      <div className="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>Envio / caso</th>
              <th>Motorista</th>
              <th>Base</th>
              <th>Classificação</th>
              <th>Competência</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 500).map((r) => (
              <tr key={r.case_id}>
                <td>
                  <strong>{r.record.shipmentId}</strong>
                  <small>Caso {r.case_id}</small>
                </td>
                <td>{r.record.driverName || "Aguardando coleta"}</td>
                <td>{r.record.baseKey || r.record.sigla}</td>
                <td>
                  <span className={`badge ${r.classification}`}>
                    {labels[r.classification]}
                  </span>
                </td>
                <td>{r.competence}</td>
                <td>
                  <button
                    onClick={() => {
                      setSelected(r);
                      setNotice("");
                      setCandidate(null);
                    }}
                  >
                    Detalhes <ArrowRight size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? (
          <div className="empty">
            <h3>Nenhuma PNR neste filtro</h3>
            <p>As informações aparecem após a coleta do Case Center.</p>
          </div>
        ) : null}
      </div>
      {selected ? (
        <dialog
          ref={dialog}
          className="modal"
          aria-label="Detalhes da PNR"
          onClose={() => setSelected(null)}
        >
          <div className="card-heading">
            <h2>Envio {selected.record.shipmentId}</h2>
            <button
              className="icon-button"
              onClick={() => dialog.current?.close()}
              aria-label="Fechar detalhes"
            >
              <X size={18} />
            </button>
          </div>
          <dl>
            <dt>Motorista / base</dt>
            <dd>
              {selected.record.driverName} · {selected.record.baseKey}
            </dd>
            <dt>Classificação</dt>
            <dd>{labels[selected.classification]}</dd>
            <dt>Cliente</dt>
            <dd>{selected.record.customerName || "Nome ainda não coletado"}</dd>
            <dt>Telefone do cliente</dt>
            <dd>
              {selected.record.customerPhone ||
                "Pendente de complemento e validação"}
            </dd>
            <dt>CPF / documento do comprador</dt>
            <dd>
              {selected.record.customerDocument ||
                candidate?.document ||
                "Não coletado"}
            </dd>
            <dt>Endereço do comprador</dt>
            <dd>
              {selected.record.customerAddress ||
                candidate?.address ||
                "Não coletado"}
            </dd>
            <dt>Produto</dt>
            <dd>
              {selected.record.products.map((p) => p.title).join(", ") ||
                "Detalhes pendentes"}
            </dd>
            <dt>Entrega</dt>
            <dd>{when(selected.record.deliveryAt)}</dd>
            <dt>Atualização da fonte</dt>
            <dd>{when(selected.source_at)}</dd>
          </dl>
          {profile?.admin ? (
            <>
              <h3>Contato validado do cliente</h3>
              <button
                onClick={async () => {
                  try {
                    const data = await request<NonNullable<typeof candidate>>(
                      "READ_PACKAGE_CUSTOMER",
                    );
                    if (data.shipmentId !== selected.record.shipmentId)
                      throw new Error(
                        "O envio aberto em package-management não corresponde a esta PNR.",
                      );
                    setCandidate(data);
                    setNotice(
                      "Dados lidos. Confirme o comprador antes de salvar.",
                    );
                  } catch (e) {
                    setNotice((e as Error).message);
                  }
                }}
              >
                Ler comprador em package-management
              </button>
              <form
                key={candidate?.sourceUrl || selected.case_id}
                className="stack"
                onSubmit={contact}
              >
                <label>
                  Nome do comprador
                  <input
                    name="name"
                    defaultValue={
                      candidate?.name || selected.record.customerName
                    }
                    required
                  />
                </label>
                <label>
                  Telefone do comprador
                  <input
                    name="phone"
                    defaultValue={
                      candidate?.phone || selected.record.customerPhone
                    }
                    required
                  />
                </label>
                <label className="check">
                  <input type="checkbox" required />
                  Confirmei este contato na fonte autorizada do envio.
                </label>
                <button>Salvar contato</button>
              </form>
              <div className="actions">
                <button disabled={busy} onClick={() => dispatch("client")}>
                  Enviar modelo ao cliente
                </button>
                <button disabled={busy} onClick={() => dispatch("driver")}>
                  Notificar motorista
                </button>
              </div>
            </>
          ) : null}
          {notice ? (
            <p className="notice" role="status">
              {notice}
            </p>
          ) : null}
        </dialog>
      ) : null}
    </main>
  );
}
