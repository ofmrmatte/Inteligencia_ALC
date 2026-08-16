"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, CircleSlash, Database, FileArchive, LockKeyhole, Save, Search, ShieldCheck, ShieldOff, ToggleLeft, ToggleRight, Trash2, UserPlus, UsersRound, X } from "lucide-react";
import { ROLE_LABELS, USER_ROLES, canManageImports, canManageUsers, hasFullAccess, type AuthProfile, type UserRole } from "@/lib/auth";
import { canManageDriverPortalBaseSettings } from "@/lib/driver-portal-base-access";
import { formatNumber, KpiCard, Panel, PageIntro, StatusBadge } from "@/components/ui";
import { useDashboardStore } from "@/lib/store";
import { TableWrap } from "./shared";

interface ManagedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  globalAccess: boolean;
  active: boolean;
  baseScope: string[];
  siglaScope: string[];
}

interface DriverPortalBaseRow {
  baseKey: string;
  baseName: string;
  sigla: string;
  enabled: boolean;
  status: "LIBERADO" | "BLOQUEADO";
  changedAt: string;
  changedBy: string;
  counts: {
    total: number;
    eligible: number;
    activated: number;
    blocked: number;
    activeSessions: number;
  };
}

interface DriverPortalBasePayload {
  summary: {
    bases: number;
    enabled: number;
    blocked: number;
    eligibleDrivers: number;
    activatedDrivers: number;
    blockedDrivers: number;
  };
  rows: DriverPortalBaseRow[];
}

type PortalBaseAction = { enabled: boolean; rows: DriverPortalBaseRow[] } | null;

const ROLE_DETAILS: Record<UserRole, string> = {
  admin: "Administração total",
  developer: "Desenvolvimento, usuários e dados",
  director: "Visão completa e gestão",
  supervisor: "Escopo supervisionado",
  coordinator: "Bases e motoristas vinculados",
  super_admin: "Gestão total do painel e portal",
  driver: "Portal externo individual",
};

export function SettingsView({ profile }: { profile: AuthProfile }) {
  const data = useDashboardStore((state) => state.data);
  const fullAccess = hasFullAccess(profile);
  const canImport = canManageImports(profile);
  const canUsers = canManageUsers(profile);
  const canPortalBases = canManageDriverPortalBaseSettings(profile);
  const rows = [
    { area: "Autenticação", status: "Supabase Auth", owner: "ADM", detail: "Login por e-mail e senha com sessão protegida." },
    { area: "Importações", status: canImport ? "Liberado" : "Restrito", owner: "Diretor / ADM / Dev", detail: "Somente perfis com acesso total confirmam lotes oficiais." },
    { area: "Escopo", status: fullAccess ? "Acesso total" : "RLS por base/sigla", owner: "Banco", detail: fullAccess ? "Usuário liberado para todas as bases e siglas." : "Coordenadores e supervisores dependem do escopo cadastrado." },
    { area: "Usuários", status: canUsers ? "Liberado" : "Restrito", owner: "Diretor / ADM / Dev", detail: "Cadastro, alteração de cargo, acesso total e remoção pelo painel." },
  ];

  return (
    <div className="view-stack">
      <PageIntro description="Central de parâmetros administrativos da Inteligência ALC, alinhada ao controle de perfis e rastreabilidade dos lotes." chips={[`Perfil atual: ${ROLE_LABELS[profile.role]}`, fullAccess ? "Acesso total" : "Consulta operacional"]} />
      <div className="kpi-grid kpi-grid--four">
        <KpiCard label="Perfil atual" value={ROLE_LABELS[profile.role]} detail={fullAccess ? "Sem restrição por escopo" : "Permissão da sessão"} icon={<ShieldCheck size={19} />} tone={fullAccess ? "red" : "neutral"} />
        <KpiCard label="Importações" value={canImport ? "Ativas" : "Restritas"} detail="Diretor/ADM" icon={<FileArchive size={19} />} tone={canImport ? "green" : "amber"} />
        <KpiCard label="Lotes online" value={formatNumber(data.imports.length)} detail="Supabase" icon={<Database size={19} />} />
        <KpiCard label="RLS" value="Ativo" detail="Migração Supabase" icon={<LockKeyhole size={19} />} tone="green" />
      </div>
      <Panel title="Controles administrativos" subtitle="Situação dos blocos de configuração">
        <TableWrap>
          <thead><tr><th>Área</th><th>Status</th><th>Responsável</th><th>Detalhe</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.area}><td><strong>{row.area}</strong></td><td><StatusBadge tone={row.status === "Restrito" ? "amber" : "green"}>{row.status}</StatusBadge></td><td>{row.owner}</td><td>{row.detail}</td></tr>)}</tbody>
        </TableWrap>
      </Panel>
      {canPortalBases ? <DriverPortalBaseAccessPanel /> : null}
      {canUsers ? <UserManagementPanel currentUserId={profile.id} /> : null}
      <Panel title="Perfis previstos" subtitle="Separação operacional do painel">
        <div className="settings-role-grid">
          {USER_ROLES.map((role) => <div key={role}><UsersRound size={18} /><strong>{ROLE_LABELS[role]}</strong><span>{ROLE_DETAILS[role]}</span></div>)}
        </div>
      </Panel>
    </div>
  );
}

function formatDateTime(value: string) {
  if (!value) return "Nunca";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function DriverPortalBaseAccessPanel() {
  const [payload, setPayload] = useState<DriverPortalBasePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"Todas" | "Liberadas" | "Bloqueadas">("Todas");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmAction, setConfirmAction] = useState<PortalBaseAction>(null);

  async function loadBases() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/settings/driver-portal-bases", { cache: "no-store" });
      const nextPayload = await response.json();
      if (!response.ok) throw new Error(nextPayload.error ?? "Falha ao carregar bases.");
      setPayload(nextPayload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao carregar bases.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadBases();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const rows = useMemo(() => payload?.rows ?? [], [payload?.rows]);
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "Liberadas" && !row.enabled) return false;
      if (filter === "Bloqueadas" && row.enabled) return false;
      if (!query) return true;
      return `${row.baseKey} ${row.baseName} ${row.sigla}`.toLowerCase().includes(query);
    });
  }, [filter, rows, search]);

  const selectedRows = rows.filter((row) => selected.has(row.baseKey));

  function toggleRow(baseKey: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(baseKey)) next.delete(baseKey);
      else next.add(baseKey);
      return next;
    });
  }

  function toggleAllVisible(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const row of visibleRows) {
        if (checked) next.add(row.baseKey);
        else next.delete(row.baseKey);
      }
      return next;
    });
  }

  async function submitAction(action: Exclude<PortalBaseAction, null>) {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/settings/driver-portal-bases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseKeys: action.rows.map((row) => row.baseKey), enabled: action.enabled }),
      });
      const nextPayload = await response.json();
      if (!response.ok) throw new Error(nextPayload.error ?? "Falha ao alterar bases.");
      setPayload(nextPayload);
      setSelected(new Set());
      setConfirmAction(null);
      setMessage(action.enabled ? "Portal liberado para as bases selecionadas." : "Portal bloqueado para as bases selecionadas.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao alterar bases.");
    } finally {
      setSaving(false);
    }
  }

  const summary = payload?.summary ?? { bases: 0, enabled: 0, blocked: 0, eligibleDrivers: 0, activatedDrivers: 0, blockedDrivers: 0 };

  return (
    <>
      <Panel
        title="PORTAL DOS MOTORISTAS"
        subtitle="Controle a liberação do Portal do Motorista por base operacional."
        action={<StatusBadge tone="blue">Master control</StatusBadge>}
      >
        <div className="kpi-grid kpi-grid--six portal-base-summary">
          <KpiCard label="Bases cadastradas" value={formatNumber(summary.bases)} detail="Operacionais" icon={<Database size={19} />} />
          <KpiCard label="Bases liberadas" value={formatNumber(summary.enabled)} detail="Portal ativo" icon={<CheckCircle2 size={19} />} tone="green" />
          <KpiCard label="Bases bloqueadas" value={formatNumber(summary.blocked)} detail="Padrão inicial" icon={<ShieldOff size={19} />} tone="amber" />
          <KpiCard label="Motoristas habilitados" value={formatNumber(summary.eligibleDrivers)} detail="portal_eligible=true" icon={<ToggleRight size={19} />} tone="green" />
          <KpiCard label="Motoristas com portal ativado" value={formatNumber(summary.activatedDrivers)} detail="PIN criado" icon={<ShieldCheck size={19} />} />
          <KpiCard label="Motoristas bloqueados" value={formatNumber(summary.blockedDrivers)} detail="Bloqueio individual" icon={<CircleSlash size={19} />} tone="red" />
        </div>

        <div className="portal-base-toolbar">
          <label className="portal-base-search">
            <Search size={15} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar base" />
          </label>
          <select value={filter} onChange={(event) => setFilter(event.target.value as "Todas" | "Liberadas" | "Bloqueadas")}>
            <option>Todas</option>
            <option>Liberadas</option>
            <option>Bloqueadas</option>
          </select>
          <button className="secondary-button primary-button--small" disabled={!selectedRows.length || saving} onClick={() => setConfirmAction({ enabled: true, rows: selectedRows })} type="button">
            <ToggleRight size={15} />Liberar selecionadas
          </button>
          <button className="danger-button" disabled={!selectedRows.length || saving} onClick={() => setConfirmAction({ enabled: false, rows: selectedRows })} type="button">
            <ToggleLeft size={15} />Bloquear selecionadas
          </button>
        </div>

        {message ? <p className="admin-message">{message}</p> : null}

        <TableWrap>
          <thead>
            <tr>
              <th><input checked={visibleRows.length > 0 && visibleRows.every((row) => selected.has(row.baseKey))} onChange={(event) => toggleAllVisible(event.target.checked)} type="checkbox" aria-label="Selecionar bases visíveis" /></th>
              <th>Base</th><th>Nome</th><th>Sigla</th><th>Status do Portal</th><th>Motoristas</th><th>Habilitados</th><th>Ativados</th><th>Bloqueados</th><th>Última alteração</th><th>Alterado por</th><th className="align-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={12}>Carregando bases...</td></tr> : visibleRows.map((row) => (
              <tr key={row.baseKey}>
                <td><input checked={selected.has(row.baseKey)} onChange={() => toggleRow(row.baseKey)} type="checkbox" aria-label={`Selecionar ${row.baseKey}`} /></td>
                <td><strong className="mono">{row.baseKey}</strong></td>
                <td><strong>{row.baseName}</strong></td>
                <td className="mono">{row.sigla || "-"}</td>
                <td><StatusBadge tone={row.enabled ? "green" : "amber"}><span className={`portal-status-dot portal-status-dot--${row.enabled ? "green" : "amber"}`} />{row.status}</StatusBadge></td>
                <td>{formatNumber(row.counts.total)}</td>
                <td>{formatNumber(row.counts.eligible)}</td>
                <td>{formatNumber(row.counts.activated)}</td>
                <td>{formatNumber(row.counts.blocked)}</td>
                <td>{formatDateTime(row.changedAt)}</td>
                <td>{row.changedBy || "-"}</td>
                <td className="align-right">
                  <button className={row.enabled ? "danger-button" : "primary-button primary-button--small"} disabled={saving} onClick={() => setConfirmAction({ enabled: !row.enabled, rows: [row] })} type="button">
                    {row.enabled ? <><ToggleLeft size={15} />Bloquear Portal</> : <><ToggleRight size={15} />Liberar Portal</>}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Panel>
      {confirmAction ? (
        <div className="confirm-backdrop" role="dialog" aria-modal="true">
          <div className="confirm-modal">
            <button className="table-action confirm-modal__close" onClick={() => setConfirmAction(null)} type="button" title="Cancelar"><X size={15} /></button>
            <h3>{confirmAction.enabled ? "LIBERAR PORTAL" : "BLOQUEAR PORTAL"} PARA {confirmAction.rows.length === 1 ? confirmAction.rows[0].baseKey : `${confirmAction.rows.length} BASES`}?</h3>
            <div className="confirm-stats">
              <span>Motoristas cadastrados <strong>{formatNumber(confirmAction.rows.reduce((sum, row) => sum + row.counts.total, 0))}</strong></span>
              {confirmAction.enabled ? (
                <span>Motoristas que serão habilitados <strong>{formatNumber(confirmAction.rows.reduce((sum, row) => sum + Math.max(0, row.counts.total - row.counts.blocked), 0))}</strong></span>
              ) : (
                <span>Sessões ativas que serão revogadas <strong>{formatNumber(confirmAction.rows.reduce((sum, row) => sum + row.counts.activeSessions, 0))}</strong></span>
              )}
              <span>Motoristas bloqueados individualmente <strong>{formatNumber(confirmAction.rows.reduce((sum, row) => sum + row.counts.blocked, 0))}</strong></span>
            </div>
            <p>{confirmAction.enabled ? "Os motoristas elegíveis desta base poderão realizar o primeiro acesso ou entrar com seu PIN." : "Os motoristas desta base perderão acesso ao portal imediatamente. PINs, documentos e histórico serão preservados."}</p>
            <div className="confirm-actions">
              <button className="secondary-button" disabled={saving} onClick={() => setConfirmAction(null)} type="button">Cancelar</button>
              <button className={confirmAction.enabled ? "primary-button" : "danger-button"} disabled={saving} onClick={() => void submitAction(confirmAction)} type="button">
                {confirmAction.enabled ? "Liberar Portal" : "Bloquear Portal"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function blankForm() {
  return { email: "", fullName: "", password: "", role: "coordinator" as UserRole, globalAccess: false, active: true, baseScope: "", siglaScope: "" };
}

function UserManagementPanel({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [form, setForm] = useState(blankForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function loadUsers() {
      try {
        const response = await fetch("/api/users", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Falha ao carregar usuários.");
        if (active) setUsers(payload.users ?? []);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "Falha ao carregar usuários.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadUsers();
    return () => {
      active = false;
    };
  }, []);

  function patchLocal(id: string, changes: Partial<ManagedUser>) {
    setUsers((current) => current.map((user) => user.id === id ? { ...user, ...changes } : user));
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("new");
    setMessage("");
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          baseScope: form.baseScope.split(","),
          siglaScope: form.siglaScope.split(","),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Falha ao cadastrar usuário.");
      setUsers(payload.users ?? []);
      setForm(blankForm());
      setMessage("Usuário cadastrado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao cadastrar usuário.");
    } finally {
      setSaving("");
    }
  }

  async function saveUser(user: ManagedUser) {
    setSaving(user.id);
    setMessage("");
    try {
      const response = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Falha ao atualizar usuário.");
      setUsers(payload.users ?? []);
      setMessage("Usuário atualizado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao atualizar usuário.");
    } finally {
      setSaving("");
    }
  }

  async function removeUser(user: ManagedUser) {
    if (!window.confirm(`Remover ${user.email}?`)) return;
    setSaving(user.id);
    setMessage("");
    try {
      const response = await fetch(`/api/users?id=${encodeURIComponent(user.id)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Falha ao remover usuário.");
      setUsers(payload.users ?? []);
      setMessage("Usuário removido.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao remover usuário.");
    } finally {
      setSaving("");
    }
  }

  return (
    <Panel title="Gestão de usuários" subtitle="Cadastro, cargo e acesso total">
      <form className="user-admin-form" onSubmit={createUser}>
        <label><span>E-mail</span><input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} type="email" required placeholder="usuario@alc.com.br" /></label>
        <label><span>Nome</span><input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} placeholder="Nome do usuário" /></label>
        <label><span>Senha inicial</span><input value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} type="password" required placeholder="mín. 6 caracteres" /></label>
        <label><span>Cargo</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}>{USER_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></label>
        <label><span>Siglas</span><input value={form.siglaScope} onChange={(event) => setForm({ ...form, siglaScope: event.target.value })} placeholder="SMG1, SMG2" /></label>
        <label><span>Bases</span><input value={form.baseScope} onChange={(event) => setForm({ ...form, baseScope: event.target.value })} placeholder="Base A, Base B" /></label>
        <label className="check-control"><input checked={form.globalAccess} onChange={(event) => setForm({ ...form, globalAccess: event.target.checked })} type="checkbox" /><span>Acesso total</span></label>
        <button className="primary-button primary-button--small" disabled={saving === "new"} type="submit"><UserPlus size={16} />Cadastrar</button>
      </form>
      {message ? <p className="admin-message">{message}</p> : null}
      <TableWrap>
        <thead><tr><th>Usuário</th><th>Cargo</th><th>Acesso</th><th>Status</th><th className="align-right">Ações</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={5}>Carregando usuários...</td></tr> : users.map((user) => (
            <tr key={user.id}>
              <td><strong>{user.fullName || user.email}</strong><span className="cell-subtitle">{user.email}</span></td>
              <td><select className="inline-select" value={user.role} onChange={(event) => patchLocal(user.id, { role: event.target.value as UserRole })}>{USER_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></td>
              <td><label className="mini-check"><input checked={user.globalAccess} onChange={(event) => patchLocal(user.id, { globalAccess: event.target.checked })} type="checkbox" />Total</label></td>
              <td><label className="mini-check"><input checked={user.active} onChange={(event) => patchLocal(user.id, { active: event.target.checked })} type="checkbox" />Ativo</label></td>
              <td className="align-right">
                <div className="row-actions">
                  <button className="table-action" disabled={saving === user.id} onClick={() => saveUser(user)} type="button" title="Salvar"><Save size={14} /></button>
                  <button className="table-action" disabled={saving === user.id || user.id === currentUserId} onClick={() => removeUser(user)} type="button" title="Remover"><Trash2 size={14} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </Panel>
  );
}
