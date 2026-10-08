"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, ChevronRight, X } from "lucide-react";
import { api, useData, labels, when } from "./data";
import { driverNotificationEligible, type CaseRecord } from "@/lib/domain";
import { request } from "./collector";
import { groupCasesByDriver } from "@/lib/driver-groups";
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
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(1),
    [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (selected) dialog.current?.showModal();
  }, [selected]);
  const rows = useMemo(() => (data?.records || []).filter(
    (r) =>
      (filter === "all" || filter === "closed"
        ? filter === "all" || r.classification === "encerrada"
        : filter === "current"
          ? r.competence === data?.competence
          : r.classification === filter) &&
      `${r.record.shipmentId} ${r.record.driverName} ${r.record.baseKey} ${r.record.sigla} ${r.record.driverId} ${r.case_id}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  ), [data?.records, data?.competence, filter, search]);
  const groups = useMemo(() => groupCasesByDriver(rows), [rows]);
  const groupsPerPage = 20;
  const pageCount = Math.max(1, Math.ceil(groups.length / groupsPerPage));
  const activePage = Math.min(page, pageCount);
  const visibleGroups = groups.slice(
    (activePage - 1) * groupsPerPage,
    activePage * groupsPerPage,
  );
  function toggleGroup(key: string) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function showDetails(row: Row) {
    setSelected(row);
    setNotice("");
    setCandidate(null);
  }
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
      <div className="page-tools">
          <p className="muted">
            Classificação, dados coletados e histórico de cada envio.
          </p>
        <span className="badge">
          {data?.competence || "Competência vigente"}
        </span>
      </div>
      {error ? <p className="notice error">{error}</p> : null}
      <div className="toolbar">
        <input
          aria-label="Pesquisar PNR"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Envio, motorista, base ou caso"
        />
        <select
          aria-label="Filtrar PNRs"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            setPage(1);
          }}
        >
          <option value="current">Competência vigente</option>
          <option value="aguardando_comprovante">Aguardando comprovante</option>
          <option value="penalidade">Com penalidade</option>
          <option value="closed">Encerradas</option>
          <option value="all">Histórico armazenado</option>
        </select>
        <span role="status">
          {groups.length} {groups.length === 1 ? "motorista" : "motoristas"} · {rows.length} {rows.length === 1 ? "PNR" : "PNRs"}
        </span>
      </div>
      {data && data.records.length >= 10000 ? (
        <p className="notice" role="status">
          A consulta retornou o limite de 10.000 registros. Alguns motoristas podem ter outras PNRs fora deste resultado.
        </p>
      ) : null}
      <div className="driver-groups">
        {visibleGroups.map((group, index) => {
          const isExpanded = expanded.has(group.key);
          const panelId = `driver-cases-${activePage}-${index}`;
          return (
            <section className="card driver-group" key={group.key}>
              <button
                type="button"
                className="driver-group-header"
                aria-expanded={isExpanded}
                aria-controls={panelId}
                onClick={() => toggleGroup(group.key)}
              >
                <span className="driver-group-name">
                  <strong>{group.name}</strong>
                  <small>{group.bases.join(", ") || "Base não identificada"}</small>
                </span>
                <span className="driver-group-count">
                  <strong>{group.rows.length}</strong>
                  <small>{group.rows.length === 1 ? "PNR" : "PNRs"}</small>
                </span>
                <span className="driver-group-status">
                  {group.counts.aguardando_comprovante > 0 ? (
                    <span className="badge aguardando_comprovante">{group.counts.aguardando_comprovante} aguardando comprovante</span>
                  ) : null}
                  {group.counts.penalidade > 0 ? (
                    <span className="badge penalidade">{group.counts.penalidade} com penalidade</span>
                  ) : null}
                  {group.counts.aberta > 0 ? (
                    <span className="badge">{group.counts.aberta} em revisão</span>
                  ) : null}
                  {group.counts.encerrada > 0 ? (
                    <span className="badge">{group.counts.encerrada} encerradas</span>
                  ) : null}
                </span>
                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </button>
              {isExpanded ? (
                <div className="table-wrap driver-case-table" id={panelId} role="region" aria-label={`PNRs de ${group.name}`}>
                  <table>
                    <thead>
                      <tr>
                        <th>Envio / caso</th>
                        <th>Base</th>
                        <th>Classificação</th>
                        <th>Competência</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row) => (
                        <tr key={row.case_id}>
                          <td>
                            <strong>{row.record.shipmentId}</strong>
                            <small>Caso {row.case_id}</small>
                          </td>
                          <td>{row.record.baseKey || row.record.sigla || "—"}</td>
                          <td>
                            <span className={`badge ${row.classification}`}>
                              {labels[row.classification] || "Em revisão"}
                            </span>
                          </td>
                          <td>{row.competence}</td>
                          <td>
                            <button type="button" onClick={() => showDetails(row)}>
                              Detalhes <ArrowRight size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          );
        })}
        {data && !rows.length ? (
          <div className="card empty">
            <h3>Nenhuma PNR neste filtro</h3>
            <p>As informações aparecem após a coleta do Case Center.</p>
          </div>
        ) : null}
      </div>
      {groups.length > groupsPerPage ? (
        <nav className="driver-pagination" aria-label="Paginação dos motoristas">
          <span>
            Motoristas {(activePage - 1) * groupsPerPage + 1}–{Math.min(activePage * groupsPerPage, groups.length)} de {groups.length}
          </span>
          <div className="actions">
            <button type="button" disabled={activePage === 1} onClick={() => setPage(activePage - 1)}>
              Anterior
            </button>
            <span>Página {activePage} de {pageCount}</span>
            <button type="button" disabled={activePage === pageCount} onClick={() => setPage(activePage + 1)}>
              Próxima
            </button>
          </div>
        </nav>
      ) : null}
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
                      { shipmentId: selected.record.shipmentId },
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
                <button
                  disabled={busy || !driverNotificationEligible(selected.classification)}
                  title={!driverNotificationEligible(selected.classification) ? "Esta classificação só pode ser consultada pelo motorista, sem disparo proativo." : undefined}
                  onClick={() => dispatch("driver")}
                >
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
