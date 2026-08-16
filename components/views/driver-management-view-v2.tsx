"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Ban, CheckCircle2, FileArchive, IdCard, KeyRound, MessageSquareWarning, RefreshCw, RotateCcwKey, Search, ShieldCheck, UploadCloud, UsersRound, X } from "lucide-react";
import { driverManagementTabsForProfile, type DriverManagementTab } from "@/lib/access-control";
import { ROLE_LABELS, type AuthProfile } from "@/lib/auth";
import { formatCurrency, formatNumber, KpiCard, Panel, PageIntro, StatusBadge } from "@/components/ui";
import { TableWrap } from "./shared";
import styles from "./driver-management-view-v2.module.css";

interface BaseRow { base_key: string; base_name?: string; sigla?: string }
interface DriverRow {
  id: string; driverCode: string; fullName: string; baseKey: string; baseName?: string; sigla?: string;
  status: string; portalStatus?: string; portalEligible?: boolean; operationalStatus?: string;
  lastSeenAt?: string; lastOperationalSeenAt?: string; quality?: string; lastActivitySource?: string; pilotCandidate?: boolean;
}
interface TicketRow { id: string; type: string; operationalId: string; routeId?: string; driverName: string; driverCode: string; baseKey: string; baseName: string; date?: string; value: number; status: string }
interface VersionRow { id?: string; status?: string; version_number?: number }
interface DocumentRow {
  id: string; batch_id?: string; title: string; issue?: string; base_key?: string; period?: string; status: string; created_at?: string;
  alc_drivers?: { driver_code?: string; full_name?: string; base_key?: string; sigla?: string } | null;
  driver_payment_document_versions?: VersionRow[];
}
interface DisputeRow { id: string; driver_id: string; document_id: string; base_key?: string; reason: string; reference?: string; status: string; decision?: string; alc_drivers?: { driver_code?: string; full_name?: string }; driver_payment_documents?: { title?: string } }
interface AssignmentRow { id: string; admin_id: string; base_key: string; active: boolean; updated_at?: string; created_at: string; profiles?: { full_name?: string; email?: string; role?: string }; operational_bases?: { base_name?: string; sigla?: string } }
interface Payload {
  access?: { tabs?: DriverManagementTab[]; bases?: string[] | null; role?: string };
  bases?: BaseRow[]; drivers?: DriverRow[]; tickets?: TicketRow[]; documents?: DocumentRow[]; disputes?: DisputeRow[]; assignments?: AssignmentRow[];
}
interface ReviewBatch { batchId: string; counts: { identified: number; unidentified: number; duplicate: number; error: number } }

const TAB_LABELS: Record<DriverManagementTab, string> = {
  overview: "Visão geral", pilot: "Piloto do Portal", drivers: "Motoristas", tickets: "Pendências",
  payments: "Pagamentos", disputes: "Contestações", admins: "Administrativos e bases",
};
const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho", published: "Publicado", unidentified: "Não identificado", duplicate: "Duplicado", error: "Erro",
  active: "Ativo", inactive: "Inativo", unknown: "Não definido", not_activated: "Não ativado", blocked: "Bloqueado",
  pending_activation: "Aguardando ativação", resolved: "Resolvido", needs_review: "Revisar", conflict: "Conflito",
  aberta: "Aberta", em_analise: "Em análise", aguardando_informacao: "Aguardando informação", deferida: "Deferida",
  indeferida: "Indeferida", pdf_em_correcao: "PDF em correção", concluida: "Concluída",
};

function labelStatus(value: string) { return STATUS_LABELS[value] ?? value.replaceAll("_", " "); }
function badgeTone(status: string) {
  if (["published", "active", "concluida", "deferida", "resolved"].includes(status)) return "green";
  if (["draft", "review", "aberta", "em_analise", "pending_activation", "needs_review", "unidentified"].includes(status)) return "amber";
  if (["error", "blocked", "indeferida", "conflict"].includes(status)) return "red";
  return "neutral";
}
async function readJson(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || fallback);
  return body;
}
function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "").toUpperCase();
}
function expectedNameFromFile(title: string) {
  return normalize(title.replace(/\.pdf$/i, "").replace(/[_\s-]+\d{2}[-_]\d{2}[-_](?:\d{2}|20\d{2})$/i, "").replace(/_/g, " "));
}

export function DriverManagementViewV2({ profile }: { profile: AuthProfile }) {
  const allowedTabs = useMemo(() => driverManagementTabsForProfile(profile), [profile]);
  const [tab, setTab] = useState<DriverManagementTab>(allowedTabs[0] ?? "payments");
  const [data, setData] = useState<Payload>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [lastBatch, setLastBatch] = useState<ReviewBatch | null>(null);
  const [paymentFilters, setPaymentFilters] = useState({ base: "Todas", status: "Todos", search: "" });
  const [identifyDoc, setIdentifyDoc] = useState<DocumentRow | null>(null);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState("");

  async function loadTab(target: DriverManagementTab) {
    setLoading(true);
    setMessage("");
    try {
      const body = await readJson(await fetch(`/api/driver-management?tab=${encodeURIComponent(target)}`, { cache: "no-store" }), "Falha ao carregar Gestão de Motoristas.");
      setData(body);
    } catch (error) {
      setData({});
      setMessage(error instanceof Error ? error.message : "Falha ao carregar Gestão de Motoristas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadTab(tab); }, [tab]);

  const bases = data.bases ?? [];
  const drivers = data.drivers ?? [];
  const tickets = data.tickets ?? [];
  const documents = data.documents ?? [];
  const disputes = data.disputes ?? [];
  const assignments = data.assignments ?? [];
  const pilotCandidates = drivers.filter((driver) => driver.pilotCandidate);

  const baseLabel = (baseKey?: string) => {
    const base = bases.find((item) => item.base_key === baseKey);
    if (!base) return baseKey || "-";
    return `${base.sigla || base.base_key} - ${base.base_name || base.base_key}`;
  };

  async function uploadArchive(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true); setMessage("");
    try {
      const form = new FormData(); form.set("file", file);
      const body = await readJson(await fetch("/api/driver-documents/import", { method: "POST", body: form }), "Falha ao importar documentos.");
      setLastBatch(body);
      setMessage(`Lote processado: ${body.counts?.identified ?? 0} identificado(s), ${body.counts?.unidentified ?? 0} pendente(s).`);
      if (tab === "payments") await loadTab("payments"); else setTab("payments");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao importar documentos."); }
    finally { setUploading(false); event.target.value = ""; }
  }

  async function publishDocuments(documentIds: string[]) {
    if (!documentIds.length) return;
    if (!window.confirm(`Publicar ${documentIds.length} PDF(s) identificado(s) para os motoristas?`)) return;
    try {
      const body = await readJson(await fetch("/api/driver-documents/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentIds }) }), "Falha ao publicar PDFs.");
      setMessage(`${body.published} PDF(s) publicado(s).`); setLastBatch(null); await loadTab("payments");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao publicar PDFs."); }
  }

  async function identifyDriver() {
    if (!identifyDoc || !selectedDriverId) return;
    try {
      await readJson(await fetch("/api/driver-documents/identify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: identifyDoc.id, driverId: selectedDriverId }) }), "Falha ao identificar motorista.");
      setMessage("Motorista identificado. O PDF agora está pronto para publicação."); setIdentifyDoc(null); setSelectedDriverId(""); setCandidateSearch(""); await loadTab("payments");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao identificar motorista."); }
  }

  async function updateDispute(id: string, status: string) {
    let decision = "";
    if (status === "indeferida") decision = window.prompt("Informe a justificativa do indeferimento:") ?? "";
    if (status === "indeferida" && !decision) return;
    try {
      await readJson(await fetch("/api/driver-disputes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status, decision }) }), "Falha ao atualizar contestação.");
      setMessage("Contestação atualizada."); await loadTab("disputes");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao atualizar contestação."); }
  }

  async function updateDriverPortal(id: string, portalAction: string) {
    try {
      await readJson(await fetch("/api/driver-management", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "driver_portal", id, portalAction }) }), "Falha ao alterar acesso do motorista.");
      setMessage("Acesso do motorista atualizado."); await loadTab("drivers");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao alterar acesso do motorista."); }
  }

  const filteredDocuments = useMemo(() => documents.filter((doc) => {
    if (paymentFilters.base !== "Todas" && doc.base_key !== paymentFilters.base) return false;
    if (paymentFilters.status !== "Todos" && doc.status !== paymentFilters.status) return false;
    const query = paymentFilters.search.trim().toLowerCase();
    if (query && !`${doc.title} ${doc.alc_drivers?.full_name ?? ""} ${doc.alc_drivers?.driver_code ?? ""}`.toLowerCase().includes(query)) return false;
    return true;
  }), [documents, paymentFilters]);
  const publishable = filteredDocuments.filter((doc) => doc.status === "draft" && doc.alc_drivers?.driver_code);

  const candidates = useMemo(() => {
    if (!identifyDoc) return [];
    const expected = expectedNameFromFile(identifyDoc.title);
    const query = candidateSearch.trim().toLowerCase();
    return drivers
      .filter((driver) => /^\d+$/.test(driver.driverCode) && (!identifyDoc.base_key || driver.baseKey === identifyDoc.base_key))
      .filter((driver) => !query || `${driver.fullName} ${driver.driverCode}`.toLowerCase().includes(query))
      .sort((a, b) => Number(normalize(a.fullName) !== expected) - Number(normalize(b.fullName) !== expected) || a.fullName.localeCompare(b.fullName, "pt-BR"));
  }, [drivers, identifyDoc, candidateSearch]);

  return (
    <div className={styles.stack}>
      <PageIntro description="Pagamentos, contestações e operações do Portal do Motorista com acesso limitado por função e base." chips={[`Perfil: ${ROLE_LABELS[profile.role]}`, data.access?.bases === null ? "Todas as bases" : "Escopo por base"]} />
      {message ? <p className="admin-message">{message}</p> : null}
      <div className={styles.tabs}>
        {allowedTabs.map((item) => <button key={item} className={`${styles.tab} ${tab === item ? styles.tabActive : ""}`} onClick={() => setTab(item)}>{TAB_LABELS[item]}</button>)}
        <span className={styles.tabSpacer} />
        <button className="secondary-button primary-button--small" onClick={() => void loadTab(tab)} disabled={loading}><RefreshCw size={14} />Atualizar</button>
      </div>

      {loading ? <div className="view-loading"><span /><span /><span /></div> : null}

      {!loading && tab === "overview" ? <Overview bases={bases} drivers={drivers} tickets={tickets} documents={documents} disputes={disputes} /> : null}
      {!loading && tab === "pilot" ? <Pilot drivers={pilotCandidates} baseLabel={baseLabel} onAction={updateDriverPortal} /> : null}
      {!loading && tab === "drivers" ? <Drivers drivers={drivers} baseLabel={baseLabel} onAction={updateDriverPortal} /> : null}
      {!loading && tab === "tickets" ? <Tickets tickets={tickets} baseLabel={baseLabel} /> : null}
      {!loading && tab === "payments" ? (
        <div className={styles.stack}>
          <div className={styles.twoCol}>
            <Panel title="Importar PDFs de pagamento" subtitle="ZIP/RAR do DDS; a pasta define base e semana">
              <label className={styles.upload}><UploadCloud size={28} /><strong>{uploading ? "Processando lote..." : "Selecionar ZIP/RAR"}</strong><span>Ex.: BASE_BARUERI_02-08-26_A_08-08-26</span><input type="file" accept=".zip,.rar,application/zip,application/vnd.rar" disabled={uploading} onChange={uploadArchive} /></label>
            </Panel>
            <Panel title="Fluxo de publicação" subtitle="Somente PDFs vinculados a um ID numérico canônico são enviados">
              <div className={styles.callout}>Não identificados ficam em conferência. Use <strong>Identificar motorista</strong> para selecionar um motorista da mesma base; depois o documento vira rascunho e pode ser publicado.</div>
              {lastBatch ? <div className={styles.batchBar}><strong>Lote atual</strong><span>{lastBatch.counts.identified} identificados · {lastBatch.counts.unidentified} não identificados · {lastBatch.counts.duplicate} duplicados · {lastBatch.counts.error} erros</span></div> : null}
            </Panel>
          </div>
          <Panel title="Pagamentos" subtitle="Conferência e publicação dos PDFs">
            <div className={styles.toolbar}>
              <label className={styles.field}><span>Buscar</span><input className={styles.search} placeholder="Motorista, ID ou arquivo" value={paymentFilters.search} onChange={(event) => setPaymentFilters({ ...paymentFilters, search: event.target.value })} /></label>
              <label className={styles.field}><span>Base</span><select value={paymentFilters.base} onChange={(event) => setPaymentFilters({ ...paymentFilters, base: event.target.value })}><option>Todas</option>{bases.map((base) => <option key={base.base_key} value={base.base_key}>{baseLabel(base.base_key)}</option>)}</select></label>
              <label className={styles.field}><span>Status</span><select value={paymentFilters.status} onChange={(event) => setPaymentFilters({ ...paymentFilters, status: event.target.value })}><option>Todos</option><option value="draft">Rascunho</option><option value="unidentified">Não identificado</option><option value="published">Publicado</option><option value="duplicate">Duplicado</option><option value="error">Erro</option></select></label>
              <button className="primary-button primary-button--small" disabled={!publishable.length} onClick={() => void publishDocuments(publishable.map((doc) => doc.id))}><CheckCircle2 size={15} />Publicar identificados ({publishable.length})</button>
            </div>
            <TableWrap><thead><tr><th>Documento</th><th>Motorista</th><th>ID</th><th>Base</th><th>Período</th><th>Status</th><th>Versões</th><th className="align-right">Ações</th></tr></thead><tbody>
              {filteredDocuments.map((doc) => <tr key={doc.id}><td><div className={styles.nameCell}><strong>{doc.title}</strong>{doc.issue ? <small>{doc.issue}</small> : null}</div></td><td>{doc.alc_drivers?.full_name ?? "-"}</td><td className="mono">{doc.alc_drivers?.driver_code ?? "-"}</td><td>{baseLabel(doc.base_key)}</td><td>{doc.period ?? "-"}</td><td><StatusBadge tone={badgeTone(doc.status)}>{labelStatus(doc.status)}</StatusBadge></td><td>{doc.driver_payment_document_versions?.length ?? 0}</td><td className="align-right"><div className={styles.actions}>{doc.status === "draft" && doc.alc_drivers?.driver_code ? <button className="primary-button primary-button--small" onClick={() => void publishDocuments([doc.id])}>Publicar</button> : null}{["unidentified", "error"].includes(doc.status) ? <button className="secondary-button primary-button--small" onClick={() => { setIdentifyDoc(doc); setSelectedDriverId(""); setCandidateSearch(""); }}><Search size={14} />Identificar motorista</button> : null}{doc.status === "published" ? <StatusBadge tone="green">Enviado</StatusBadge> : null}</div></td></tr>)}
              {!filteredDocuments.length ? <tr><td colSpan={8}>Nenhum documento encontrado.</td></tr> : null}
            </tbody></TableWrap>
          </Panel>
        </div>
      ) : null}
      {!loading && tab === "disputes" ? <Disputes disputes={disputes} baseLabel={baseLabel} onUpdate={updateDispute} /> : null}
      {!loading && tab === "admins" ? <Assignments assignments={assignments} /> : null}

      {identifyDoc ? <div className={styles.modalBackdrop} role="dialog" aria-modal="true"><div className={styles.modal}><div className={styles.modalHeader}><div><h3>Identificar motorista</h3><p className={styles.permissionNote}>{identifyDoc.title} · {baseLabel(identifyDoc.base_key)}</p></div><button className="table-action" onClick={() => setIdentifyDoc(null)} title="Fechar"><X size={16} /></button></div><label className={styles.field}><span>Buscar por nome ou ID</span><input className={styles.search} autoFocus value={candidateSearch} onChange={(event) => setCandidateSearch(event.target.value)} placeholder="Digite o nome ou ID" /></label><div className={styles.candidateList}>{candidates.slice(0, 100).map((driver) => <button key={driver.id} className={`${styles.candidate} ${selectedDriverId === driver.id ? styles.candidateActive : ""}`} onClick={() => setSelectedDriverId(driver.id)}><div><strong>{driver.fullName}</strong><span>ID {driver.driverCode} · {baseLabel(driver.baseKey)}</span></div>{normalize(driver.fullName) === expectedNameFromFile(identifyDoc.title) ? <StatusBadge tone="green">Nome exato</StatusBadge> : null}</button>)}{!candidates.length ? <div className={styles.empty}>Nenhum motorista canônico encontrado nesta base.</div> : null}</div><div className={styles.actions}><button className="secondary-button" onClick={() => setIdentifyDoc(null)}>Cancelar</button><button className="primary-button" disabled={!selectedDriverId} onClick={() => void identifyDriver()}>Confirmar motorista</button></div></div></div> : null}
    </div>
  );
}

function Overview({ bases, drivers, tickets, documents, disputes }: { bases: BaseRow[]; drivers: DriverRow[]; tickets: TicketRow[]; documents: DocumentRow[]; disputes: DisputeRow[] }) {
  return <div className={styles.stack}><div className={styles.summary}><KpiCard label="Motoristas" value={formatNumber(drivers.length)} detail="cadastros no escopo" icon={<UsersRound size={18} />} /><KpiCard label="Candidatos piloto" value={formatNumber(drivers.filter((d) => d.pilotCandidate).length)} detail="ativos e confiáveis" icon={<KeyRound size={18} />} tone="green" /><KpiCard label="Pendências" value={formatNumber(tickets.length)} detail="tickets operacionais" icon={<IdCard size={18} />} tone="amber" /><KpiCard label="PDFs" value={formatNumber(documents.length)} detail="documentos de pagamento" icon={<FileArchive size={18} />} /><KpiCard label="Contestações" value={formatNumber(disputes.length)} detail="abertas e históricas" icon={<MessageSquareWarning size={18} />} /></div><Panel title="Carga por base" subtitle="Motoristas, pendências e contestações"><TableWrap><thead><tr><th>Base</th><th>Motoristas</th><th>Pendências</th><th>Contestações</th></tr></thead><tbody>{bases.filter((base) => base.base_key && base.base_key !== "#N/A").map((base) => <tr key={base.base_key}><td><strong>{base.sigla || base.base_key} - {base.base_name || base.base_key}</strong></td><td>{drivers.filter((d) => d.baseKey === base.base_key).length}</td><td>{tickets.filter((t) => t.baseKey === base.base_key).length}</td><td>{disputes.filter((d) => d.base_key === base.base_key).length}</td></tr>)}</tbody></TableWrap></Panel></div>;
}
function Pilot({ drivers, baseLabel, onAction }: { drivers: DriverRow[]; baseLabel: (base?: string) => string; onAction: (id: string, action: string) => Promise<void> }) { return <Panel title="Piloto do Portal" subtitle="Candidatos seguros para liberação manual"><TableWrap><thead><tr><th>Motorista</th><th>ID</th><th>Base</th><th>Última atividade</th><th>Qualidade</th><th className="align-right">Ações</th></tr></thead><tbody>{drivers.map((d) => <tr key={d.id}><td><strong>{d.fullName}</strong></td><td className="mono">{d.driverCode}</td><td>{baseLabel(d.baseKey)}</td><td>{d.lastOperationalSeenAt ? new Date(d.lastOperationalSeenAt).toLocaleDateString("pt-BR") : "-"}</td><td><StatusBadge tone={badgeTone(d.quality || "needs_review")}>{labelStatus(d.quality || "needs_review")}</StatusBadge></td><td className="align-right"><div className={styles.actions}><button className="table-action" title="Permitir portal" onClick={() => void onAction(d.id, "allow")}><KeyRound size={14} /></button><button className="table-action" title="Bloquear" onClick={() => void onAction(d.id, "block")}><Ban size={14} /></button></div></td></tr>)}</tbody></TableWrap></Panel>; }
function Drivers({ drivers, baseLabel, onAction }: { drivers: DriverRow[]; baseLabel: (base?: string) => string; onAction: (id: string, action: string) => Promise<void> }) { return <Panel title="Motoristas" subtitle="Cadastro operacional e acesso ao portal"><TableWrap><thead><tr><th>Motorista</th><th>ID</th><th>Base</th><th>Operação</th><th>Portal</th><th>Último acesso</th><th className="align-right">Ações</th></tr></thead><tbody>{drivers.map((d) => <tr key={d.id}><td><strong>{d.fullName}</strong></td><td className="mono">{d.driverCode}</td><td>{baseLabel(d.baseKey)}</td><td><StatusBadge tone={badgeTone(d.operationalStatus || d.status)}>{labelStatus(d.operationalStatus || d.status)}</StatusBadge></td><td><StatusBadge tone={badgeTone(d.portalStatus || "not_activated")}>{labelStatus(d.portalStatus || "not_activated")}</StatusBadge><small className="cell-subtitle">{d.portalEligible ? "Elegível" : "Não elegível"}</small></td><td>{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString("pt-BR") : "-"}</td><td className="align-right"><div className={styles.actions}><button className="table-action" title="Permitir" onClick={() => void onAction(d.id,"allow")}><KeyRound size={14}/></button><button className="table-action" title="Bloquear" onClick={() => void onAction(d.id,"block")}><Ban size={14}/></button><button className="table-action" title="Redefinir PIN" onClick={() => void onAction(d.id,"reset_pin")}><RotateCcwKey size={14}/></button><button className="table-action" title="Revogar sessões" onClick={() => void onAction(d.id,"revoke_sessions")}><ShieldCheck size={14}/></button></div></td></tr>)}</tbody></TableWrap></Panel>; }
function Tickets({ tickets, baseLabel }: { tickets: TicketRow[]; baseLabel: (base?: string) => string }) { return <Panel title="Pendências" subtitle="Pré-Fatura, PNR e Risco LM"><TableWrap><thead><tr><th>Tipo</th><th>Pacote</th><th>Rota</th><th>Motorista</th><th>Base</th><th>Data</th><th>Valor</th><th>Status</th></tr></thead><tbody>{tickets.map((t) => <tr key={t.id}><td>{labelStatus(t.type)}</td><td className="mono">{t.operationalId}</td><td className="mono">{t.routeId || "-"}</td><td>{t.driverName || t.driverCode}</td><td>{baseLabel(t.baseKey)}</td><td>{t.date ? new Date(t.date).toLocaleDateString("pt-BR") : "-"}</td><td>{formatCurrency(t.value)}</td><td><StatusBadge tone={badgeTone(t.status)}>{labelStatus(t.status)}</StatusBadge></td></tr>)}</tbody></TableWrap></Panel>; }
function Disputes({ disputes, baseLabel, onUpdate }: { disputes: DisputeRow[]; baseLabel: (base?: string) => string; onUpdate: (id: string, status: string) => Promise<void> }) { return <Panel title="Contestações" subtitle="Tratativas por base"><TableWrap><thead><tr><th>Motorista</th><th>ID</th><th>Documento</th><th>Base</th><th>Motivo</th><th>Status</th><th>Decisão</th><th className="align-right">Ações</th></tr></thead><tbody>{disputes.map((d) => <tr key={d.id}><td>{d.alc_drivers?.full_name ?? "-"}</td><td className="mono">{d.alc_drivers?.driver_code ?? "-"}</td><td>{d.driver_payment_documents?.title ?? d.document_id}</td><td>{baseLabel(d.base_key)}</td><td>{d.reason}<small className="cell-subtitle">{d.reference}</small></td><td><StatusBadge tone={badgeTone(d.status)}>{labelStatus(d.status)}</StatusBadge></td><td>{d.decision || "-"}</td><td className="align-right"><div className={styles.actions}><button className="secondary-button primary-button--small" onClick={() => void onUpdate(d.id,"em_analise")}>Em análise</button><button className="secondary-button primary-button--small" onClick={() => void onUpdate(d.id,"deferida")}>Deferir</button><button className="danger-button" onClick={() => void onUpdate(d.id,"indeferida")}>Indeferir</button></div></td></tr>)}{!disputes.length ? <tr><td colSpan={8}>Nenhuma contestação no escopo atual.</td></tr> : null}</tbody></TableWrap></Panel>; }
function Assignments({ assignments }: { assignments: AssignmentRow[] }) { return <Panel title="Administrativos e bases" subtitle="Equipe administrativa e designações atuais"><TableWrap><thead><tr><th>Administrativo</th><th>Cargo</th><th>Base</th><th>Status</th><th>Atualizado</th></tr></thead><tbody>{assignments.map((a) => <tr key={a.id}><td><strong>{a.profiles?.full_name || a.profiles?.email}</strong><small className="cell-subtitle">{a.profiles?.email}</small></td><td>{a.profiles?.role ? ROLE_LABELS[a.profiles.role as keyof typeof ROLE_LABELS] ?? a.profiles.role : "-"}</td><td>{a.operational_bases?.sigla || a.base_key} - {a.operational_bases?.base_name || a.base_key}</td><td><StatusBadge tone={a.active ? "green" : "amber"}>{a.active ? "Ativo" : "Removido"}</StatusBadge></td><td>{new Date(a.updated_at || a.created_at).toLocaleString("pt-BR")}</td></tr>)}</tbody></TableWrap></Panel>; }
