"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Database, FileArchive, LockKeyhole, Save, ShieldCheck, Trash2, UserPlus, UsersRound } from "lucide-react";
import { ROLE_LABELS, USER_ROLES, canManageImports, canManageUsers, hasFullAccess, type AuthProfile, type UserRole } from "@/lib/auth";
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

const ROLE_DETAILS: Record<UserRole, string> = {
  admin: "Administração total",
  developer: "Desenvolvimento, usuários e dados",
  director: "Visão completa e gestão",
  supervisor: "Escopo supervisionado",
  coordinator: "Bases e motoristas vinculados",
};

export function SettingsView({ profile }: { profile: AuthProfile }) {
  const data = useDashboardStore((state) => state.data);
  const fullAccess = hasFullAccess(profile);
  const canImport = canManageImports(profile);
  const canUsers = canManageUsers(profile);
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
      {canUsers ? <UserManagementPanel currentUserId={profile.id} /> : null}
      <Panel title="Perfis previstos" subtitle="Separação operacional do painel">
        <div className="settings-role-grid">
          {USER_ROLES.map((role) => <div key={role}><UsersRound size={18} /><strong>{ROLE_LABELS[role]}</strong><span>{ROLE_DETAILS[role]}</span></div>)}
        </div>
      </Panel>
    </div>
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

  async function requestUsers() {
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/users", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Falha ao carregar usuários.");
    setUsers(payload.users ?? []);
  }

  useEffect(() => {
    requestUsers().catch((error) => setMessage(error instanceof Error ? error.message : "Falha ao carregar usuários.")).finally(() => setLoading(false));
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
