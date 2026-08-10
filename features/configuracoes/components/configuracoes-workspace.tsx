import { Activity, Database, FileClock, ShieldCheck, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { AdminUserControl } from "@/features/configuracoes/components/admin-user-control";
import { PnrGoalForm } from "@/features/configuracoes/components/pnr-goal-form";
import type { AdminSettingsPageData } from "@/features/configuracoes/data/queries";

function number(value: number) {
  return value.toLocaleString("pt-BR");
}

function currency(value: unknown) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function ConfiguracoesWorkspace({ data }: { data: AdminSettingsPageData }) {
  const admins = data.profiles.filter((profile) => profile.role === "admin" && profile.is_admin === true).length;
  const monthlyGoal = Number(data.pnrGoal?.value?.monthly_goal || 0);
  const annualGoal = Number(data.pnrGoal?.value?.annual_goal || 0);

  return (
    <div className="page-stack">
      {data.error ? <div className="inline-warning">Configurações indisponíveis agora: {data.error}</div> : null}

      <section className="metric-grid" aria-label="Resumo administrativo">
        <MetricCard label="Usuarios" value={number(data.profiles.length)} detail={`${number(admins)} administradores`} tone="accent" />
        <MetricCard label="Meta mensal PNR" value={currency(monthlyGoal)} detail="limite operacional" />
        <MetricCard label="Arquivos processados" value={number(data.files.length)} detail="ultimos 30 registros" />
        <MetricCard label="Auditoria" value={number(data.auditLogs.length)} detail="ultimos 40 eventos" />
      </section>

      <Card className="settings-panel">
        <div className="section-header">
          <div>
            <span>Permissoes</span>
            <h2>Usuarios e perfil admin</h2>
          </div>
          <ShieldCheck size={20} aria-hidden="true" />
        </div>
        <div className="data-table-shell">
          <table className="data-table data-table--wide settings-users-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>E-mail</th>
                <th>Permissao</th>
                <th>Ajustes</th>
              </tr>
            </thead>
            <tbody>
              {data.profiles.map((profile) => (
                <tr key={profile.id}>
                  <td>
                    <strong>{profile.name || "Usuario"}</strong>
                    <span>{profile.cargo || "Perfil operacional"}</span>
                  </td>
                  <td>
                    <strong>{profile.email || "-"}</strong>
                    <span>{profile.setor || "Sem setor"}</span>
                  </td>
                  <td>
                    <Badge tone={profile.role === "admin" && profile.is_admin === true ? "success" : "neutral"}>
                      {profile.role === "admin" && profile.is_admin === true ? "Admin" : "Usuario"}
                    </Badge>
                    <span>{profile.setor || "Sem setor"} · {profile.cargo || "Sem cargo"}</span>
                  </td>
                  <td><AdminUserControl profile={profile} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="dashboard-grid">
        <Card className="settings-panel">
          <div className="section-header">
            <div>
              <span>Metas</span>
              <h2>Meta PNR mensal</h2>
            </div>
            <Target size={20} aria-hidden="true" />
          </div>
          <PnrGoalForm monthlyGoal={monthlyGoal} annualGoal={annualGoal} />
        </Card>

        <Card className="settings-panel">
          <div className="section-header">
            <div>
              <span>Sistema</span>
              <h2>Fonte de dados</h2>
            </div>
            <Database size={20} aria-hidden="true" />
          </div>
          <div className="read-only-grid">
            <div><span>Runtime</span><strong>Next.js App Router</strong></div>
            <div><span>Banco</span><strong>Supabase</strong></div>
            <div><span>Autorizacao</span><strong>profile.is_admin + role admin</strong></div>
          </div>
        </Card>
      </div>

      <Card className="settings-panel">
        <div className="section-header">
          <div>
            <span>Arquivos</span>
            <h2>Historico processado</h2>
          </div>
          <FileClock size={20} aria-hidden="true" />
        </div>
        <div className="data-table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Módulo</th>
                <th>Arquivo</th>
                <th>Competencia</th>
                <th>Linhas</th>
                <th>Status</th>
                <th>Processado em</th>
              </tr>
            </thead>
            <tbody>
              {data.files.map((file) => (
                <tr key={file.id}>
                  <td>{file.module_key || "-"}</td>
                  <td>{file.file_name || "-"}</td>
                  <td>{file.competencia || "-"}</td>
                  <td>{number(file.row_count || 0)}</td>
                  <td><Badge tone={file.status === "processed" ? "success" : "warning"}>{file.status || "-"}</Badge></td>
                  <td>{formatDate(file.processed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="settings-panel">
        <div className="section-header">
          <div>
            <span>Auditoria</span>
            <h2>Eventos recentes</h2>
          </div>
          <Activity size={20} aria-hidden="true" />
        </div>
        <div className="activity-list">
          {data.auditLogs.map((item) => (
            <div className="activity-list__item" key={item.id}>
              <div>
                <strong>{item.action}</strong>
                <span>{item.entity_type || "-"} · {item.user_email || "usuário"}</span>
              </div>
              <span>{formatDate(item.created_at)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
