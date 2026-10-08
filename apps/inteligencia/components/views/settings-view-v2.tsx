"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Edit3, Save, ShieldCheck, Trash2, UserPlus, UsersRound, X } from "lucide-react";
import { roleModuleCap } from "@/lib/access-control";
import { MANAGED_USER_ROLES, ROLE_LABELS, canManageUsers, type AuthProfile, type UserRole } from "@/lib/auth";
import { NAVIGATION, type SectionId } from "@/lib/navigation";
import { Panel, PageIntro, StatusBadge } from "@/components/ui";
import { TableWrap } from "./shared";
import styles from "./settings-view-v2.module.css";

interface DepartmentOption { id: string; name: string }
interface ManagedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  setor: string;
  globalAccess: boolean;
  active: boolean;
  moduleScope: string[];
  atendimentoAccess: boolean;
}
interface UsersPayload { roles: UserRole[]; users: ManagedUser[]; departments: DepartmentOption[]; atendimentoReady: boolean }
interface UserDraft {
  id?: string;
  email: string;
  fullName: string;
  password: string;
  role: UserRole;
  setor: string;
  active: boolean;
  moduleScope: string[];
}

type SettingsSection = "users" | "hierarchy";

const MODULE_LABELS = new Map(NAVIGATION.map((item) => [item.id, item.label]));
const ROLE_DETAILS: Partial<Record<UserRole, string>> = {
  director: "Visão total dos módulos liberados para Diretoria.",
  developer: "Acesso técnico e administrativo total.",
  loss_supervisor: "Acesso aos módulos definidos para Supervisão Loss.",
  loss_admin: "Acesso aos módulos definidos para Administração Loss.",
  coordinator: "Acesso aos módulos operacionais liberados para o usuário.",
  supervisor: "Acesso aos módulos operacionais liberados para o usuário.",
};

function isFullRole(role: UserRole) {
  return ["director", "developer"].includes(role);
}

function blankDraft(): UserDraft {
  const role: UserRole = "coordinator";
  return {
    email: "",
    fullName: "",
    password: "",
    role,
    setor: "",
    active: true,
    moduleScope: roleModuleCap(role),
  };
}

function roleChanged(draft: UserDraft, role: UserRole): UserDraft {
  return { ...draft, role, moduleScope: roleModuleCap(role) };
}

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

async function readJson(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || fallback);
  return body;
}

function SectorSelect({ value, departments, onChange }: { value: string; departments: DepartmentOption[]; onChange: (value: string) => void }) {
  const canonical = departments.some((department) => department.name === value);
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Não definido</option>
      {departments.map((department) => <option key={department.id} value={department.name}>{department.name}</option>)}
      {value && !canonical ? <option value={value}>{value} (legado)</option> : null}
    </select>
  );
}

export function SettingsViewV2({ profile }: { profile: AuthProfile }) {
  const sections = useMemo(() => {
    const next: Array<{ id: SettingsSection; title: string; description: string }> = [];
    if (canManageUsers(profile)) next.push({ id: "users", title: "Usuários e permissões", description: "Cargos, setores e módulos permitidos" });
    next.push({ id: "hierarchy", title: "Hierarquia e regras", description: "Limites máximos de cada função" });
    return next;
  }, [profile]);

  const [activeSection, setActiveSection] = useState<SettingsSection>(() => sections[0]?.id ?? "hierarchy");
  const resolvedActiveSection = sections.some((section) => section.id === activeSection) ? activeSection : (sections[0]?.id ?? "hierarchy");

  return (
    <div className={styles.stack}>
      <PageIntro
        description="Permissões, setores e recursos administrativos organizados por categoria."
        chips={[`Perfil: ${ROLE_LABELS[profile.role]}`, "Controle de acesso centralizado"]}
      />

      <nav className={styles.settingsNav} aria-label="Categorias de configurações">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`${styles.navCard} ${resolvedActiveSection === section.id ? styles.navCardActive : ""}`}
            onClick={() => setActiveSection(section.id)}
            aria-current={resolvedActiveSection === section.id ? "page" : undefined}
          >
            <span className={styles.navIcon}>{section.id === "users" ? <UsersRound size={18} /> : <ShieldCheck size={18} />}</span>
            <span className={styles.navText}><strong>{section.title}</strong><small>{section.description}</small></span>
          </button>
        ))}
      </nav>

      {resolvedActiveSection === "users" && canManageUsers(profile) ? <UserManagementPanel currentUserId={profile.id} /> : null}
      {resolvedActiveSection === "hierarchy" ? <HierarchyPanel /> : null}
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
            <div className={styles.roleMeta}><span>{roleModuleCap(role).length} módulo(s)</span></div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function UserManagementPanel({ currentUserId }: { currentUserId: string }) {
  const [payload, setPayload] = useState<UsersPayload>({ roles: [], users: [], departments: [], atendimentoReady: false });
  const [draft, setDraft] = useState<UserDraft>(blankDraft);
  const [editing, setEditing] = useState<UserDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    try {
      const body = await readJson(await fetch("/api/users", { cache: "no-store" }), "Falha ao carregar usuários.");
      setPayload({ roles: body.roles ?? [], users: body.users ?? [], departments: body.departments ?? [], atendimentoReady: body.atendimentoReady === true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { queueMicrotask(() => void load()); }, []);

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
      setPayload({ roles: body.roles ?? [], users: body.users ?? [], departments: body.departments ?? [], atendimentoReady: body.atendimentoReady === true });
      setDraft(blankDraft());
      setMessage("Usuário cadastrado com setor e módulos definidos.");
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
      setPayload({ roles: body.roles ?? [], users: body.users ?? [], departments: body.departments ?? [], atendimentoReady: body.atendimentoReady === true });
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
      setPayload({ roles: body.roles ?? [], users: body.users ?? [], departments: body.departments ?? [], atendimentoReady: body.atendimentoReady === true });
      setMessage("Usuário removido.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao remover usuário.");
    } finally {
      setSaving(false);
    }
  }

  async function changeAtendimentoAccess(user: ManagedUser, active: boolean) {
    setSaving(true);
    setMessage("");
    try {
      const body = await readJson(await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "atendimento-access", id: user.id, active }),
      }), "Falha ao atualizar acesso ao Atendimento.");
      setPayload((current) => ({ ...current, users: current.users.map((item) => item.id === user.id ? { ...item, atendimentoAccess: body.atendimentoAccess } : item) }));
      setMessage(`Acesso ao ALC Atendimento ${active ? "liberado" : "bloqueado"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao atualizar acesso ao Atendimento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Usuários e permissões" subtitle="Cadastre pessoas e atribua setor e módulos; SVC/bases e XPTs não fazem mais parte da gestão de usuários">
      <form className={`${styles.stack} ${styles.userCreateForm}`} onSubmit={createUser}>
        <div className={styles.formGrid}>
          <label className={styles.field}><span>E-mail</span><input required type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="usuario@alc.com.br" /></label>
          <label className={styles.field}><span>Nome</span><input required value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} placeholder="Nome do usuário" /></label>
          <label className={styles.field}><span>Senha inicial</span><input required minLength={12} autoComplete="new-password" type="password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} placeholder="12+ caracteres, maiúscula, número e símbolo" /></label>
          <label className={styles.field}><span>Cargo</span><select value={draft.role} onChange={(event) => setDraft(roleChanged(draft, event.target.value as UserRole))}>{payload.roles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></label>
          <label className={styles.field}><span>Setor</span><SectorSelect value={draft.setor} departments={payload.departments} onChange={(setor) => setDraft({ ...draft, setor })} /></label>
        </div>

        <div className={styles.roleSummary}>
          <span className={styles.roleSummaryIcon}><ShieldCheck size={18} /></span>
          <div><strong>{ROLE_LABELS[draft.role]}</strong><span>{ROLE_DETAILS[draft.role] ?? "Escopo definido pela matriz de permissões."}</span></div>
          <StatusBadge tone={isFullRole(draft.role) ? "green" : "neutral"}>{isFullRole(draft.role) ? "Acesso total" : "Acesso controlado"}</StatusBadge>
        </div>

        <AccessEditor draft={draft} setDraft={setDraft} />
        <div className={styles.formActions}>
          <span>{draft.moduleScope.length} módulo(s) · {draft.setor || "setor não definido"}</span>
          <button className="primary-button primary-button--small" disabled={saving} type="submit"><UserPlus size={15} />Cadastrar usuário</button>
        </div>
      </form>

      {message ? <p className="admin-message">{message}</p> : null}

      <div className={styles.tableHeader}><div><strong>Usuários cadastrados</strong><span>{payload.users.length} conta(s) interna(s)</span></div></div>
      <p className={styles.muted}>ALC Atendimento: libere ou bloqueie o acesso por usuário. A permissão é independente de Prevenção de Perdas e utiliza o mesmo login do Inteligência.</p>
      {!loading && !payload.atendimentoReady ? <p className="admin-message">Controle de acesso ao Atendimento indisponível. Recarregue para tentar novamente.</p> : null}
      <TableWrap>
        <thead><tr><th>Usuário</th><th>Cargo</th><th>Setor</th><th>Módulos</th><th>ALC Atendimento</th><th>Status</th><th className="align-right">Ações</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={7}>Carregando usuários...</td></tr> : payload.users.map((user) => (
            <tr key={user.id}>
              <td><strong>{user.fullName || user.email}</strong><span className="cell-subtitle">{user.email}</span></td>
              <td>{ROLE_LABELS[user.role]}</td>
              <td>{user.setor || "—"}</td>
              <td><div className={styles.badges}>{(isFullRole(user.role) ? ["Acesso total"] : user.moduleScope.map((id) => MODULE_LABELS.get(id as SectionId) ?? id)).slice(0, 3).map((label) => <span className={styles.badge} key={label}>{label}</span>)}{!isFullRole(user.role) && user.moduleScope.length > 3 ? <span className={styles.badge}>+{user.moduleScope.length - 3}</span> : null}</div></td>
              <td><label className={styles.checkItem} title={user.id === currentUserId ? "Sua própria conta não pode ser alterada aqui" : undefined}><input type="checkbox" checked={user.atendimentoAccess} disabled={user.id === currentUserId || !user.active || saving || !payload.atendimentoReady} aria-label={`Acesso ao ALC Atendimento de ${user.fullName || user.email}`} onChange={(event) => void changeAtendimentoAccess(user, event.target.checked)} /><span>{!payload.atendimentoReady ? "Indisponível" : user.atendimentoAccess ? "Liberado" : "Bloqueado"}</span></label></td>
              <td><StatusBadge tone={user.active ? "green" : "amber"}>{user.active ? "Ativo" : "Inativo"}</StatusBadge></td>
              <td className="align-right"><div className={styles.actions}><button className="table-action" disabled={user.id === currentUserId || saving} type="button" title={user.id === currentUserId ? "Sua própria conta não pode ser alterada aqui" : "Editar"} onClick={() => setEditing({ ...user, password: "" })}><Edit3 size={14} /></button><button className="table-action" disabled={user.id === currentUserId || saving} type="button" title="Remover" onClick={() => void removeUser(user)}><Trash2 size={14} /></button></div></td>
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
              <label className={styles.field}><span>Nova senha</span><input minLength={12} autoComplete="new-password" type="password" value={editing.password} onChange={(event) => setEditing({ ...editing, password: event.target.value })} placeholder="em branco mantém; nova senha deve ter 12+ caracteres" /></label>
              <label className={styles.field}><span>Cargo</span><select value={editing.role} onChange={(event) => setEditing(roleChanged(editing, event.target.value as UserRole))}>{payload.roles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></label>
              <label className={styles.field}><span>Setor</span><SectorSelect value={editing.setor} departments={payload.departments} onChange={(setor) => setEditing({ ...editing, setor })} /></label>
            </div>
            <div className={styles.roleSummary}><span className={styles.roleSummaryIcon}><ShieldCheck size={18} /></span><div><strong>{ROLE_LABELS[editing.role]}</strong><span>{ROLE_DETAILS[editing.role] ?? "Escopo definido pela matriz de permissões."}</span></div></div>
            <AccessEditor draft={editing} setDraft={setEditing} />
            <label className={styles.checkItem}><input type="checkbox" checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} />Conta ativa</label>
            <div className={styles.modalActions}><button className="secondary-button" type="button" onClick={() => setEditing(null)}>Cancelar</button><button className="primary-button" disabled={saving} type="button" onClick={() => void saveEdit()}><Save size={15} />Salvar alterações</button></div>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function AccessEditor({ draft, setDraft }: { draft: UserDraft; setDraft: (draft: UserDraft) => void }) {
  const moduleCap = roleModuleCap(draft.role);
  const full = isFullRole(draft.role);
  const setAllModules = () => setDraft({ ...draft, moduleScope: [...moduleCap] });
  const clearModules = () => setDraft({ ...draft, moduleScope: [] });

  return (
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
    </div>
  );
}
