"use client";

import { CheckCircle2, CircleAlert, DatabaseZap, Eye, RefreshCw, ShieldCheck, Wrench } from "lucide-react";
import { qualityIssues } from "@/lib/metrics";
import { useDashboardStore } from "@/lib/store";
import { formatNumber, KpiCard, Panel, PageIntro, StatusBadge } from "@/components/ui";
import { TableWrap } from "./shared";

function actionForRule(rule: string) {
  const normalized = rule.toLocaleLowerCase("pt-BR");
  if (normalized.includes("base/sigla")) return { href: "/configuracoes", label: "Vincular base", title: "Abrir cadastro de bases para corrigir o vínculo" };
  if (normalized.includes("motorista sem id")) return { href: "/gestao-motoristas", label: "Conciliar motorista", title: "Abrir Gestão de Motoristas para conciliar o cadastro" };
  if (normalized.includes("pacote repetido")) return { href: "/conciliacao-ids", label: "Analisar duplicados", title: "Abrir Conciliação de IDs" };
  if (normalized.includes("id obrigatório") || normalized.includes("id obrigatorio")) return { href: "/importacoes", label: "Ver origem", title: "Abrir Histórico de Importações para localizar as linhas" };
  if (normalized.includes("supervisão") || normalized.includes("supervisao")) return { href: "/configuracoes", label: "Revisar hierarquia", title: "Abrir configurações da hierarquia" };
  return null;
}

export function QualityView() {
  const data = useDashboardStore((state) => state.data);
  const issues = qualityIssues(data);
  const critical = issues.filter((issue) => issue.severity === "Crítico" && issue.count > 0);
  const warnings = issues.filter((issue) => issue.severity === "Atenção" && issue.count > 0);
  const totalRows = data.hierarchy.length + data.prefatura.length + data.pnr.length + data.risk.length + data.drivers.length;
  const impacted = issues.reduce((sum, issue) => sum + issue.count, 0);
  const score = totalRows ? Math.max(0, 100 - Math.min(100, (impacted / totalRows) * 100)) : 0;

  const revalidate = async () => {
    const owner = useDashboardStore.getState().cacheOwnerId;
    useDashboardStore.setState({ lastSyncedAt: 0 });
    if (owner) await useDashboardStore.getState().hydrate(owner);
  };

  return (
    <div className="view-stack">
      <PageIntro description="As regras verificam grão, chaves, cobertura da hierarquia e capacidade de cruzamento. Alertas não são corrigidos silenciosamente." chips={[`${issues.length} regras ativas`, `${formatNumber(totalRows)} linhas avaliadas`]} />
      <div className="kpi-grid kpi-grid--four">
        <KpiCard label="Índice de confiança" value={`${score.toFixed(1)}%`} detail="Registros sem alerta" icon={<ShieldCheck size={19} />} tone={score >= 95 ? "green" : score >= 80 ? "amber" : "red"} />
        <KpiCard label="Regras críticas" value={formatNumber(critical.length)} detail="Exigem correção" icon={<CircleAlert size={19} />} tone={critical.length ? "red" : "green"} />
        <KpiCard label="Pontos de atenção" value={formatNumber(warnings.length)} detail="Afetam filtros ou vínculos" icon={<DatabaseZap size={19} />} tone={warnings.length ? "amber" : "green"} />
        <KpiCard label="Regras aprovadas" value={formatNumber(issues.filter((issue) => issue.count === 0).length)} detail="Sem ocorrência" icon={<CheckCircle2 size={19} />} tone="green" />
      </div>
      <Panel
        title="Matriz de qualidade"
        subtitle="Resultado das verificações após a última importação"
        action={<button className="secondary-button" type="button" onClick={() => void revalidate()} title="Revalidar qualidade dos dados"><RefreshCw size={14} />Revalidar</button>}
      >
        <TableWrap><thead><tr><th>Regra</th><th>Fonte</th><th>Severidade</th><th>Ocorrências</th><th>Interpretação</th><th className="align-right">Ações</th></tr></thead>
          <tbody>{issues.map((issue) => {
            const action = actionForRule(issue.rule);
            return <tr key={issue.id}>
              <td><strong>{issue.rule}</strong></td>
              <td>{issue.dataset}</td>
              <td><StatusBadge tone={issue.count === 0 ? "green" : issue.severity === "Crítico" ? "red" : issue.severity === "Atenção" ? "amber" : "blue"}>{issue.count === 0 ? "Aprovado" : issue.severity}</StatusBadge></td>
              <td><strong>{formatNumber(issue.count)}</strong></td>
              <td className="wide-cell">{issue.detail}</td>
              <td className="align-right">
                {action && issue.count > 0 ? <div style={{ display: "inline-flex", gap: 6 }}>
                  <button className="table-action" type="button" title={`Visualizar: ${action.label}`} onClick={() => window.location.assign(action.href)}><Eye size={15} /></button>
                  <button className="table-action" type="button" title={action.title} onClick={() => window.location.assign(action.href)}><Wrench size={15} /></button>
                </div> : <span className="muted">—</span>}
              </td>
            </tr>;
          })}</tbody>
        </TableWrap>
      </Panel>
      <div className="quality-callout"><CircleAlert size={19} /><div><strong>Sobre supervisor × motorista</strong><p>A hierarquia informa os supervisores de cada base, mas as fontes operacionais não trazem supervisor. Quando há mais de um supervisor na mesma sigla, o filtro mostra o escopo compartilhado da base e não inventa uma atribuição individual.</p></div></div>
    </div>
  );
}
