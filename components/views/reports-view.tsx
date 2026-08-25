"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BadgeDollarSign, Boxes, Building2, CalendarDays, Download, FileSpreadsheet, RotateCcw, Users } from "lucide-react";
import { toast } from "sonner";
import { scopeData } from "@/lib/dashboard-scope";
import { fortnightFromDate, latestPnrByShipment, monthFromFortnight, normalizeFortnight } from "@/lib/metrics";
import { useDashboardStore } from "@/lib/store";
import type { ImportEntry, PrefaturaRecord } from "@/lib/types";
import { formatCurrency, formatNumber, KpiCard, Panel, PageIntro, StatusBadge } from "@/components/ui";
import { ChartTooltip, NoResults, TableWrap } from "./shared";

type ReportKind = "PNR" | "PERDIDO";

type ReportRow = {
  shipmentId: string;
  date: string | null;
  status: string;
  base: string;
  xpt: string;
  driverName: string;
  driverId: string;
  routeId: string;
  value: number;
  carrier: string;
  origin: string;
  operation: string;
  competence: string;
  fortnight: string;
  sourceFile: string;
};

function latestPrefaturaByShipment(records: PrefaturaRecord[], imports: ImportEntry[]) {
  const importTime = new Map(imports.map((entry) => [entry.batchId, Date.parse(entry.importedAt) || 0]));
  const latest = new Map<string, PrefaturaRecord>();
  for (const record of records) {
    if (!record.shipmentId) continue;
    const current = latest.get(record.shipmentId);
    if (!current) {
      latest.set(record.shipmentId, record);
      continue;
    }
    const recordTime = importTime.get(record.batchId) ?? 0;
    const currentTime = importTime.get(current.batchId) ?? 0;
    if (recordTime > currentTime || (recordTime === currentTime && record.rowNumber > current.rowNumber)) latest.set(record.shipmentId, record);
  }
  return [...latest.values()];
}

function monthLabel(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) return value || "Todos";
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}-01T12:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function fortnightLabel(value: string) {
  if (!value) return "—";
  return value.startsWith("01Q") ? "1Q" : value.startsWith("02Q") ? "2Q" : value;
}

function periodFor(value: string | null | undefined, date: string | null) {
  return normalizeFortnight(value) || fortnightFromDate(date);
}

function dateInRange(date: string | null, start: string, end: string) {
  if (!date) return !start && !end;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function brDate(value: string | null) {
  return value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "—";
}

function baseLabel(sigla: string, name: string, fallback: string) {
  const base = name || fallback || "—";
  return sigla && base !== "—" ? `${sigla} - ${base}` : base;
}

function fileToken(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

export function ReportsView() {
  const data = useDashboardStore((state) => state.data);
  const filters = useDashboardStore((state) => state.filters);
  const [kind, setKind] = useState<ReportKind>("PNR");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [exporting, setExporting] = useState(false);
  const scoped = scopeData(data, filters);

  const rows = useMemo<ReportRow[]>(() => {
    const driversById = new Map(data.drivers.map((driver) => [driver.driverId, driver.name]));
    if (kind === "PNR") {
      return latestPnrByShipment(scoped.pnr, data.imports).map((row) => {
        const period = periodFor(row.billingPeriod, row.caseDate);
        return {
          shipmentId: row.shipmentId,
          date: row.caseDate,
          status: row.status || "Sem status",
          base: baseLabel(row.sigla, row.baseName || row.originStation, row.baseKey),
          xpt: row.xptCode || "—",
          driverName: driversById.get(row.driverId) || row.driverId || "Não identificado",
          driverId: row.driverId || "—",
          routeId: row.routeId || "—",
          value: Number(row.purchaseValue || 0),
          carrier: row.carrier || "—",
          origin: row.originStation || "—",
          operation: "PNR",
          competence: monthFromFortnight(period) || row.caseDate?.slice(0, 7) || "",
          fortnight: period,
          sourceFile: row.sourceFile || "—",
        };
      });
    }

    return latestPrefaturaByShipment(scoped.prefatura, data.imports).map((row) => {
      const period = periodFor(row.period, row.routeDate);
      return {
        shipmentId: row.shipmentId,
        date: row.routeDate,
        status: "Pacote perdido",
        base: baseLabel(row.sigla, row.baseName, row.baseLabel || row.baseKey),
        xpt: row.xptCode || "—",
        driverName: row.driverName || "Não identificado",
        driverId: row.driverId || "—",
        routeId: row.routeId || "—",
        value: Number(row.value || 0),
        carrier: "—",
        origin: row.baseLabel || row.baseName || row.baseKey || "—",
        operation: row.operation || "—",
        competence: monthFromFortnight(period) || row.routeDate?.slice(0, 7) || "",
        fortnight: period,
        sourceFile: row.sourceFile || "—",
      };
    });
  }, [kind, scoped.pnr, scoped.prefatura, data.imports, data.drivers]);

  const dateFiltered = useMemo(() => rows.filter((row) => dateInRange(row.date, dateStart, dateEnd)), [rows, dateStart, dateEnd]);
  const statusOptions = useMemo(() => [...new Set(dateFiltered.map((row) => row.status).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [dateFiltered]);
  const filtered = useMemo(() => kind === "PNR" && statusFilter !== "TODOS" ? dateFiltered.filter((row) => row.status === statusFilter) : dateFiltered, [dateFiltered, kind, statusFilter]);
  const totalValue = filtered.reduce((sum, row) => sum + row.value, 0);
  const bases = new Set(filtered.map((row) => row.base).filter((value) => value && value !== "—"));
  const drivers = new Set(filtered.map((row) => row.driverId !== "—" ? row.driverId : row.driverName).filter(Boolean));

  const analysis = useMemo(() => {
    const map = new Map<string, { label: string; cases: number; value: number }>();
    filtered.forEach((row) => {
      const label = kind === "PNR" ? row.status : row.base;
      const current = map.get(label) ?? { label, cases: 0, value: 0 };
      current.cases += 1;
      current.value += row.value;
      map.set(label, current);
    });
    return [...map.values()].sort((a, b) => b.value - a.value).slice(0, 10);
  }, [filtered, kind]);

  const globalPeriod = `${filters.month === "Todos" ? "Todos os meses" : monthLabel(filters.month)} · ${filters.fortnight === "Todas" ? "Todas as quinzenas" : filters.fortnight}`;

  const resetLocal = () => {
    setDateStart("");
    setDateEnd("");
    setStatusFilter("TODOS");
  };

  const exportXlsx = async () => {
    if (!filtered.length) {
      toast.error("Não há registros no recorte atual para exportar.");
      return;
    }
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const reportTitle = kind === "PNR" ? "RELATÓRIO DE PNR" : "RELATÓRIO DE PACOTES PERDIDOS";
      const generatedAt = new Date();
      const periodText = [filters.month === "Todos" ? "Todos os meses" : monthLabel(filters.month), filters.fortnight === "Todas" ? "Todas as quinzenas" : filters.fortnight].join(" · ");
      const filterLines = [
        ["Tipo", kind === "PNR" ? "PNR" : "Pacotes Perdidos"],
        ["Competência", periodText],
        ["Data inicial", dateStart ? brDate(dateStart) : "Todas"],
        ["Data final", dateEnd ? brDate(dateEnd) : "Todas"],
        ["Status PNR", kind === "PNR" ? (statusFilter === "TODOS" ? "Todos" : statusFilter) : "Não se aplica"],
        ["Base", filters.base],
        ["XPT", filters.xpt],
        ["Coordenador", filters.coordinator],
        ["Operação", filters.operation],
        ["Supervisor", filters.supervisor],
        ["Motorista", filters.driver],
      ];

      const dataHeaders = kind === "PNR"
        ? ["ID de envio", "Data do caso", "Status", "Base", "XPT", "Motorista", "ID Motorista", "Rota", "Valor", "Transportadora", "Origem", "Competência", "Quinzena", "Arquivo de origem"]
        : ["ID do pacote", "Data", "Base", "XPT", "Motorista", "ID Motorista", "Rota", "Valor", "Operação", "Competência", "Quinzena", "Arquivo de origem"];
      const dataRows = filtered.map((row) => kind === "PNR"
        ? [row.shipmentId, row.date ? new Date(`${row.date}T12:00:00`) : null, row.status, row.base, row.xpt, row.driverName, row.driverId, row.routeId, row.value, row.carrier, row.origin, row.competence ? monthLabel(row.competence) : "—", fortnightLabel(row.fortnight), row.sourceFile]
        : [row.shipmentId, row.date ? new Date(`${row.date}T12:00:00`) : null, row.base, row.xpt, row.driverName, row.driverId, row.routeId, row.value, row.operation, row.competence ? monthLabel(row.competence) : "—", fortnightLabel(row.fortnight), row.sourceFile]);

      const dataSheet = XLSX.utils.aoa_to_sheet([
        ["ALC | DADOS DO RELATÓRIO"],
        ["Registros visíveis após filtros do Excel", null],
        ["Valor visível após filtros do Excel", null],
        [],
        dataHeaders,
        ...dataRows,
      ], { cellDates: true });
      const endRow = dataRows.length + 5;
      const valueColumnIndex = kind === "PNR" ? 8 : 7;
      const valueColumnLetter = XLSX.utils.encode_col(valueColumnIndex);
      dataSheet.B2 = { t: "n", f: `SUBTOTAL(103,A6:A${endRow})` };
      dataSheet.B3 = { t: "n", f: `SUBTOTAL(109,${valueColumnLetter}6:${valueColumnLetter}${endRow})`, z: "R$ #,##0.00" };
      dataSheet["!autofilter"] = { ref: `A5:${XLSX.utils.encode_col(dataHeaders.length - 1)}${endRow}` };
      dataSheet["!cols"] = dataHeaders.map((header, index) => ({ wch: index === 0 ? 18 : /Motorista|Arquivo|Base|Transportadora|Origem/.test(header) ? 25 : /Valor/.test(header) ? 15 : 14 }));
      for (let row = 6; row <= endRow; row += 1) {
        const dateCell = dataSheet[`B${row}`];
        if (dateCell) dateCell.z = "dd/mm/yyyy";
        const valueCell = dataSheet[`${valueColumnLetter}${row}`];
        if (valueCell) valueCell.z = "R$ #,##0.00";
      }

      const summaryRows: Array<Array<string | number | Date | null>> = [
        ["ALC | INTELIGÊNCIA OPERACIONAL"],
        [reportTitle],
        [`Gerado pelo Inteligência ALC em ${generatedAt.toLocaleString("pt-BR")}`],
        [],
        ["TIPO", kind === "PNR" ? "PNR" : "Pacotes Perdidos", "PERÍODO", periodText, "DATA INICIAL", dateStart ? brDate(dateStart) : "Todas", "DATA FINAL", dateEnd ? brDate(dateEnd) : "Todas"],
        [],
        ["INDICADORES DO RECORTE"],
        ["Registros", filtered.length, "Valor total", totalValue, "Bases", bases.size, "Motoristas", drivers.size],
        [],
        ["VISÃO DINÂMICA - aplique filtros na aba Dados"],
        ["Registros visíveis", null, "Valor visível", null],
        [],
        ["FILTROS APLICADOS"],
        ...filterLines.map(([label, value]) => [label, value]),
        [],
        [kind === "PNR" ? "DISTRIBUIÇÃO POR STATUS" : "DISTRIBUIÇÃO POR BASE"],
        [kind === "PNR" ? "Status" : "Base", "Casos", "Valor"],
        ...analysis.map((item) => [item.label, item.cases, item.value]),
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
      summarySheet.B11 = { t: "n", f: "'Dados'!B2" };
      summarySheet.D11 = { t: "n", f: "'Dados'!B3", z: "R$ #,##0.00" };
      summarySheet.D8 = { t: "n", v: totalValue, z: "R$ #,##0.00" };
      const analysisStart = 17 + filterLines.length;
      for (let row = analysisStart + 2; row <= analysisStart + 1 + analysis.length; row += 1) {
        const valueCell = summarySheet[`C${row}`];
        if (valueCell) valueCell.z = "R$ #,##0.00";
      }
      summarySheet["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } },
        { s: { r: 6, c: 0 }, e: { r: 6, c: 7 } },
        { s: { r: 9, c: 0 }, e: { r: 9, c: 7 } },
        { s: { r: 12, c: 0 }, e: { r: 12, c: 7 } },
      ];
      summarySheet["!cols"] = [{ wch: 24 }, { wch: 28 }, { wch: 20 }, { wch: 21 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];

      const analysisSheet = XLSX.utils.aoa_to_sheet([
        ["ALC | ANÁLISE DO RELATÓRIO"],
        [kind === "PNR" ? "Status com maior exposição financeira" : "Bases com maior impacto financeiro"],
        [],
        ["#", kind === "PNR" ? "Status" : "Base", "Casos", "Valor", "% do valor total"],
        ...analysis.map((item, index) => [index + 1, item.label, item.cases, item.value, totalValue ? item.value / totalValue : 0]),
      ]);
      analysisSheet["!cols"] = [{ wch: 6 }, { wch: 38 }, { wch: 12 }, { wch: 18 }, { wch: 18 }];
      for (let row = 5; row <= 4 + analysis.length; row += 1) {
        const valueCell = analysisSheet[`D${row}`];
        if (valueCell) valueCell.z = "R$ #,##0.00";
        const pctCell = analysisSheet[`E${row}`];
        if (pctCell) pctCell.z = "0.0%";
      }

      const workbook = XLSX.utils.book_new();
      (workbook as unknown as { Props?: Record<string, unknown>; Workbook?: Record<string, unknown> }).Props = {
        Title: `ALC - ${reportTitle}`,
        Subject: "Relatório gerencial gerado pelo Inteligência ALC",
        Author: "Inteligência ALC",
        Company: "ALC",
        CreatedDate: generatedAt,
      };
      (workbook as unknown as { Workbook?: Record<string, unknown> }).Workbook = { CalcPr: { calcMode: "auto", fullCalcOnLoad: true, forceFullCalc: true } };
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumo Executivo");
      XLSX.utils.book_append_sheet(workbook, analysisSheet, "Análise");
      XLSX.utils.book_append_sheet(workbook, dataSheet, "Dados");

      const styleCell = (sheet: ReturnType<typeof XLSX.utils.aoa_to_sheet>, address: string, style: Record<string, unknown>) => {
        const cell = sheet[address] as ({ s?: Record<string, unknown> } | undefined);
        if (cell) cell.s = style;
      };
      const alcRed = { fill: { fgColor: { rgb: "E30613" } }, font: { bold: true, color: { rgb: "FFFFFF" }, sz: 15 }, alignment: { vertical: "center" } };
      const alcDark = { fill: { fgColor: { rgb: "25272B" } }, font: { bold: true, color: { rgb: "FFFFFF" } } };
      const sectionStyle = { fill: { fgColor: { rgb: "F3F4F6" } }, font: { bold: true, color: { rgb: "E30613" } } };
      ["A1", "A2"].forEach((address) => styleCell(summarySheet, address, alcRed));
      ["A7", "A10", "A13", `A${analysisStart}`].forEach((address) => styleCell(summarySheet, address, sectionStyle));
      dataHeaders.forEach((_, index) => styleCell(dataSheet, `${XLSX.utils.encode_col(index)}5`, alcDark));
      styleCell(dataSheet, "A1", alcRed);
      styleCell(analysisSheet, "A1", alcRed);
      ["A4", "B4", "C4", "D4", "E4"].forEach((address) => styleCell(analysisSheet, address, alcDark));

      const datePart = dateStart || dateEnd ? `${dateStart || "INICIO"}_A_${dateEnd || "FIM"}` : filters.month !== "Todos" ? `${filters.fortnight !== "Todas" ? `${filters.fortnight}_` : ""}${filters.month}` : "GERAL";
      const filename = `ALC_${kind === "PNR" ? "RELATORIO_PNR" : "PACOTES_PERDIDOS"}_${fileToken(datePart)}.xlsx`;
      XLSX.writeFile(workbook, filename, { compression: true, cellStyles: true });
      toast.success(`${filename} gerado com Resumo Executivo, Análise e Dados filtráveis.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao gerar o relatório XLSX.");
    } finally {
      setExporting(false);
    }
  };

  if (!rows.length) return <NoResults title={kind === "PNR" ? "Nenhum caso PNR neste recorte" : "Nenhum pacote perdido neste recorte"} detail="Ajuste os filtros globais de período, base ou motorista." />;

  return (
    <div className="view-stack">
      <PageIntro description="Gere relatórios executivos ALC de PNR ou Pacotes Perdidos. Mês, quinzena e escopo operacional seguem os filtros globais; datas e status podem refinar o arquivo antes do download." chips={[globalPeriod, `${formatNumber(filtered.length)} registros no recorte`, "XLSX com dados filtráveis"]} />

      <Panel title="Configuração do relatório" subtitle="Escolha a origem e refine por data real. O acesso às bases continua respeitando o perfil do usuário." action={<button className="secondary-button" type="button" onClick={resetLocal}><RotateCcw size={14} />Limpar datas</button>}>
        <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
          <div className="filter-control" style={{ minWidth: 210 }}>
            <span>Tipo de relatório</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" className={kind === "PNR" ? "primary-button primary-button--small" : "secondary-button"} onClick={() => { setKind("PNR"); setStatusFilter("TODOS"); }}>PNR</button>
              <button type="button" className={kind === "PERDIDO" ? "primary-button primary-button--small" : "secondary-button"} onClick={() => { setKind("PERDIDO"); setStatusFilter("TODOS"); }}>Pacote perdido</button>
            </div>
          </div>
          <label className="filter-control"><span>Data inicial</span><input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} /></label>
          <label className="filter-control"><span>Data final</span><input type="date" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} /></label>
          {kind === "PNR" ? <label className="filter-control" style={{ minWidth: 190 }}><span>Status PNR</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="TODOS">Todos</option>{statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></label> : null}
          <div style={{ marginLeft: "auto" }}><button className="primary-button" type="button" onClick={() => void exportXlsx()} disabled={exporting || !filtered.length}><Download size={16} />{exporting ? "Gerando..." : "Baixar relatório XLSX"}</button></div>
        </div>
      </Panel>

      <div className="kpi-grid kpi-grid--four">
        <KpiCard label="IDs no relatório" value={formatNumber(filtered.length)} detail="Consolidados pelo registro mais recente" icon={<Boxes size={19} />} />
        <KpiCard label="Valor total" value={formatCurrency(totalValue)} detail={kind === "PNR" ? "Valor de compra" : "Valor de pré-fatura"} icon={<BadgeDollarSign size={19} />} tone="red" />
        <KpiCard label="Bases" value={formatNumber(bases.size)} detail="Unidades no recorte" icon={<Building2 size={19} />} />
        <KpiCard label="Motoristas" value={formatNumber(drivers.size)} detail="Identificados no relatório" icon={<Users size={19} />} tone="green" />
      </div>

      <div className="content-grid content-grid--wide">
        <Panel title={kind === "PNR" ? "Exposição por status" : "Impacto por base"} subtitle="Dez maiores grupos por valor" className="panel--chart">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analysis} layout="vertical" margin={{ left: 10, right: 24, top: 4 }}>
              <CartesianGrid stroke="#ECEDEF" horizontal={false} />
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#73767d" }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
              <YAxis type="category" dataKey="label" width={150} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#333" }} />
              <Tooltip content={<ChartTooltip currency />} />
              <Bar dataKey="value" name="Valor" fill="#E30613" radius={[0, 4, 4, 0]} maxBarSize={23} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Leitura do arquivo" subtitle="Estrutura gerada no XLSX" className="panel--chart">
          <div style={{ display: "grid", gap: 10 }}>
            <div className="quality-callout" style={{ margin: 0 }}><FileSpreadsheet size={18} /><div><strong>Resumo Executivo</strong><p>Identidade ALC, filtros utilizados, indicadores e distribuição financeira do recorte.</p></div></div>
            <div className="quality-callout" style={{ margin: 0 }}><CalendarDays size={18} /><div><strong>Análise</strong><p>Ranking de status ou bases para leitura gerencial rápida.</p></div></div>
            <div className="quality-callout" style={{ margin: 0 }}><Download size={18} /><div><strong>Dados dinâmicos</strong><p>Filtros nativos do Excel e totais via SUBTOTAL que mudam conforme as linhas visíveis.</p></div></div>
          </div>
        </Panel>
      </div>

      <Panel title="Prévia do relatório" subtitle="Primeiros 50 registros do arquivo que será gerado" action={<StatusBadge tone="neutral">{filtered.length} IDs</StatusBadge>}>
        <TableWrap>
          <thead><tr><th>ID</th><th>Data</th>{kind === "PNR" ? <th>Status</th> : <th>Operação</th>}<th>Base</th><th>XPT</th><th>Motorista</th><th>Rota</th><th className="align-right">Valor</th></tr></thead>
          <tbody>{filtered.slice(0, 50).map((row) => <tr key={`${row.shipmentId}-${row.sourceFile}`}><td><strong className="mono">{row.shipmentId}</strong><small className="cell-subtitle">{row.sourceFile}</small></td><td>{brDate(row.date)}</td><td>{kind === "PNR" ? <StatusBadge tone={/penal/i.test(row.status) ? "red" : /aguard|revis/i.test(row.status) ? "amber" : /fatur/i.test(row.status) ? "green" : "neutral"}>{row.status}</StatusBadge> : row.operation}</td><td><strong>{row.base}</strong></td><td className="mono">{row.xpt}</td><td>{row.driverName}</td><td className="mono">{row.routeId}</td><td className="align-right"><strong>{formatCurrency(row.value)}</strong></td></tr>)}</tbody>
        </TableWrap>
        {!filtered.length ? <div style={{ padding: 20 }}><NoResults title="Nenhum registro corresponde às datas selecionadas" detail="Limpe o intervalo de datas ou ajuste os filtros globais." /></div> : null}
      </Panel>
    </div>
  );
}
