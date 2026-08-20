"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, DatabaseZap, Eye, RefreshCw, ShieldCheck, Wrench, X } from "lucide-react";
import { duplicateGroups, qualityIssues } from "@/lib/metrics";
import { normalizeText } from "@/lib/normalize";
import { useDashboardStore } from "@/lib/store";
import type { DashboardData, QualityIssue } from "@/lib/types";
import { formatNumber, KpiCard, Panel, PageIntro, StatusBadge } from "@/components/ui";
import { TableWrap } from "./shared";

type QualityDetail = {
  title: string;
  subtitle: string;
  columns: string[];
  rows: Array<{ key: string; cells: string[] }>;
  actionHref: string;
  actionLabel: string;
};

function actionForRule(rule: string) {
  const normalized = rule.toLocaleLowerCase("pt-BR");
  if (normalized.includes("base/sigla")) return { href: "/configuracoes?quality=base-unmatched", label: "Vincular base", title: "Abrir cadastro de bases para corrigir o vínculo" };
  if (normalized.includes("motorista sem id")) return { href: "/gestao-motoristas?quality=driver-unmatched", label: "Conciliar motorista", title: "Abrir Gestão de Motoristas para conciliar o cadastro" };
  if (normalized.includes("pacote repetido")) return { href: "/conciliacao-ids?status=Duplicado", label: "Analisar duplicados", title: "Abrir Conciliação de IDs já filtrada em Duplicados" };
  if (normalized.includes("id obrigatório") || normalized.includes("id obrigatorio")) return { href: "/importacoes?quality=missing-id", label: "Ver origem", title: "Abrir Histórico de Importações para localizar as linhas" };
  if (normalized.includes("supervisão") || normalized.includes("supervisao")) return { href: "/configuracoes?quality=shared-supervisor", label: "Revisar hierarquia", title: "Abrir configurações da hierarquia" };
  return null;
}

function trace(file: string, sheet: string, row: number) {
  const sheetPart = sheet ? ` · ${sheet}` : "";
  const rowPart = row ? ` · linha ${row}` : "";
  return `${file || "Arquivo não identificado"}${sheetPart}${rowPart}`;
}

function qualityDetail(issue: QualityIssue, data: DashboardData): QualityDetail | null {
  const action = actionForRule(issue.rule);
  if (!action) return null;

  if (issue.id === "base-unmatched") {
    const hierarchyPairs = new Set(data.hierarchy.map((row) => `${normalizeText(row.sigla)}|${normalizeText(row.baseKey)}`));
    const matched = (sigla: string, baseKey: string) => hierarchyPairs.has(`${normalizeText(sigla)}|${normalizeText(baseKey)}`);
    const rows = [
      ...data.prefatura.filter((row) => !matched(row.sigla, row.baseKey)).map((row) => ({ key: `pf-${row.batchId}-${row.rowNumber}`, cells: ["Pré-fatura", row.shipmentId || "—", row.sigla || "—", row.baseName || row.baseLabel || row.baseKey || "—", trace(row.sourceFile, row.sourceSheet, row.rowNumber)] })),
      ...data.pnr.filter((row) => !matched(row.sigla, row.baseKey)).map((row) => ({ key: `pnr-${row.batchId}-${row.rowNumber}`, cells: ["PNR", row.shipmentId || "—", row.sigla || "—", row.baseName || row.originStation || row.baseKey || "—", trace(row.sourceFile, row.sourceSheet, row.rowNumber)] })),
      ...data.risk.filter((row) => !matched(row.sigla, row.baseKey)).map((row) => ({ key: `risk-${row.batchId}-${row.rowNumber}`, cells: ["Risco LM", row.shipmentId || "—", row.sigla || "—", row.baseName || row.baseKey || row.facilityId || "—", trace(row.sourceFile, row.sourceSheet, row.rowNumber)] })),
    ];
    return { title: "Bases/Siglas sem correspondência", subtitle: "Registros operacionais que não localizaram uma combinação exata no cadastro mestre.", columns: ["Fonte", "ID", "Sigla", "Base", "Origem"], rows, actionHref: action.href, actionLabel: action.label };
  }

  if (issue.id === "driver-unmatched") {
    const knownDrivers = new Set(data.drivers.map((row) => normalizeText(row.name)));
    const rows = data.prefatura.filter((row) => row.driverName && !knownDrivers.has(normalizeText(row.driverName))).map((row) => ({
      key: `${row.batchId}-${row.rowNumber}`,
      cells: [row.driverName || "—", row.shipmentId || "—", row.driverId || "—", row.baseName || row.baseKey || "—", row.routeId || "—", trace(row.sourceFile, row.sourceSheet, row.rowNumber)],
    }));
    return { title: "Motoristas sem ID conciliado", subtitle: "Nomes da Pré-fatura que não encontraram correspondência no cadastro de motoristas.", columns: ["Motorista", "ID pacote", "ID motorista", "Base", "Rota", "Origem"], rows, actionHref: action.href, actionLabel: action.label };
  }

  if (issue.id === "duplicate-shipment") {
    const rows = duplicateGroups(data.prefatura).map(([shipmentId, group]) => ({
      key: shipmentId,
      cells: [shipmentId || "—", formatNumber(group.length), group.map((row) => row.sourceFile).filter(Boolean).filter((value, index, array) => array.indexOf(value) === index).join("; ") || "—", group.map((row) => String(row.rowNumber || "—")).join(", ")],
    }));
    return { title: "IDs de pacote repetidos", subtitle: "Duplicidades identificadas na Pré-fatura. A Conciliação de IDs permite analisar e manter a ocorrência mais recente.", columns: ["ID pacote", "Ocorrências", "Arquivo(s)", "Linha(s)"], rows, actionHref: action.href, actionLabel: action.label };
  }

  if (issue.id === "missing-id") {
    const rows = [
      ...data.prefatura.filter((row) => !row.shipmentId).map((row) => ({ key: `pf-${row.batchId}-${row.rowNumber}`, cells: ["Pré-fatura", row.baseName || row.baseKey || "—", row.routeId || "—", row.routeDate || "—", trace(row.sourceFile, row.sourceSheet, row.rowNumber)] })),
      ...data.pnr.filter((row) => !row.shipmentId).map((row) => ({ key: `pnr-${row.batchId}-${row.rowNumber}`, cells: ["PNR", row.baseName || row.baseKey || row.originStation || "—", row.routeId || "—", row.caseDate || "—", trace(row.sourceFile, row.sourceSheet, row.rowNumber)] })),
      ...data.risk.filter((row) => !row.shipmentId).map((row) => ({ key: `risk-${row.batchId}-${row.rowNumber}`, cells: ["Risco LM", row.baseName || row.baseKey || row.facilityId || "—", row.routeId || "—", row.failureDate || "—", trace(row.sourceFile, row.sourceSheet, row.rowNumber)] })),
    ];
    return { title: "Linhas sem ID obrigatório", subtitle: "Linhas que não participam da conciliação porque o identificador obrigatório não foi localizado.", columns: ["Fonte", "Base", "Rota", "Data", "Origem"], rows, actionHref: action.href, actionLabel: action.label };
  }

  if (issue.id === "shared-supervisor") {
    const groups = new Map<string, typeof data.hierarchy>();
    data.hierarchy.forEach((row) => {
      const unit = row.unitKey || `${row.sigla}|${row.baseKey}`;
      groups.set(unit, [...(groups.get(unit) ?? []), row]);
    });
    const rows = [...groups.entries()].flatMap(([unit, group]) => {
      const supervisors = [...new Set(group.map((row) => row.supervisor).filter(Boolean))];
      if (supervisors.length <= 1) return [];
      const first = group[0];
      return [{ key: unit, cells: [first.sigla || "—", first.base || first.baseKey || "—", supervisors.join("; "), formatNumber(group.length), trace(first.sourceFile, first.sourceSheet, first.rowNumber)] }];
    });
    return { title: "Supervisão compartilhada", subtitle: "Bases com mais de um supervisor cadastrado. Revise a hierarquia quando o compartilhamento não for intencional.", columns: ["Sigla", "Base", "Supervisores", "Vínculos", "Origem"], rows, actionHref: action.href, actionLabel: action.label };
  }

  return null;
}

export function QualityView() {
  const data = useDashboardStore((state) => state.data);
  const [selectedIssue, setSelectedIssue] = useState<QualityIssue | null>(null);
  const [revalidating, setRevalidating] = useState(false);
  const issues = qualityIssues(data);
  const critical = issues.filter((issue) => issue.severity === "Crítico" && issue.count > 0);
  const warnings = issues.filter((issue) => issue.severity === "Atenção" && issue.count > 0);
  const totalRows = data.hierarchy.length + data.prefatura.length + data.pnr.length + data.risk.length + data.drivers.length;
  const impacted = issues.reduce((sum, issue) => sum + issue.count, 0);
  const score = totalRows ? Math.max(0, 100 - Math.min(100, (impacted / totalRows) * 100)) : 0;
  const detail = selectedIssue ? qualityDetail(selectedIssue, data) : null;

  const revalidate = async () => {
    setRevalidating(true);
    try {
      const owner = useDashboardStore.getState().cacheOwnerId;
      useDashboardStore.setState({ lastSyncedAt: 0 });
      if (owner) await useDashboardStore.getState().hydrate(owner);
      setSelectedIssue(null);
    } finally {
      setRevalidating(false);
    }
  };

  return (
    <div className="view-stack">
      <PageIntro description="As regras verificam grão, chaves, cobertura da hierarquia e capacidade de cruzamento. Alertas desaparecem somente depois que a origem é corrigida e a qualidade é revalidada." chips={[`${issues.length} regras ativas`, `${formatNumber(totalRows)} linhas avaliadas`]} />
      <div className="kpi-grid kpi-grid--four">
        <KpiCard label="Índice de confiança" value={`${score.toFixed(1)}%`} detail="Registros sem alerta" icon={<ShieldCheck size={19} />} tone={score >= 95 ? "green" : score >= 80 ? "amber" : "red"} />
        <KpiCard label="Regras críticas" value={formatNumber(critical.length)} detail="Exigem correção" icon={<CircleAlert size={19} />} tone={critical.length ? "red" : "green"} />
        <KpiCard label="Pontos de atenção" value={formatNumber(warnings.length)} detail="Afetam filtros ou vínculos" icon={<DatabaseZap size={19} />} tone={warnings.length ? "amber" : "green"} />
        <KpiCard label="Regras aprovadas" value={formatNumber(issues.filter((issue) => issue.count === 0).length)} detail="Sem ocorrência" icon={<CheckCircle2 size={19} />} tone="green" />
      </div>
      <Panel
        title="Matriz de qualidade"
        subtitle="Detecte, visualize a ocorrência, corrija na origem e revalide. Não existe baixa manual de alerta."
        action={<button className="secondary-button" type="button" onClick={() => void revalidate()} disabled={revalidating} title="Revalidar qualidade dos dados"><RefreshCw size={14} className={revalidating ? "spin" : ""} />{revalidating ? "Revalidando..." : "Revalidar qualidade"}</button>}
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
                  <button className="table-action" type="button" title="Ver ocorrências" aria-label={`Ver ocorrências de ${issue.rule}`} onClick={() => setSelectedIssue(issue)}><Eye size={15} /></button>
                  <button className="table-action" type="button" title={action.title} aria-label={action.label} onClick={() => window.location.assign(action.href)}><Wrench size={15} /></button>
                </div> : <span className="muted">—</span>}
              </td>
            </tr>;
          })}</tbody>
        </TableWrap>
      </Panel>
      <div className="quality-callout"><CircleAlert size={19} /><div><strong>Sobre supervisor × motorista</strong><p>A hierarquia informa os supervisores de cada base, mas as fontes operacionais não trazem supervisor. Quando há mais de um supervisor na mesma sigla, o filtro mostra o escopo compartilhado da base e não inventa uma atribuição individual.</p></div></div>

      {selectedIssue && detail ? <div role="dialog" aria-modal="true" aria-label={detail.title} style={{ position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center", padding: 24, background: "rgba(16,17,20,.42)" }}>
        <div style={{ width: "min(1180px, 96vw)", maxHeight: "88vh", overflow: "auto", background: "#fff", borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,.18)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, padding: 20, borderBottom: "1px solid #eceef1" }}>
            <div><small className="muted">QUALIDADE DOS DADOS</small><h3 style={{ margin: "4px 0 0" }}>{detail.title}</h3><p className="muted" style={{ margin: "6px 0 0" }}>{detail.subtitle}</p></div>
            <button className="table-action" type="button" title="Fechar" onClick={() => setSelectedIssue(null)}><X size={17} /></button>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}><StatusBadge tone={selectedIssue.severity === "Crítico" ? "red" : "amber"}>{formatNumber(detail.rows.length)} ocorrências</StatusBadge>{detail.rows.length > 100 ? <span className="muted">Mostrando as primeiras 100 para análise rápida.</span> : null}</div>
            <TableWrap><thead><tr>{detail.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{detail.rows.slice(0, 100).map((row) => <tr key={row.key}>{row.cells.map((cell, index) => <td key={`${row.key}-${index}`}><span className={index === 1 && /ID|pacote/i.test(detail.columns[index] || "") ? "mono" : ""}>{cell}</span></td>)}</tr>)}</tbody></TableWrap>
            {!detail.rows.length ? <div style={{ padding: 24, textAlign: "center" }} className="muted">Nenhuma ocorrência permanece neste momento. Revalide a matriz.</div> : null}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
              <button className="secondary-button" type="button" onClick={() => setSelectedIssue(null)}>Fechar</button>
              <button className="primary-button" type="button" onClick={() => window.location.assign(detail.actionHref)}><Wrench size={15} />{detail.actionLabel}<ArrowRight size={14} /></button>
            </div>
          </div>
        </div>
      </div> : null}
    </div>
  );
}
