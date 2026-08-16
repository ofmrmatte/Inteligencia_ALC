"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Ban, CheckCircle2, ExternalLink, FileArchive, FileUp, IdCard, KeyRound, MessageSquareWarning, RefreshCw, RotateCcwKey, ShieldCheck, UploadCloud, UsersRound } from "lucide-react";
import { ROLE_LABELS, type AuthProfile } from "@/lib/auth";
import { formatCurrency, formatNumber, KpiCard, Panel, PageIntro, StatusBadge } from "@/components/ui";
import { TableWrap } from "./shared";

type Tab = "overview" | "pilot" | "drivers" | "tickets" | "payments" | "disputes" | "admins";
interface BaseRow { base_key: string; base_name?: string }
interface DriverRow {
  id: string;
  driverCode: string;
  fullName: string;
  baseKey: string;
  baseName?: string;
  sigla?: string;
  status: string;
  portalStatus?: string;
  portalEligible?: boolean;
  operationalStatus?: string;
  lastSeenAt?: string;
  lastOperationalSeenAt?: string;
  authUserId?: string;
  quality?: string;
  lastActivitySource?: string;
  pilotCandidate?: boolean;
}
interface TicketRow { id: string; type: string; operationalId: string; driverName: string; driverCode: string; baseKey: string; baseName: string; date?: string; value: number; status: string }
interface DocumentRow { id: string; title: string; issue?: string; base_key?: string; period?: string; status: string; alc_drivers?: { full_name?: string }; driver_payment_document_versions?: unknown[] }
interface DisputeRow { id: string; driver_id: string; document_id: string; base_key?: string; reason: string; reference?: string; status: string; decision?: string; alc_drivers?: { full_name?: string }; driver_payment_documents?: { title?: string } }
interface AssignmentRow { id: string; admin_id: string; base_key: string; active: boolean; updated_at?: string; created_at: string; profiles?: { full_name?: string; email?: string }; operational_bases?: { base_name?: string } }
interface DriverManagementPayload {
  access?: { superAdmin?: boolean; canManageUsers?: boolean; bases?: string[] | null };
  bases?: BaseRow[];
  drivers?: DriverRow[];
  tickets?: TicketRow[];
  documents?: DocumentRow[];
  disputes?: DisputeRow[];
  assignments?: AssignmentRow[];
}
interface ReviewBatch { batchId: string; counts: { identified: number; unidentified: number; duplicate: number; error: number } }

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Visão geral" },
  { id: "pilot", label: "Piloto do Portal" },
  { id: "drivers", label: "Motoristas" },
  { id: "tickets", label: "Pendências" },
  { id: "payments", label: "Pagamentos" },
  { id: "disputes", label: "Contestações" },
  { id: "admins", label: "Administrativos e bases" },
];

function readError(response: Response, fallback: string) {
  return response.json().then((body) => body.error || fallback).catch(() => fallback);
}

function badgeTone(status: string) {
  if (["published", "active", "concluida", "resolvido", "resolved"].includes(status)) return "green";
  if (["draft", "review", "aberta", "em_analise", "pending_activation", "partial", "needs_review"].includes(status)) return "amber";
  if (["error", "invalid", "blocked", "indeferida", "conflict"].includes(status)) return "red";
  return "neutral";
}

export function DriverManagementView({ profile }: { profile: AuthProfile }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<DriverManagementPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [filters, setFilters] = useState({ base: "Todas", status: "Todos", type: "Todos", driver: "" });
  const [uploading, setUploading] = useState(false);
  const [lastBatch, setLastBatch] = useState<ReviewBatch | null>(null);
  const visibleTabs = data?.access?.superAdmin ? TABS : TABS.filter((item) => item.id !== "admins");

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/driver-management", { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response, "Falha ao carregar gestão."));
      setData(await response.json());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao carregar gestão.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function loadInitial() {
      setLoading(true);
      setMessage("");
      try {
        const response = await fetch("/api/driver-management", { cache: "no-store" });
        if (!response.ok) throw new Error(await readError(response, "Falha ao carregar gestão."));
        const payload = await response.json();
        if (active) setData(payload);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "Falha ao carregar gestão.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadInitial();
    return () => {
      active = false;
    };
  }, []);

  const bases = useMemo(() => data?.bases ?? [], [data]);
  const drivers = useMemo(() => data?.drivers ?? [], [data]);
  const pilotCandidates = useMemo(() => drivers.filter((driver) => driver.pilotCandidate), [drivers]);
  const tickets = useMemo(() => data?.tickets ?? [], [data]);
  const documents = useMemo(() => data?.documents ?? [], [data]);
  const disputes = useMemo(() => data?.disputes ?? [], [data]);
  const assignments = useMemo(() => data?.assignments ?? [], [data]);

  const filteredTickets = useMemo(() => tickets.filter((ticket) => {
    if (filters.base !== "Todas" && ticket.baseKey !== filters.base) return false;
    if (filters.status !== "Todos" && ticket.status !== filters.status) return false;
    if (filters.type !== "Todos" && ticket.type !== filters.type) return false;
    if (filters.driver && !`${ticket.driverName} ${ticket.driverCode}`.toLowerCase().includes(filters.driver.toLowerCase())) return false;
    return true;
  }), [tickets, filters]);

  async function uploadArchive(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/driver-documents/import", { method: "POST", body: form });
      if (!response.ok) throw new Error(await readError(response, "Falha ao importar documentos."));
      const payload = await response.json();
      setLastBatch(payload);
      setTab("payments");
      await load();
      setMessage("Lote processado para conferência.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao importar documentos.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function publishBatch(batchId: string) {
    setMessage("");
    const response = await fetch("/api/driver-documents/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId }),
    });
    if (!response.ok) {
      setMessage(await readError(response, "Falha ao publicar lote."));
      return;
    }
    setMessage("PDFs identificados publicados.");
    setLastBatch(null);
    await load();
  }

  async function updateDispute(id: string, status: string, decision = "") {
    const response = await fetch("/api/driver-disputes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, decision }),
    });
    if (!response.ok) {
      setMessage(await readError(response, "Falha ao atualizar contestação."));
      return;
    }
    await load();
  }

  async function updateDriverPortal(id: string, portalAction: string) {
    const response = await fetch("/api/driver-management", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "driver_portal", id, portalAction }),
    });
    if (!response.ok) {
      setMessage(await readError(response, "Falha ao alterar acesso do motorista."));
      return;
    }
    await load();
  }

  const portalUrl = process.env.NEXT_PUBLIC_DRIVER_PORTAL_URL;

  return (
    <div className="view-stack">
      <PageIntro description="Gestão operacional do canal de motoristas, PDFs de pagamento, pendências e contestações vinculadas por base." chips={[`Perfil: ${ROLE_LABELS[profile.role]}`, data?.access?.superAdmin ? "Gestor geral" : "Escopo por base"]} />
      {message ? <p className="admin-message">{message}</p> : null}
      <div className="tab-strip">
        {visibleTabs.map((item) => <button key={item.id} className={tab === item.id ? "is-active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}
        <button className="secondary-button primary-button--small" onClick={() => void load()} disabled={loading}><RefreshCw size={14} />Atualizar</button>
      </div>
      <div className="kpi-grid kpi-grid--four">
        <KpiCard label="Motoristas" value={formatNumber(drivers.length)} detail="com cadastro ou vínculo operacional" icon={<UsersRound size={19} />} />
        <KpiCard label="Candidatos piloto" value={formatNumber(pilotCandidates.length)} detail="ativos, base e nome confiáveis" icon={<KeyRound size={19} />} tone="green" />
        <KpiCard label="Pendências" value={formatNumber(tickets.length)} detail="tickets operacionais projetados" icon={<IdCard size={19} />} tone="amber" />
        <KpiCard label="PDFs" value={formatNumber(documents.length)} detail="documentos de pagamento" icon={<FileArchive size={19} />} />
        <KpiCard label="Contestações" value={formatNumber(disputes.length)} detail="abertas e históricas" icon={<MessageSquareWarning size={19} />} tone={disputes.length ? "red" : "green"} />
      </div>

      {tab === "overview" ? (
        <div className="content-grid content-grid--wide">
          <Panel title="Carga por base" subtitle="Motoristas, pendências e contestações">
            <TableWrap><thead><tr><th>Base</th><th>Motoristas</th><th>Pendências</th><th>Contestações</th></tr></thead><tbody>
              {bases.map((base) => <tr key={base.base_key}><td><strong>{base.base_name || base.base_key}</strong><span className="cell-subtitle">{base.base_key}</span></td><td>{drivers.filter((driver) => driver.baseKey === base.base_key).length}</td><td>{tickets.filter((ticket) => ticket.baseKey === base.base_key).length}</td><td>{disputes.filter((dispute) => dispute.base_key === base.base_key).length}</td></tr>)}
            </tbody></TableWrap>
          </Panel>
          <Panel title="Importar PDFs de pagamento" subtitle="ZIP ou RAR para conferência antes da publicação">
            <label className="payment-upload">
              <UploadCloud size={22} />
              <strong>{uploading ? "Processando arquivo..." : "Selecionar ZIP/RAR"}</strong>
              <span>Pastas por base, período e motorista. PDFs sem identificação ficam em conferência.</span>
              <input type="file" accept=".zip,.rar,application/zip,application/vnd.rar" disabled={uploading} onChange={uploadArchive} />
            </label>
            {lastBatch ? <div className="review-box"><strong>Lote em conferência</strong><span>{lastBatch.counts.identified} identificados, {lastBatch.counts.unidentified} não identificados, {lastBatch.counts.duplicate} duplicados, {lastBatch.counts.error} inválidos.</span><button className="primary-button primary-button--small" onClick={() => void publishBatch(lastBatch.batchId)}><CheckCircle2 size={15} />Publicar identificados</button></div> : null}
          </Panel>
        </div>
      ) : null}

      {tab === "pilot" ? (
        <Panel title="Piloto do Portal" subtitle="Candidatos seguros para liberação manual pelo administrativo">
          <TableWrap><thead><tr><th>Motorista</th><th>ID</th><th>Base</th><th>Última atividade</th><th>Fonte</th><th>Qualidade</th><th>Portal</th><th className="align-right">Ações</th></tr></thead><tbody>
            {pilotCandidates.map((driver) => <tr key={driver.id}><td><strong>{driver.fullName}</strong></td><td className="mono">{driver.driverCode}</td><td>{driver.baseName || driver.baseKey}<span className="cell-subtitle">{driver.sigla || driver.baseKey}</span></td><td>{driver.lastOperationalSeenAt ? new Date(driver.lastOperationalSeenAt).toLocaleDateString("pt-BR") : "-"}</td><td>{driver.lastActivitySource || "-"}</td><td><StatusBadge tone={badgeTone(driver.quality || "needs_review")}>{driver.quality || "needs_review"}</StatusBadge></td><td><StatusBadge tone={badgeTone(driver.portalStatus || "not_activated")}>{driver.portalStatus || "not_activated"}</StatusBadge></td><td className="align-right"><div className="row-actions"><button className="table-action" title="Permitir portal" onClick={() => void updateDriverPortal(driver.id, "allow")}><KeyRound size={14} /></button><button className="table-action" title="Bloquear portal" onClick={() => void updateDriverPortal(driver.id, "block")}><Ban size={14} /></button><button className="table-action" title="Revogar sessões" onClick={() => void updateDriverPortal(driver.id, "revoke_sessions")}><ShieldCheck size={14} /></button></div></td></tr>)}
            {pilotCandidates.length === 0 ? <tr><td colSpan={8}>Nenhum candidato seguro no escopo atual.</td></tr> : null}
          </tbody></TableWrap>
        </Panel>
      ) : null}

      {tab === "drivers" ? (
        <Panel title="Motoristas" subtitle="Cadastro operacional e ativação do portal">
          <div className="panel-actions-row">
            {portalUrl ? <button className="secondary-button primary-button--small" onClick={() => window.open(portalUrl, "_blank", "noopener,noreferrer")}><ExternalLink size={14} />Abrir Portal do Motorista</button> : null}
          </div>
          <TableWrap><thead><tr><th>Motorista</th><th>ID</th><th>Base</th><th>Operação</th><th>Portal</th><th>Último acesso</th><th className="align-right">Ações</th></tr></thead><tbody>
            {drivers.map((driver) => <tr key={driver.id}><td><strong>{driver.fullName}</strong></td><td className="mono">{driver.driverCode}</td><td>{driver.baseName || driver.baseKey}</td><td><StatusBadge tone={badgeTone(driver.operationalStatus || driver.status)}>{driver.operationalStatus || driver.status}</StatusBadge></td><td><StatusBadge tone={badgeTone(driver.portalStatus || "not_activated")}>{driver.portalStatus || "not_activated"}</StatusBadge><small className="cell-subtitle">{driver.portalEligible ? "Elegível" : "Não elegível"}</small></td><td>{driver.lastSeenAt ? new Date(driver.lastSeenAt).toLocaleString("pt-BR") : "-"}<small className="cell-subtitle">{driver.lastOperationalSeenAt ? `Operação: ${new Date(driver.lastOperationalSeenAt).toLocaleDateString("pt-BR")}` : ""}</small></td><td className="align-right"><div className="row-actions"><button className="table-action" title="Permitir portal" onClick={() => void updateDriverPortal(driver.id, "allow")}><KeyRound size={14} /></button><button className="table-action" title="Bloquear portal" onClick={() => void updateDriverPortal(driver.id, "block")}><Ban size={14} /></button><button className="table-action" title="Redefinir PIN" onClick={() => void updateDriverPortal(driver.id, "reset_pin")}><RotateCcwKey size={14} /></button><button className="table-action" title="Revogar sessões" onClick={() => void updateDriverPortal(driver.id, "revoke_sessions")}><ShieldCheck size={14} /></button></div></td></tr>)}
          </tbody></TableWrap>
        </Panel>
      ) : null}

      {tab === "tickets" ? (
        <Panel title="Pendências" subtitle="Projeção unificada de Pré-Fatura, PNR e Risco LM" action={<div className="mini-filters"><select value={filters.base} onChange={(e) => setFilters({ ...filters, base: e.target.value })}><option>Todas</option>{bases.map((base) => <option key={base.base_key} value={base.base_key}>{base.base_name || base.base_key}</option>)}</select><input value={filters.driver} onChange={(e) => setFilters({ ...filters, driver: e.target.value })} placeholder="Motorista" /></div>}>
          <TableWrap><thead><tr><th>Tipo</th><th>ID</th><th>Motorista</th><th>Base</th><th>Data</th><th>Valor</th><th>Status</th></tr></thead><tbody>
            {filteredTickets.map((ticket) => <tr key={ticket.id}><td>{ticket.type.replaceAll("_", " ")}</td><td className="mono">{ticket.operationalId}</td><td>{ticket.driverName || ticket.driverCode}</td><td>{ticket.baseName || ticket.baseKey}</td><td>{ticket.date || "-"}</td><td>{formatCurrency(ticket.value)}</td><td><StatusBadge tone={badgeTone(ticket.status)}>{ticket.status.replaceAll("_", " ")}</StatusBadge></td></tr>)}
          </tbody></TableWrap>
        </Panel>
      ) : null}

      {tab === "payments" ? (
        <Panel title="Pagamentos" subtitle="PDFs publicados, rascunhos e itens pendentes de conferência">
          <TableWrap><thead><tr><th>Documento</th><th>Motorista</th><th>Base</th><th>Período</th><th>Status</th><th>Versões</th></tr></thead><tbody>
            {documents.map((doc) => <tr key={doc.id}><td><strong>{doc.title}</strong><span className="cell-subtitle">{doc.issue || doc.id}</span></td><td>{doc.alc_drivers?.full_name ?? "-"}</td><td>{doc.base_key ?? "-"}</td><td>{doc.period ?? "-"}</td><td><StatusBadge tone={badgeTone(doc.status)}>{doc.status}</StatusBadge></td><td>{doc.driver_payment_document_versions?.length ?? 0}</td></tr>)}
          </tbody></TableWrap>
        </Panel>
      ) : null}

      {tab === "disputes" ? (
        <Panel title="Contestações" subtitle="Decisões e histórico vinculados ao PDF visualizado">
          <TableWrap><thead><tr><th>Motorista</th><th>Documento</th><th>Motivo</th><th>Status</th><th>Decisão</th><th className="align-right">Ações</th></tr></thead><tbody>
            {disputes.map((dispute) => <tr key={dispute.id}><td>{dispute.alc_drivers?.full_name ?? dispute.driver_id}</td><td>{dispute.driver_payment_documents?.title ?? dispute.document_id}</td><td>{dispute.reason}<span className="cell-subtitle">{dispute.reference}</span></td><td><StatusBadge tone={badgeTone(dispute.status)}>{dispute.status}</StatusBadge></td><td>{dispute.decision || "-"}</td><td className="align-right"><div className="row-actions"><button className="table-action" title="Em análise" onClick={() => void updateDispute(dispute.id, "em_analise")}><ShieldCheck size={14} /></button><button className="table-action" title="PDF em correção" onClick={() => void updateDispute(dispute.id, "pdf_em_correcao")}><FileUp size={14} /></button></div></td></tr>)}
          </tbody></TableWrap>
        </Panel>
      ) : null}

      {tab === "admins" ? (
        <Panel title="Administrativos e bases" subtitle="Designações e histórico de escopo">
          <TableWrap><thead><tr><th>Administrativo</th><th>Base</th><th>Status</th><th>Atualizado</th></tr></thead><tbody>
            {assignments.map((assignment) => <tr key={assignment.id}><td><strong>{assignment.profiles?.full_name || assignment.profiles?.email}</strong><span className="cell-subtitle">{assignment.admin_id}</span></td><td>{assignment.operational_bases?.base_name || assignment.base_key}</td><td><StatusBadge tone={assignment.active ? "green" : "amber"}>{assignment.active ? "ativo" : "removido"}</StatusBadge></td><td>{new Date(assignment.updated_at || assignment.created_at).toLocaleString("pt-BR")}</td></tr>)}
          </tbody></TableWrap>
        </Panel>
      ) : null}
    </div>
  );
}
