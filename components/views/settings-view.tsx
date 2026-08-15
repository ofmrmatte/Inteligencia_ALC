"use client";

import { Database, FileArchive, LockKeyhole, ShieldCheck, UsersRound } from "lucide-react";
import { ROLE_LABELS, canManageImports, hasFullAccess, type AuthProfile } from "@/lib/auth";
import { formatNumber, KpiCard, Panel, PageIntro, StatusBadge } from "@/components/ui";
import { useDashboardStore } from "@/lib/store";
import { TableWrap } from "./shared";

export function SettingsView({ profile }: { profile: AuthProfile }) {
  const data = useDashboardStore((state) => state.data);
  const fullAccess = hasFullAccess(profile);
  const canImport = canManageImports(profile);
  const rows = [
    { area: "Autenticação", status: "Supabase Auth", owner: "ADM", detail: "Login por e-mail e senha com sessão protegida." },
    { area: "Importações", status: canImport ? "Liberado" : "Restrito", owner: "Diretor / ADM", detail: "Somente perfis administrativos confirmam lotes oficiais." },
    { area: "Escopo", status: fullAccess ? "Acesso total" : "RLS por base/sigla", owner: "Banco", detail: fullAccess ? "Usuário liberado para todas as bases e siglas." : "Coordenadores e supervisores dependem do escopo cadastrado." },
    { area: "Auditoria", status: "Estrutura pronta", owner: "ADM", detail: "Eventos administrativos preparados na migração Supabase." },
  ];

  return (
    <div className="view-stack">
      <PageIntro description="Central de parâmetros administrativos da Inteligência ALC, alinhada ao controle de perfis e rastreabilidade dos lotes." chips={[`Perfil atual: ${ROLE_LABELS[profile.role]}`, fullAccess ? "Acesso total" : "Consulta operacional"]} />
      <div className="kpi-grid kpi-grid--four">
        <KpiCard label="Perfil atual" value={ROLE_LABELS[profile.role]} detail={fullAccess ? "Sem restrição por escopo" : "Permissão da sessão"} icon={<ShieldCheck size={19} />} tone={fullAccess ? "red" : "neutral"} />
        <KpiCard label="Importações" value={canImport ? "Ativas" : "Restritas"} detail="Diretor/ADM" icon={<FileArchive size={19} />} tone={canImport ? "green" : "amber"} />
        <KpiCard label="Lotes locais" value={formatNumber(data.imports.length)} detail="IndexedDB no navegador" icon={<Database size={19} />} />
        <KpiCard label="RLS" value="Ativo" detail="Migração Supabase" icon={<LockKeyhole size={19} />} tone="green" />
      </div>
      <Panel title="Controles administrativos" subtitle="Situação dos blocos de configuração">
        <TableWrap>
          <thead><tr><th>Área</th><th>Status</th><th>Responsável</th><th>Detalhe</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.area}><td><strong>{row.area}</strong></td><td><StatusBadge tone={row.status === "Restrito" ? "amber" : "green"}>{row.status}</StatusBadge></td><td>{row.owner}</td><td>{row.detail}</td></tr>)}</tbody>
        </TableWrap>
      </Panel>
      <Panel title="Perfis previstos" subtitle="Separação operacional do painel">
        <div className="settings-role-grid">
          {Object.entries(ROLE_LABELS).map(([role, label]) => <div key={role}><UsersRound size={18} /><strong>{label}</strong><span>{role === "admin" ? "Administração total" : role === "director" ? "Visão completa e importações" : role === "supervisor" ? "Escopo supervisionado" : "Bases e motoristas vinculados"}</span></div>)}
        </div>
      </Panel>
    </div>
  );
}
