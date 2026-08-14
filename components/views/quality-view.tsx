"use client";

import { CheckCircle2, CircleAlert, DatabaseZap, ShieldCheck } from "lucide-react";
import { qualityIssues } from "@/lib/metrics";
import { useDashboardStore } from "@/lib/store";
import { formatNumber, KpiCard, Panel, PageIntro, StatusBadge } from "@/components/ui";
import { TableWrap } from "./shared";

export function QualityView() {
  const data = useDashboardStore((state) => state.data);
  const issues = qualityIssues(data);
  const critical = issues.filter((issue) => issue.severity === "Crítico" && issue.count > 0);
  const warnings = issues.filter((issue) => issue.severity === "Atenção" && issue.count > 0);
  const totalRows = data.hierarchy.length + data.prefatura.length + data.pnr.length + data.risk.length + data.drivers.length;
  const impacted = issues.reduce((sum, issue) => sum + issue.count, 0);
  const score = totalRows ? Math.max(0, 100 - Math.min(100, (impacted / totalRows) * 100)) : 0;

  return (
    <div className="view-stack">
      <PageIntro description="As regras verificam grão, chaves, cobertura da hierarquia e capacidade de cruzamento. Alertas não são corrigidos silenciosamente." chips={[`${issues.length} regras ativas`, `${formatNumber(totalRows)} linhas avaliadas`]} />
      <div className="kpi-grid kpi-grid--four">
        <KpiCard label="Índice de confiança" value={`${score.toFixed(1)}%`} detail="Registros sem alerta" icon={<ShieldCheck size={19} />} tone={score >= 95 ? "green" : score >= 80 ? "amber" : "red"} />
        <KpiCard label="Regras críticas" value={formatNumber(critical.length)} detail="Exigem correção" icon={<CircleAlert size={19} />} tone={critical.length ? "red" : "green"} />
        <KpiCard label="Pontos de atenção" value={formatNumber(warnings.length)} detail="Afetam filtros ou vínculos" icon={<DatabaseZap size={19} />} tone={warnings.length ? "amber" : "green"} />
        <KpiCard label="Regras aprovadas" value={formatNumber(issues.filter((issue) => issue.count === 0).length)} detail="Sem ocorrência" icon={<CheckCircle2 size={19} />} tone="green" />
      </div>
      <Panel title="Matriz de qualidade" subtitle="Resultado das verificações após a última importação">
        <TableWrap><thead><tr><th>Regra</th><th>Fonte</th><th>Severidade</th><th>Ocorrências</th><th>Interpretação</th></tr></thead>
          <tbody>{issues.map((issue) => <tr key={issue.id}><td><strong>{issue.rule}</strong></td><td>{issue.dataset}</td><td><StatusBadge tone={issue.count === 0 ? "green" : issue.severity === "Crítico" ? "red" : issue.severity === "Atenção" ? "amber" : "blue"}>{issue.count === 0 ? "Aprovado" : issue.severity}</StatusBadge></td><td><strong>{formatNumber(issue.count)}</strong></td><td className="wide-cell">{issue.detail}</td></tr>)}</tbody>
        </TableWrap>
      </Panel>
      <div className="quality-callout"><CircleAlert size={19} /><div><strong>Sobre supervisor × motorista</strong><p>A hierarquia informa os supervisores de cada base, mas as fontes operacionais não trazem supervisor. Quando há mais de um supervisor na mesma sigla, o filtro mostra o escopo compartilhado da base e não inventa uma atribuição individual.</p></div></div>
    </div>
  );
}
