import { Activity, Database, ShieldCheck, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { AdminUserControl } from "@/features/configuracoes/components/admin-user-control";
import { PnrGoalForm } from "@/features/configuracoes/components/pnr-goal-form";
import { ProcessedFilesManager } from "@/features/configuracoes/components/processed-files-manager";
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
        <MetricCard label="Usuários" value={number(data.profiles.length)} detail={`${number(admins)} administradores`} tone="accent" />
        <MetricCard label="Meta mensal PNR" value={currency(monthlyGoal)} detail="limite operacional" />
        <MetricCard label="Arquivos processados" value={number(data.files.length)} detail="arquivos carregados por módulo" />
        <MetricCard label="Auditoria" value={number(data.auditLogs.length)} detail="últimos 40 eventos" />
      </section>

      <Card className="settings-panel">
        <div className="section-header">
          <div>
            <span>Permissões</span>
            <h2>Usuários e perfil admin</h2>
          </div>
          <ShieldCheck size={20} aria-hidden="true" />
        </div>
        <div className="data-table-shell">
          <table className="data-table data-table--wide settings-users-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>E-mail</th>
                <th>Permissão</th>
                <th>Ajustes</th>
              </tr>
            </thead>
            <tbody>
              {data.profiles.map((profile) => (
                <tr key={profile.id}>
                  <td>
                    <strong>{profile.name || "Usuário"}</strong>
                    <span>{profile.cargo || "Perfil operacional"}</span>
                  </td>
                  <td>
                    <strong>{profile.email || "-"}</strong>
                    <span>{profile.setor || "Sem setor"}</span>
                  </td>
                  <td>
                    <Badge tone={profile.role === "admin" && profile.is_admin === true ? "success" : "neutral"}>
                      {profile.role === "admin" && profile.is_admin === true ? "Admin" : "Usuário"}
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
            <div><span>Autorização</span><strong>profile.is_admin + role admin</strong></div>
          </div>
        </Card>
      </div>

      <ProcessedFilesManager files={data.files} />

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
