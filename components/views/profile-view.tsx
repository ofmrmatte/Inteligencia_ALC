"use client";

import { Building2, Mail, ShieldCheck, UserRound } from "lucide-react";
import { ROLE_LABELS, hasFullAccess, type AuthProfile } from "@/lib/auth";
import { formatNumber, KpiCard, Panel, PageIntro, StatusBadge } from "@/components/ui";
import { useDashboardStore } from "@/lib/store";
import { TableWrap } from "./shared";

export function ProfileView({ profile }: { profile: AuthProfile }) {
  const data = useDashboardStore((state) => state.data);
  const fullAccess = hasFullAccess(profile);
  const scopeRows = [
    ...profile.siglaScope.map((value) => ({ type: "Sigla", value })),
    ...profile.baseScope.map((value) => ({ type: "Base", value })),
  ];

  return (
    <div className="view-stack">
      <PageIntro description="O perfil exibido vem da autenticação Supabase e define quais bases, siglas e ações ficam disponíveis no painel." chips={[ROLE_LABELS[profile.role], fullAccess ? "Acesso total" : "Escopo limitado", profile.email]} />
      <div className="kpi-grid kpi-grid--four">
        <KpiCard label="Permissão" value={ROLE_LABELS[profile.role]} detail={fullAccess ? "Acesso total ao painel" : "Escopo por base/sigla"} icon={<ShieldCheck size={19} />} tone={fullAccess ? "red" : "neutral"} />
        <KpiCard label="Siglas" value={formatNumber(profile.siglaScope.length)} detail="Escopo direto no banco" icon={<Building2 size={19} />} />
        <KpiCard label="Bases" value={formatNumber(profile.baseScope.length)} detail="Bases autorizadas" icon={<Building2 size={19} />} />
        <KpiCard label="Lotes online" value={formatNumber(data.imports.length)} detail="Disponíveis no Supabase" icon={<UserRound size={19} />} />
      </div>
      <Panel title="Dados da conta" subtitle="Informações de sessão e autorização">
        <TableWrap>
          <tbody>
            <tr><th>Nome</th><td><strong>{profile.fullName}</strong></td></tr>
            <tr><th>E-mail</th><td><Mail size={14} /> {profile.email}</td></tr>
            <tr><th>Perfil</th><td><StatusBadge tone="blue">{ROLE_LABELS[profile.role]}</StatusBadge></td></tr>
            <tr><th>Acesso</th><td><StatusBadge tone={fullAccess ? "green" : "neutral"}>{fullAccess ? "Total" : "Limitado por escopo"}</StatusBadge></td></tr>
          </tbody>
        </TableWrap>
      </Panel>
      <Panel title="Escopo operacional" subtitle="Bases e siglas liberadas por RLS">
        <TableWrap>
          <thead><tr><th>Tipo</th><th>Valor</th></tr></thead>
          <tbody>
            {fullAccess ? <tr><td colSpan={2}>Acesso total habilitado para todas as bases e siglas.</td></tr> : scopeRows.length ? scopeRows.map((row) => <tr key={`${row.type}-${row.value}`}><td>{row.type}</td><td><strong>{row.value}</strong></td></tr>) : <tr><td colSpan={2}>Nenhum escopo explícito cadastrado para este usuário.</td></tr>}
          </tbody>
        </TableWrap>
      </Panel>
    </div>
  );
}
