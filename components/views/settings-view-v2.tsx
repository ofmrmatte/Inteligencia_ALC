"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Edit3,
  Save,
  Search,
  ShieldCheck,
  Smartphone,
  ToggleLeft,
  ToggleRight,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { roleDriverManagementCap, roleModuleCap, type DriverManagementTab } from "@/lib/access-control";
import { MANAGED_USER_ROLES, ROLE_LABELS, canManageUsers, type AuthProfile, type UserRole } from "@/lib/auth";
import { canManageDriverPortalBaseSettings } from "@/lib/driver-portal-base-access";
import { NAVIGATION, type SectionId } from "@/lib/navigation";
import { KpiCard, Panel, PageIntro, StatusBadge, formatNumber } from "@/components/ui";
import { TableWrap } from "./shared";
import styles from "./settings-view-v2.module.css";

interface BaseOption { baseKey: string; baseName: string; sigla: string; label: string }
interface ManagedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  globalAccess: boolean;
  active: boolean;
  baseScope: string[];
  moduleScope: string[];
  driverManagementScope: string[];
}
interface UsersPayload { users: ManagedUser[]; bases: BaseOption[] }
interface UserDraft {
  id?: string;
  email: string;
  fullName: string;
  password: string;
  role: UserRole;
  active: boolean;
  baseScope: string[];
  moduleScope: string[];
  driverManagementScope: string[];
}
interface PortalBaseRow {
  baseKey: string;
  baseName: string;
  sigla: string;
  enabled: boolean;
  status: "LIBERADO" | "BLOQUEADO";
  changedAt: string;
  changedBy: string;
  counts: { total: number; eligible: number; activated: number; blocked: number; activeSessions: number };
}
interface PortalPayload {
  summary: { bases: number; enabled: number; blocked: number; eligibleDrivers: number; activatedDrivers: number; blockedDrivers: number };
  rows: PortalBaseRow[];
}

type SettingsSection = "users" | "portal" | "hierarchy";

const MODULE_LABELS = new Map(NAVIGATION.map((item) => [item.id, item.label]));
const TAB_LABELS: Record<DriverManagementTab, string> = {
  overview: "Visão geral",
  pilot: "Piloto do Portal",
  drivers: "Motoristas",
  tickets: "Pendências",
  payments: "Pagamentos",
  disputes: "Contestações",
  admins: "Administrativos e bases",
};

const ROLE_DETAILS: Partial<Record<UserRole, string>> = {
  director: "Visão total do painel e de todas as bases.",
  developer: "Acesso técnico e administrativo total.",
  loss_supervisor: "Visão operacional total, sem Gestão de Motoristas.",
  administration_supervisor: "Toda a Gestão de Motoristas e todas as bases administrativas.",
  admin: "Somente Pagamentos e Contestações das bases atribuídas.",
  coordinator: "Somente módulos operacionais e bases coordenadas.",
  supervisor: "Somente módulos operacionais e bases supervisionadas.",
};

function isFullRole(role: UserRole) {
  return ["director", "developer"].includes(role);
}

function baseLabel(base: BaseOption) {
  return `${base.sigla} - ${base.baseName}`;
}

function blankDraft(): UserDraft {
  const role: UserRole = "coordinator";
  return {
    email: "",
    fullName: "",
    password: "",
    role,
    active: true,
    baseScope: [],
    moduleScope: roleModuleCap(role),
    driverManagementScope: roleDriverManagementCap(role),
  };
}

function roleChanged(draft: UserDraft, role: UserRole): UserDraft {
  return {
    ...draft,
    role,
    baseScope: isFullRole(role) || role === "loss_supervisor" || role === "administration_supervisor" ? [] : draft.baseScope,
    moduleScope: roleModuleCap(role),
    driverManagementScope: roleDriverManagementCap(role),
  };
}

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

async function readJson(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || fallback);
  return body;
}

export function SettingsViewV2({ profile }: { profile: AuthProfile }) {
  const sections = useMemo(() => {
    const next: Array<{ id: SettingsSection; title: string; description: string }> = [];
    if (canManageUsers(profile)) next.push({ id: "users", title: "Usuários e permissões", description: "Cargos, módulos e SVC/bases responsáveis" });
    if (canManageDriverPortalBaseSettings(profile)) next.push({ id: "portal", title: "Portal dos Motoristas", description: "Liberação e bloqueio por base" });
    next.push({ id: "hierarchy", title: "Hierarquia e regras", description: "Limites máximos de cada função" });
    return next;
  }, [profile]);

  const [activeSection, setActiveSection] = useState<SettingsSection>(() => sections[0]?.id ?? "hierarchy");

  useEffect(() => {
    if (!sections.some((section) => section.id === activeSection)) setActiveSection(sections[0]?.id ?? "hierarchy");
  }, [activeSection, sections]);

  return (
    <div className={styles.stack}>
      <PageIntro
        description="Permissões, bases e recursos administrativos organizados por categoria."
        chips={[`Perfil: ${ROLE_LABELS[profile.role]}`, "Controle de acesso centralizado"]}
      />

      <nav className={styles.settingsNav} aria-label="Categorias de configurações">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`${styles.navCard} ${activeSection === section.id ? styles.navCardActive : ""}`}
            onClick={() => setActiveSection(section.id)}
            aria-current={activeSection === section.id ? "page" : undefined}
          >
            <span className={styles.navIcon}>
              {section.id === "users" ? <UsersRound size={18} /> : section.id === "portal" ? <Smartphone size={18} /> : <ShieldCheck size={18} />}
            </span>
            <span className={styles.navText}><strong>{section.title}</strong><small>{section.description}</small></span>
          </button>
        ))}
      </nav>

      {activeSection === "users" && canManageUsers(profile) ? <UserManagementPanel currentUserId={profile.id} /> : null}
      {activeSection === "portal" && canManageDriverPortalBaseSettings(profile) ? <PortalBaseAccessPanel /> : null}
      {activeSection === "hierarchy" ? <HierarchyPanel /> : null}
    </div>
  );
}

function HierarchyPanel() {
  return (
    <Panel title="Hierarquia de acesso" subtitle="Regras máximas por função; permissões específicas nunca podem ultrapassar estes limites">
      <div className={styles.roleCards}>
        {MANAGED_USER_ROLES.map((role) => (
          <div className={styles.roleCard} key={role}>
            <div className={styles.roleCardHead}><ShieldCheck size={15} /><strong>{ROLE_LABELS[role]}</strong></div>
            <span>{ROLE_DETAILS[role] ?? "Escopo definido pela matriz de permissões."}</span>
            <div className={styles.roleMeta}>
              <span>{roleModuleCap(role).length} módulo(s)</span>
              {roleDriverManagementCap(role).length ? <span>{roleDriverManagementCap(role).length} aba(s) de motoristas</span> : <span>Sem Gestão de Motoristas</span>}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function UserManagementPanel({ currentUserId }: { currentUserId: string }) {
  const [payload, setPayload] = useState<UsersPayload>({ users: [], bases: [] });
  const [draft, setDraft] = useState<UserDraft>(blankDraft);
  const [editing, setEditing] = useState<UserDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    try {
      const body = await readJson(await fetch("/api/users", { cache: "no-store" }), "Falha ao carregar usuários.");
      setPayload({ users: body.users ?? [], bases: body.bases ?? [] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const body = await readJson(await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      }), "Falha ao cadastrar usuário.");
      setPayload({ users: body.users ?? [], bases: body.bases ?? [] });
      setDraft(blankDraft());
      setMessage("Usuário cadastrado com a matriz de acesso definida.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao cadastrar usuário.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    setMessage("");
    try {
      const body = await readJson(await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      }), "Falha ao atualizar usuário.");
      setPayload({ users: body.users ?? [], bases: body.bases ?? [] });
      setEditing(null);
      setMessage("Acesso do usuário atualizado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao atualizar usuário.");
    } finally {
      setSaving(false);
    }
  }

  async function removeUser(user: ManagedUser) {
    if (!window.confirm(`Remover ${user.email}?`)) return;
    setSaving(true);
    setMessage("");
    try {
      const body = await readJson(await fetch(`/api/users?id=${encodeURIComponent(user.id)}`, { method: "DELETE" }), "Falha ao remover usuário.");
      setPayload({ users: body.users ?? [], bases: body.bases ?? [] });
      setMessage("Usuário removido.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao remover usuário.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Usuários e permissões" subtitle="Cadastre pessoas, selecione módulos e delimite as SVCs/bases de responsabilidade; XPT é administrado separadamente">
      <form className={styles.stack} onSubmit={createUser}>
        <div className={styles.formGrid}>
          <label className={styles.field}><span>E-mail</span><input required type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="usuario@alc.com.br" /></label>
          <label className={styles.field}><span>Nome</span><input required value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} placeholder="Nome do usuário" /></label>
          <label className={styles.field}><span>Senha inicial</span><input required minLength={6} type="password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} placeholder="mín. 6 caracteres" /></label>
          <label className={styles.field}><span>Cargo</span><select value={draft.role} onChange={(event) => setDraft(roleChanged(draft, event.target.value as UserRole))}>{MANAGED_USER_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></label>
        </div>

        <div className={styles.roleSummary}>
          <span className={styles.roleSummaryIcon}><ShieldCheck size={18} /></span>
          <div><strong>{ROLE_LABELS[draft.role]}</strong><span>{ROLE_DETAILS[draft.role] ?? "Escopo definido pela matriz de permissões."}</span></div>
          <StatusBadge tone={isFullRole(draft.role) ? "green" : "neutral"}>{isFullRole(draft.role) ? "Acesso total" : "Acesso controlado"}</StatusBadge>
        </div>

        <AccessEditor draft={draft} setDraft={setDraft} bases={payload.bases} />
        <div className={styles.formActions}>
          <span>{draft.moduleScope.length} módulo(s) · {(isFullRole(draft.role) || draft.role === "loss_supervisor" || draft.role === "administration_supervisor") ? "todas as SVCs/bases permitidas pela função" : `${draft.baseScope.length} base(s)`}</span>
          <button className="primary-button primary-button--small" disabled={saving} type="submit"><UserPlus size={15} />Cadastrar usuário</button>
        </div>
      </form>

      {message ? <p className="admin-message">{message}</p> : null}

      <div className={styles.tableHeader}><div><strong>Usuários cadastrados</strong><span>{payload.users.length} conta(s) interna(s)</span></div></div>
      <TableWrap>
        <thead><tr><th>Usuário</th><th>Cargo</th><th>Módulos</th><th>SVC / Bases</th><th>Status</th><th className="align-right">Ações</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={6}>Carregando usuários...</td></tr> : payload.users.map((user) => (
            <tr key={user.id}>
              <td><strong>{user.fullName || user.email}</strong><span className="cell-subtitle">{user.email}</span></td>
              <td>{ROLE_LABELS[user.role]}</td>
              <td><div className={styles.badges}>{(isFullRole(user.role) ? ["Acesso total"] : user.moduleScope.map((id) => MODULE_LABELS.get(id as SectionId) ?? id)).slice(0, 3).map((label) => <span className={styles.badge} key={label}>{label}</span>)}{!isFullRole(user.role) && user.moduleScope.length > 3 ? <span className={styles.badge}>+{user.moduleScope.length - 3}</span> : null}</div></td>
              <td><div className={styles.badges}>{user.baseScope.slice(0, 2).map((baseKey) => { const base = payload.bases.find((item) => item.baseKey === baseKey); return <span className={styles.badge} key={baseKey}>{base ? baseLabel(base) : baseKey}</span>; })}{user.baseScope.length > 2 ? <span className={styles.badge}>+{user.baseScope.length - 2}</span> : null}{(isFullRole(user.role) || user.role === "loss_supervisor" || user.role === "administration_supervisor") ? <span className={styles.badge}>Todas</span> : null}</div></td>
              <td><StatusBadge tone={user.active ? "green" : "amber"}>{user.active ? "Ativo" : "Inativo"}</StatusBadge></td>
              <td className="align-right"><div className={styles.actions}><button className="table-action" type="button" title="Editar" onClick={() => setEditing({ ...user, password: "" })}><Edit3 size={14} /></button><button className="table-action" disabled={user.id === currentUserId || saving} type="button" title="Remover" onClick={() => void removeUser(user)}><Trash2 size={14} /></button></div></td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      {editing ? (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalHeader}><div><h3>Editar acesso</h3><p className={styles.muted}>{editing.fullName} · {editing.email}</p></div><button className="table-action" type="button" onClick={() => setEditing(null)} title="Fechar"><X size={16} /></button></div>
            <div className={styles.formGrid}>
              <label className={styles.field}><span>Nome</span><input value={editing.fullName} onChange={(event) => setEditing({ ...editing, fullName: event.target.value })} /></label>
              <label className={styles.field}><span>E-mail</span><input type="email" value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })} /></label>
              <label className={styles.field}><span>Nova senha</span><input type="password" value={editing.password} onChange={(event) => setEditing({ ...editing, password: event.target.value })} placeholder="deixe em branco para manter" /></label>
              <label className={styles.field}><span>Cargo</span><select value={editing.role} onChange={(event) => setEditing(roleChanged(editing, event.target.value as UserRole))}>{MANAGED_USER_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></label>
            </div>
            <div className={styles.roleSummary}><span className={styles.roleSummaryIcon}><ShieldCheck size={18} /></span><div><strong>{ROLE_LABELS[editing.role]}</strong><span>{ROLE_DETAILS[editing.role] ?? "Escopo definido pela matriz de permissões."}</span></div></div>
            <AccessEditor draft={editing} setDraft={setEditing} bases={payload.bases} />
            <label className={styles.checkItem}><input type="checkbox" checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} />Conta ativa</label>
            <div className={styles.modalActions}><button className="secondary-button" type="button" onClick={() => setEditing(null)}>Cancelar</button><button className="primary-button" disabled={saving} type="button" onClick={() => void saveEdit()}><Save size={15} />Salvar alterações</button></div>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function AccessEditor({ draft, setDraft, bases }: { draft: UserDraft; setDraft: (draft: UserDraft) => void; bases: BaseOption[] }) {
  const moduleCap = roleModuleCap(draft.role);
  const tabCap = roleDriverManagementCap(draft.role);
  const full = isFullRole(draft.role);
  const allBases = full || draft.role === "loss_supervisor" || draft.role === "administration_supervisor";
  const [baseSearch, setBaseSearch] = useState("");
  const visibleBases = bases.filter((base) => `${base.sigla} ${base.baseName} ${base.baseKey}`.toLowerCase().includes(baseSearch.toLowerCase()));

  const setAllModules = () => setDraft({ ...draft, moduleScope: [...moduleCap], driverManagementScope: [...tabCap] });
  const clearModules = () => setDraft({ ...draft, moduleScope: [], driverManagementScope: [] });
  const setAllBases = () => setDraft({ ...draft, baseScope: bases.map((base) => base.baseKey) });
  const clearBases = () => setDraft({ ...draft, baseScope: [] });

  return (
    <div className={styles.sectionGrid}>
      <div className={styles.checkPanel}>
        <div className={styles.panelHeader}>
          <div><span className={styles.legend}>Módulos permitidos</span><small>{full ? "Definidos pela função" : `${draft.moduleScope.length} de ${moduleCap.length} selecionados`}</small></div>
          {!full ? <div className={styles.compactActions}><button type="button" onClick={setAllModules}>Selecionar todos</button><button type="button" onClick={clearModules}>Limpar</button></div> : null}
        </div>
        <div className={styles.checkGrid}>
          {moduleCap.map((moduleId) => {
            const checked = full || draft.moduleScope.includes(moduleId);
            return (
              <label className={`${styles.checkItem} ${checked ? styles.checkItemActive : ""}`} key={moduleId}>
                <input disabled={full} type="checkbox" checked={checked} onChange={() => setDraft({ ...draft, moduleScope: toggleValue(draft.moduleScope, moduleId) })} />
                <span>{MODULE_LABELS.get(moduleId) ?? moduleId}</span>
              </label>
            );
          })}
        </div>

        {draft.moduleScope.includes("gestao-motoristas") && tabCap.length ? (
          <div className={styles.subAccess}>
            <div className={styles.panelHeader}><div><span className={styles.legend}>Gestão de Motoristas</span><small>Abas disponíveis para esta função</small></div></div>
            <div className={styles.checkGrid}>{tabCap.map((tab) => {
              const checked = full || draft.driverManagementScope.includes(tab);
              return <label className={`${styles.checkItem} ${checked ? styles.checkItemActive : ""}`} key={tab}><input disabled={full} type="checkbox" checked={checked} onChange={() => setDraft({ ...draft, driverManagementScope: toggleValue(draft.driverManagementScope, tab) })} /><span>{TAB_LABELS[tab]}</span></label>;
            })}</div>
          </div>
        ) : null}
      </div>

      <div className={styles.checkPanel}>
        <div className={styles.panelHeader}>
          <div><span className={styles.legend}>SVC / Bases responsáveis</span><small>{allBases ? "Abrangência definida pela função" : `${draft.baseScope.length} selecionada(s)`}</small></div>
          {!allBases ? <div className={styles.compactActions}><button type="button" onClick={setAllBases}>Selecionar todas</button><button type="button" onClick={clearBases}>Limpar</button></div> : null}
        </div>
        {allBases ? (
          <div className={styles.allBasesState}><ShieldCheck size={22} /><div><strong>Todas as SVCs/bases permitidas</strong><span>Esta função possui abrangência global dentro dos módulos autorizados. XPT permanece independente.</span></div></div>
        ) : (
          <>
            <label className={styles.searchBox}><Search size={15} /><input value={baseSearch} onChange={(event) => setBaseSearch(event.target.value)} placeholder="Buscar SVC ou base" /></label>
            <div className={styles.baseGrid}>{visibleBases.map((base) => {
              const checked = draft.baseScope.includes(base.baseKey);
              return <label className={`${styles.checkItem} ${checked ? styles.checkItemActive : ""}`} key={base.baseKey}><input type="checkbox" checked={checked} onChange={() => setDraft({ ...draft, baseScope: toggleValue(draft.baseScope, base.baseKey) })} /><span>{baseLabel(base)}</span></label>;
            })}</div>
            {!visibleBases.length ? <p className={styles.emptyState}>Nenhuma SVC/base encontrada para esta busca.</p> : null}
          </>
        )}
      </div>
    </div>
  );
}

function PortalBaseAccessPanel() {
  const [payload, setPayload] = useState<PortalPayload | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Todas");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const body = await readJson(await fetch("/api/settings/driver-portal-bases", { cache: "no-store" }), "Falha ao carregar controle do portal.");
      setPayload(body);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao carregar controle do portal.");
    }
  }
  useEffect(() => { void load(); }, []);

  const rows = useMemo(() => (payload?.rows ?? []).filter((row) => {
    if (status === "Liberadas" && !row.enabled) return false;
    if (status === "Bloqueadas" && row.enabled) return false;
    return `${row.baseKey} ${row.sigla} ${row.baseName}`.toLowerCase().includes(search.toLowerCase());
  }), [payload, search, status]);

  async function changeAccess(baseKeys: string[], enabled: boolean) {
    if (!baseKeys.length) return;
    if (!window.confirm(`${enabled ? "Liberar" : "Bloquear"} Portal do Motorista para ${baseKeys.length} base(s)?`)) return;
    setSaving(true);
    try {
      const body = await readJson(await fetch("/api/settings/driver-portal-bases", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseKeys, enabled }) }), "Falha ao alterar bases.");
      setPayload(body);
      setSelected([]);
      setMessage(enabled ? "Bases liberadas." : "Bases bloqueadas e sessões revogadas.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao alterar bases.");
    } finally {
      setSaving(false);
    }
  }

  const summary = payload?.summary;
  return (
    <Panel title="Portal dos Motoristas" subtitle="Controle central de liberação por base operacional">
      <div className={styles.summaryRow}>
        <KpiCard label="Bases" value={formatNumber(summary?.bases ?? 0)} detail="cadastradas" icon={<ShieldCheck size={17} />} />
        <KpiCard label="Liberadas" value={formatNumber(summary?.enabled ?? 0)} detail="portal ativo" icon={<ToggleRight size={17} />} tone="green" />
        <KpiCard label="Bloqueadas" value={formatNumber(summary?.blocked ?? 0)} detail="portal bloqueado" icon={<ToggleLeft size={17} />} tone="amber" />
        <KpiCard label="Habilitados" value={formatNumber(summary?.eligibleDrivers ?? 0)} detail="motoristas" icon={<CheckCircle2 size={17} />} />
        <KpiCard label="Ativados" value={formatNumber(summary?.activatedDrivers ?? 0)} detail="PIN criado" icon={<CheckCircle2 size={17} />} tone="green" />
        <KpiCard label="Bloqueados" value={formatNumber(summary?.blockedDrivers ?? 0)} detail="individualmente" icon={<ToggleLeft size={17} />} tone="red" />
      </div>
      <div className={styles.toolbar}><label className={styles.field}><span>Buscar base</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="SSP5 ou Barueri" /></label><label className={styles.field}><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option>Todas</option><option>Liberadas</option><option>Bloqueadas</option></select></label><button className="secondary-button primary-button--small" disabled={!selected.length || saving} onClick={() => void changeAccess(selected, true)}><ToggleRight size={15} />Liberar selecionadas</button><button className="danger-button" disabled={!selected.length || saving} onClick={() => void changeAccess(selected, false)}><ToggleLeft size={15} />Bloquear selecionadas</button></div>
      {message ? <p className="admin-message">{message}</p> : null}
      <div className={`${styles.portalRow} ${styles.portalHead}`}><span></span><span>Base</span><span>Sigla</span><span>Status</span><span>Motoristas</span><span>Ativados</span><span>Alterado por</span><span>Ação</span></div>
      {rows.map((row) => <div className={styles.portalRow} key={row.baseKey}><input type="checkbox" checked={selected.includes(row.baseKey)} onChange={() => setSelected(toggleValue(selected, row.baseKey))} /><span><strong>{row.baseName}</strong><small className="cell-subtitle">{row.baseKey}</small></span><span>{row.sigla}</span><StatusBadge tone={row.enabled ? "green" : "amber"}>{row.status}</StatusBadge><span>{row.counts.total}</span><span>{row.counts.activated}</span><span>{row.changedBy || "-"}</span><button className={row.enabled ? "danger-button" : "primary-button primary-button--small"} disabled={saving} onClick={() => void changeAccess([row.baseKey], !row.enabled)}>{row.enabled ? "Bloquear" : "Liberar"}</button></div>)}
    </Panel>
  );
}