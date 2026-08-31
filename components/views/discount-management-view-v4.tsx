"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeDollarSign,
  Building2,
  ChartNoAxesCombined,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Users,
} from "lucide-react";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { toast } from "sonner";
import { Panel, formatCurrency, formatNumber, formatPercent } from "@/components/ui";
import {
  DISCOUNT_DIRECTIONS,
  DISCOUNT_DIRECTION_LABELS,
  type DiscountDirection,
} from "@/lib/discount-management";
import { DiscountManagementViewV3 } from "./discount-management-view-v3";

type DiscountReportRow = {
  id: string;
  shipment_id: string;
  allocation_no: number;
  allocation_amount: number | null;
  allocation_target_id: string | null;
  allocation_target_name: string | null;
  direction: DiscountDirection;
  note: string | null;
  source_kind: string;
  source_period: string | null;
  discount_month: string | null;
  source_file: string | null;
  source_sheet: string | null;
  created_by: string | null;
  updated_at: string;
  driver_id: string | null;
  driver_name: string | null;
  base_key: string | null;
  base_name: string | null;
  sigla: string | null;
  xpt_code: string | null;
  route_id: string | null;
  event_date: string | null;
  amount: number;
  amount_source: string;
  pnr_status: string | null;
  month: string | null;
  fortnight: string | null;
  origin: string;
};

type AnalysisRow = { label: string; count: number; value: number; share: number };

const API = "/api/discount-management-v2";
const ALL = "TODOS";

const BRAND = {
  red: "E30613",
  redDark: "B8000B",
  charcoal: "25272B",
  gray700: "60636A",
  gray500: "8D9097",
  gray300: "D7D9DD",
  gray200: "E8E9EC",
  gray100: "F3F4F6",
  white: "FFFFFF",
  lightRed: "FFF3F4",
  lightGreen: "EDF7F2",
  lightAmber: "FFF7E8",
  altRow: "FAFAFB",
};

function formatMonth(value: string | null | undefined) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(Number(match[1]), Number(match[2]) - 1, 1),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatFortnight(value: string | null | undefined) {
  if (!value) return "—";
  const match = /^(0?[12])Q(\d{2})(\d{4})$/i.exec(value);
  if (!match) return value;
  const month = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(
    new Date(Number(match[3]), Number(match[2]) - 1, 1),
  );
  return `${Number(match[1])}Q · ${month}/${match[3]}`;
}

function directionLabel(value: DiscountDirection) {
  return DISCOUNT_DIRECTION_LABELS[value] || value;
}

function baseLabel(row: DiscountReportRow) {
  if (row.sigla && row.base_name) return `${row.sigla} · ${row.base_name}`;
  return row.base_name || row.base_key || row.sigla || "Não conciliada";
}

function driverLabel(row: DiscountReportRow) {
  return row.driver_name || row.driver_id || "Não identificado";
}

function targetLabel(row: DiscountReportRow) {
  if (row.allocation_target_name && row.allocation_target_id) return `${row.allocation_target_name} · ${row.allocation_target_id}`;
  return row.allocation_target_name || row.allocation_target_id || "Não informado";
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function fileToken(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

function groupAnalysis(rows: DiscountReportRow[], key: (row: DiscountReportRow) => string, totalValue: number): AnalysisRow[] {
  const map = new Map<string, { label: string; count: number; value: number }>();
  rows.forEach((row) => {
    const label = key(row) || "Não identificado";
    const current = map.get(label) ?? { label, count: 0, value: 0 };
    current.count += 1;
    current.value += Number(row.amount || 0);
    map.set(label, current);
  });
  return [...map.values()].map((item) => ({ ...item, share: totalValue ? item.value / totalValue : 0 })).sort((a, b) => b.value - a.value);
}

function textBar(share: number, width = 18) {
  if (!share) return "";
  const filled = Math.max(1, Math.min(width, Math.round(share * width)));
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

function columnIndex(letters: string) {
  return letters.split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function cellStyleXml(xml: string, picker: (column: string, row: number) => number | null | undefined) {
  return xml.replace(/<c\b([^>]*\br="([A-Z]+)(\d+)"[^>]*)>/g, (whole, attrs: string, column: string, rowText: string) => {
    const style = picker(column, Number(rowText));
    if (style === null || style === undefined) return whole;
    const nextAttrs = /\ss="\d+"/.test(attrs) ? attrs.replace(/\ss="\d+"/, ` s="${style}"`) : `${attrs} s="${style}"`;
    return `<c${nextAttrs}>`;
  });
}

function hideGridlines(xml: string) {
  return xml.replace(/<sheetView workbookViewId="0"\s*\/>/, '<sheetView workbookViewId="0" showGridLines="0"/>').replace(/<sheetView workbookViewId="0">/, '<sheetView workbookViewId="0" showGridLines="0">');
}

function freezeRows(xml: string, rows: number) {
  const pane = `<pane ySplit="${rows}" topLeftCell="A${rows + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${rows + 1}" sqref="A${rows + 1}"/>`;
  return xml.replace(/<sheetView workbookViewId="0" showGridLines="0"\s*\/>/, `<sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView>`).replace(/<sheetView workbookViewId="0"\s*\/>/, `<sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView>`);
}

function discountStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="60" formatCode="R$ #,##0.00"/><numFmt numFmtId="61" formatCode="0.0%"/><numFmt numFmtId="62" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="9">
<font><sz val="10"/><color rgb="${BRAND.charcoal}"/><name val="Poppins"/><family val="2"/></font>
<font><b/><sz val="22"/><color rgb="${BRAND.red}"/><name val="Montserrat"/><family val="2"/></font>
<font><b/><sz val="13"/><color rgb="${BRAND.charcoal}"/><name val="Montserrat"/><family val="2"/></font>
<font><sz val="9"/><color rgb="${BRAND.gray700}"/><name val="Poppins"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="${BRAND.red}"/><name val="Montserrat"/><family val="2"/></font>
<font><b/><sz val="9"/><color rgb="${BRAND.gray700}"/><name val="Poppins"/><family val="2"/></font>
<font><b/><sz val="17"/><color rgb="${BRAND.charcoal}"/><name val="Montserrat"/><family val="2"/></font>
<font><b/><sz val="9"/><color rgb="${BRAND.white}"/><name val="Poppins"/><family val="2"/></font>
<font><sz val="10"/><color rgb="${BRAND.charcoal}"/><name val="Poppins"/><family val="2"/></font>
</fonts>
<fills count="9">
<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${BRAND.white}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${BRAND.red}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${BRAND.gray100}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${BRAND.lightRed}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${BRAND.lightGreen}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${BRAND.lightAmber}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${BRAND.altRow}"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="4">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="${BRAND.gray200}"/></left><right style="thin"><color rgb="${BRAND.gray200}"/></right><top style="thin"><color rgb="${BRAND.gray200}"/></top><bottom style="thin"><color rgb="${BRAND.gray200}"/></bottom><diagonal/></border>
<border><left/><right/><top/><bottom style="medium"><color rgb="${BRAND.red}"/></bottom><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="${BRAND.gray200}"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="27">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="60" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="61" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="62" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="4" fillId="4" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="5" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="6" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="60" fontId="6" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="7" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="8" fillId="2" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="8" fillId="8" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="60" fontId="8" fillId="2" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="60" fontId="8" fillId="8" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="62" fontId="8" fillId="2" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="62" fontId="8" fillId="8" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="61" fontId="8" fillId="2" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="61" fontId="8" fillId="8" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="8" fillId="2" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="8" fillId="8" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="8" fillId="5" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="8" fillId="6" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="8" fillId="7" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleMedium9"/>
</styleSheet>`;
}

function appendDrawingRelationship(relsXml: string | null) {
  const base = relsXml ?? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  const ids = [...base.matchAll(/Id="rId(\d+)"/g)].map((match) => Number(match[1]));
  const id = `rId${Math.max(0, ...ids) + 1}`;
  const relation = `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>`;
  return { id, xml: base.replace("</Relationships>", `${relation}</Relationships>`) };
}

function addLogoDrawing(files: Record<string, Uint8Array>, logo: Uint8Array) {
  const relPath = "xl/worksheets/_rels/sheet1.xml.rels";
  const existingRels = files[relPath] ? strFromU8(files[relPath]) : null;
  const relationship = appendDrawingRelationship(existingRels);
  files[relPath] = strToU8(relationship.xml);
  let sheetXml = strFromU8(files["xl/worksheets/sheet1.xml"]);
  if (!sheetXml.includes("<drawing ")) sheetXml = sheetXml.replace("</worksheet>", `<drawing r:id="${relationship.id}"/></worksheet>`);
  files["xl/worksheets/sheet1.xml"] = strToU8(sheetXml);
  files["xl/drawings/drawing1.xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>120000</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>90000</xdr:rowOff></xdr:from><xdr:ext cx="2050000" cy="1050000"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="Logo ALC"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`);
  files["xl/drawings/_rels/drawing1.xml.rels"] = strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/alc-logo.png"/></Relationships>');
  files["xl/media/alc-logo.png"] = logo;
  let contentTypes = strFromU8(files["[Content_Types].xml"]);
  if (!contentTypes.includes('Extension="png"')) contentTypes = contentTypes.replace("</Types>", '<Default Extension="png" ContentType="image/png"/></Types>');
  if (!contentTypes.includes('PartName="/xl/drawings/drawing1.xml"')) contentTypes = contentTypes.replace("</Types>", '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
  files["[Content_Types].xml"] = strToU8(contentTypes);
}

function directionStyleId(direction: DiscountDirection | undefined) {
  if (direction === "absorvido_alc" || direction === "abono") return 24;
  if (direction === "em_analise" || direction === "desconto_dispatcher") return 25;
  if (direction === "desconto_driver") return 23;
  return null;
}

function patchDiscountWorkbook(workbookBytes: ArrayBuffer, logoBytes: Uint8Array, rows: DiscountReportRow[], detailHeaderRow: number, rawHeaderRow: number, detailValueColumn: string, rawValueColumn: string) {
  const files = unzipSync(new Uint8Array(workbookBytes));
  files["xl/styles.xml"] = strToU8(discountStylesXml());
  const summary = hideGridlines(strFromU8(files["xl/worksheets/sheet1.xml"]));
  files["xl/worksheets/sheet1.xml"] = strToU8(cellStyleXml(summary, (column, row) => {
    const col = columnIndex(column);
    if (row <= 4 && col >= 3) return row === 1 ? 4 : row === 2 ? 5 : 6;
    if ([7, 11, 16, 25, 35].includes(row)) return 7;
    if (row === 8) return 8;
    if (row === 9) return Math.floor(col / 2) === 2 ? 10 : 9;
    if (row === 10) return 11;
    if (row >= 12 && row <= 13) return 21;
    if ([17, 26].includes(row)) return 12;
    if (row >= 18 && row <= 23) { const alt = row % 2 === 1; if (col === 3) return alt ? 16 : 15; if (col === 4) return alt ? 20 : 19; return alt ? 14 : 13; }
    if (row >= 27 && row <= 33) { const alt = row % 2 === 0; if ([3, 9].includes(col)) return alt ? 16 : 15; if ([4, 10].includes(col)) return alt ? 20 : 19; return alt ? 14 : 13; }
    if (row >= 36 && row <= 37) return col % 3 === 0 ? 8 : 13;
    if (row === 39) return 26;
    return null;
  }));
  const management = hideGridlines(strFromU8(files["xl/worksheets/sheet2.xml"]));
  files["xl/worksheets/sheet2.xml"] = strToU8(cellStyleXml(management, (column, row) => {
    if (row === 1) return 4; if (row === 2) return 5; if (row === 3) return 6; if ([5, 19].includes(row)) return 7; if ([6, 20].includes(row)) return 12;
    if ((row >= 7 && row <= 16) || (row >= 21 && row <= 35)) { const alt = row % 2 === 0; if (["D", "J"].includes(column)) return alt ? 16 : 15; if (["E", "K"].includes(column)) return alt ? 20 : 19; return alt ? 14 : 13; }
    return null;
  }));
  const detail = freezeRows(hideGridlines(strFromU8(files["xl/worksheets/sheet3.xml"])), detailHeaderRow);
  files["xl/worksheets/sheet3.xml"] = strToU8(cellStyleXml(detail, (column, row) => {
    if (row === 1) return 4; if (row === 2) return 6; if (row === 3) { if (["A", "C", "E"].includes(column)) return 8; if (column === "B") return 9; if (column === "D") return 10; return 13; }
    if (row === detailHeaderRow) return 12;
    if (row > detailHeaderRow) { const dataIndex = row - detailHeaderRow - 1; const alt = dataIndex % 2 === 1; if (column === "C") return alt ? 18 : 17; if (column === detailValueColumn) return alt ? 16 : 15; if (column === "M") return directionStyleId(rows[dataIndex]?.direction) ?? (alt ? 14 : 13); if (["N", "O"].includes(column)) return alt ? 22 : 21; return alt ? 14 : 13; }
    return null;
  }));
  const raw = freezeRows(hideGridlines(strFromU8(files["xl/worksheets/sheet4.xml"])), rawHeaderRow);
  files["xl/worksheets/sheet4.xml"] = strToU8(cellStyleXml(raw, (column, row) => {
    if (row === 1) return 4; if (row === 2) return 6; if (row === rawHeaderRow) return 12;
    if (row > rawHeaderRow) { const dataIndex = row - rawHeaderRow - 1; const alt = dataIndex % 2 === 1; if (column === "C") return alt ? 18 : 17; if (column === rawValueColumn) return alt ? 16 : 15; if (column === "M") return directionStyleId(rows[dataIndex]?.direction) ?? (alt ? 14 : 13); if (["N", "O", "R", "S", "T", "U"].includes(column)) return alt ? 22 : 21; return alt ? 14 : 13; }
    return null;
  }));
  addLogoDrawing(files, logoBytes);
  return zipSync(files, { level: 6 });
}

function downloadBlob(bytes: Uint8Array, filename: string) {
  const blobBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([blobBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportDiscountReport(rows: DiscountReportRow[], filters: { month: string; direction: string; base: string }) {
  if (!rows.length) throw new Error("Não há lançamentos no recorte atual para exportar.");
  const XLSX = await import("xlsx");
  const generatedAt = new Date();
  const totalValue = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const uniqueIds = new Set(rows.map((row) => row.shipment_id)).size;
  const bases = new Set(rows.map(baseLabel).filter((value) => value && value !== "Não conciliada"));
  const drivers = new Set(rows.map((row) => row.driver_id || row.driver_name).filter(Boolean));
  const directionAnalysis = groupAnalysis(rows, (row) => directionLabel(row.direction), totalValue);
  const baseAnalysis = groupAnalysis(rows, baseLabel, totalValue);
  const driverAnalysis = groupAnalysis(rows, driverLabel, totalValue);
  const targetAnalysis = groupAnalysis(rows, targetLabel, totalValue);
  const topDirection = directionAnalysis[0];
  const topBase = baseAnalysis[0];
  const monthText = filters.month === ALL ? "Todos os meses" : formatMonth(filters.month);
  const directionText = filters.direction === ALL ? "Todos os direcionamentos" : directionLabel(filters.direction as DiscountDirection);
  const baseText = filters.base === ALL ? "Todas as bases" : filters.base;
  const reportTitle = "RELATÓRIO EXECUTIVO — GESTÃO DE DESCONTOS";
  const summaryRows: Array<Array<string | number | Date | null>> = Array.from({ length: 40 }, () => []);
  summaryRows[0][3] = "INTELIGÊNCIA ALC"; summaryRows[1][3] = reportTitle; summaryRows[2][3] = `${monthText} · ${directionText} · ${baseText}`; summaryRows[3][3] = `Gerado em ${generatedAt.toLocaleString("pt-BR")} · Inteligência ALC`; summaryRows[6][0] = "INDICADORES PRINCIPAIS";
  const cardLabels = ["IDs ÚNICOS", "LANÇAMENTOS", "VALOR SOB GESTÃO", "BASES", "MOTORISTAS", "PRINCIPAL DIRECIONAMENTO"];
  const cardValues: Array<string | number> = [uniqueIds, rows.length, totalValue, bases.size, drivers.size, topDirection?.label || "—"];
  const cardDetails = ["Pacotes distintos no recorte", "Direcionamentos financeiros", "Soma dos lançamentos", "Unidades impactadas", "Motoristas identificados", topDirection ? `${formatPercent(topDirection.share * 100)} do valor` : "Sem concentração"];
  cardLabels.forEach((label, index) => { const col = index * 2; summaryRows[7][col] = label; summaryRows[8][col] = cardValues[index]; summaryRows[9][col] = cardDetails[index]; });
  summaryRows[10][0] = "LEITURA EXECUTIVA";
  summaryRows[11][0] = topDirection ? `${topDirection.label} concentra ${formatCurrency(topDirection.value)} em ${formatNumber(topDirection.count)} lançamento(s), equivalentes a ${formatPercent(topDirection.share * 100)} do valor sob gestão.` : "Não há concentração suficiente para uma leitura executiva.";
  summaryRows[11][7] = "COMO INTERPRETAR";
  summaryRows[12][7] = topBase ? `Comece pelo direcionamento financeiro. Em seguida, observe as bases e motoristas com maior impacto. ${topBase.label} lidera o recorte com ${formatCurrency(topBase.value)}. Use a aba Detalhamento para investigar cada ID e os totais visíveis após aplicar filtros no Excel.` : "Use a aba Detalhamento para investigar os IDs. Os totais visíveis se atualizam conforme os filtros aplicados no Excel.";
  summaryRows[15][0] = "DISTRIBUIÇÃO POR DIRECIONAMENTO"; summaryRows[16] = ["#", "Direcionamento", "Lançamentos", "Valor", "% do total"];
  directionAnalysis.slice(0, 6).forEach((item, index) => { summaryRows[17 + index] = [index + 1, item.label, item.count, item.value, item.share]; });
  summaryRows[24][0] = "MAIORES IMPACTOS"; summaryRows[25] = ["#", "Base", "Lançamentos", "Valor", "%", "", "#", "Motorista", "Lançamentos", "Valor", "%"];
  for (let index = 0; index < 7; index += 1) { const base = baseAnalysis[index]; const driver = driverAnalysis[index]; const row = 26 + index; if (base) summaryRows[row].splice(0, 5, index + 1, base.label, base.count, base.value, base.share); if (driver) summaryRows[row].splice(6, 5, index + 1, driver.label, driver.count, driver.value, driver.share); }
  summaryRows[34][0] = "FILTROS APLICADOS"; summaryRows[35] = ["Mês", monthText, "Direcionamento", directionText, "Base", baseText]; summaryRows[36] = ["Critério", "Competência financeira do desconto", "Dados", `${formatNumber(rows.length)} lançamento(s)`, "IDs únicos", uniqueIds]; summaryRows[38][0] = "Relatório gerado pelo Inteligência ALC · uso interno · Gestão de Descontos.";
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet["!merges"] = [
    { s: { r: 0, c: 3 }, e: { r: 0, c: 11 } }, { s: { r: 1, c: 3 }, e: { r: 1, c: 11 } }, { s: { r: 2, c: 3 }, e: { r: 2, c: 11 } }, { s: { r: 3, c: 3 }, e: { r: 3, c: 11 } }, { s: { r: 6, c: 0 }, e: { r: 6, c: 11 } },
    ...Array.from({ length: 6 }, (_, index) => ({ s: { r: 7, c: index * 2 }, e: { r: 7, c: index * 2 + 1 } })), ...Array.from({ length: 6 }, (_, index) => ({ s: { r: 8, c: index * 2 }, e: { r: 8, c: index * 2 + 1 } })), ...Array.from({ length: 6 }, (_, index) => ({ s: { r: 9, c: index * 2 }, e: { r: 9, c: index * 2 + 1 } })),
    { s: { r: 10, c: 0 }, e: { r: 10, c: 11 } }, { s: { r: 11, c: 0 }, e: { r: 12, c: 6 } }, { s: { r: 11, c: 7 }, e: { r: 11, c: 11 } }, { s: { r: 12, c: 7 }, e: { r: 13, c: 11 } }, { s: { r: 15, c: 0 }, e: { r: 15, c: 11 } }, { s: { r: 24, c: 0 }, e: { r: 24, c: 11 } }, { s: { r: 34, c: 0 }, e: { r: 34, c: 11 } }, { s: { r: 38, c: 0 }, e: { r: 38, c: 11 } },
  ];
  summarySheet["!cols"] = Array.from({ length: 12 }, (_, index) => ({ wch: [7, 29, 13, 18, 12, 4, 7, 29, 13, 18, 12, 14][index] }));
  const managementRows: Array<Array<string | number>> = Array.from({ length: 38 }, () => []);
  managementRows[0][0] = "INTELIGÊNCIA ALC · LEITURA GERENCIAL"; managementRows[1][0] = reportTitle; managementRows[2][0] = `${monthText} · ${directionText} · ${baseText}`; managementRows[4][0] = "BASES E MOTORISTAS COM MAIOR IMPACTO"; managementRows[5] = ["#", "Base", "Lançamentos", "Valor", "%", "", "#", "Motorista", "Lançamentos", "Valor", "%"];
  for (let index = 0; index < 10; index += 1) { const base = baseAnalysis[index]; const driver = driverAnalysis[index]; const row = 6 + index; if (base) managementRows[row].splice(0, 5, index + 1, base.label, base.count, base.value, base.share); if (driver) managementRows[row].splice(6, 5, index + 1, driver.label, driver.count, driver.value, driver.share); }
  managementRows[18][0] = "DIRECIONAMENTOS E RESPONSÁVEIS"; managementRows[19] = ["#", "Direcionamento", "Lançamentos", "Valor", "%", "Concentração", "#", "Responsável / Destino", "Lançamentos", "Valor", "%"];
  for (let index = 0; index < 15; index += 1) { const dir = directionAnalysis[index]; const target = targetAnalysis[index]; const row = 20 + index; if (dir) managementRows[row].splice(0, 6, index + 1, dir.label, dir.count, dir.value, dir.share, textBar(dir.share)); if (target) managementRows[row].splice(6, 5, index + 1, target.label, target.count, target.value, target.share); }
  const managementSheet = XLSX.utils.aoa_to_sheet(managementRows);
  managementSheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } }, { s: { r: 2, c: 0 }, e: { r: 2, c: 10 } }, { s: { r: 4, c: 0 }, e: { r: 4, c: 10 } }, { s: { r: 18, c: 0 }, e: { r: 18, c: 10 } }];
  managementSheet["!cols"] = [{ wch: 5 }, { wch: 34 }, { wch: 13 }, { wch: 17 }, { wch: 11 }, { wch: 21 }, { wch: 5 }, { wch: 34 }, { wch: 13 }, { wch: 17 }, { wch: 11 }];
  const detailHeaders = ["ID do pacote", "Lançamento", "Data do ID", "Mês do desconto", "Quinzena", "Motorista", "ID Motorista", "Base", "XPT", "Rota", "Origem", "Status PNR", "Direcionamento", "Responsável / Destino", "Observação", "Valor", "Fonte do valor"];
  const detailRows = rows.map((row) => [row.shipment_id, row.allocation_no, row.event_date ? new Date(row.event_date.length === 10 ? `${row.event_date}T12:00:00` : row.event_date) : null, formatMonth(row.discount_month || row.month), formatFortnight(row.fortnight || row.source_period), driverLabel(row), row.driver_id || "—", baseLabel(row), row.xpt_code || "—", row.route_id || "—", row.origin || "—", row.pnr_status || "—", directionLabel(row.direction), targetLabel(row), row.note || "—", Number(row.amount || 0), row.amount_source || "—"]);
  const detailHeaderRow = 6; const detailValueIndex = 15; const detailValueColumn = XLSX.utils.encode_col(detailValueIndex); const detailEndRow = detailHeaderRow + detailRows.length;
  const detailSheet = XLSX.utils.aoa_to_sheet([[reportTitle], ["Detalhamento operacional · filtre o cabeçalho para investigar IDs, direcionamentos, bases e responsáveis"], ["REGISTROS VISÍVEIS", null, "VALOR VISÍVEL", null, "COMPETÊNCIA", monthText], [], [], detailHeaders, ...detailRows], { cellDates: true });
  detailSheet.B3 = { t: "n", f: `SUBTOTAL(103,A${detailHeaderRow + 1}:A${detailEndRow})` }; detailSheet.D3 = { t: "n", f: `SUBTOTAL(109,${detailValueColumn}${detailHeaderRow + 1}:${detailValueColumn}${detailEndRow})`, z: "R$ #,##0.00" };
  detailSheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: detailHeaders.length - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: detailHeaders.length - 1 } }]; detailSheet["!autofilter"] = { ref: `A${detailHeaderRow}:${XLSX.utils.encode_col(detailHeaders.length - 1)}${detailEndRow}` }; detailSheet["!cols"] = detailHeaders.map((header, index) => ({ wch: index === 0 ? 18 : /Motorista|Base|Responsável|Observação|Origem|Fonte/.test(header) ? 28 : /Valor/.test(header) ? 16 : 15 }));
  const rawHeaders = [...detailHeaders, "Arquivo de origem", "Aba de origem", "Criado por", "Atualizado em"];
  const rawRows = rows.map((row) => [row.shipment_id, row.allocation_no, row.event_date ? new Date(row.event_date.length === 10 ? `${row.event_date}T12:00:00` : row.event_date) : null, formatMonth(row.discount_month || row.month), formatFortnight(row.fortnight || row.source_period), driverLabel(row), row.driver_id || "—", baseLabel(row), row.xpt_code || "—", row.route_id || "—", row.origin || "—", row.pnr_status || "—", directionLabel(row.direction), targetLabel(row), row.note || "—", Number(row.amount || 0), row.amount_source || "—", row.source_file || "—", row.source_sheet || "—", row.created_by || "—", row.updated_at || "—"]);
  const rawHeaderRow = 3; const rawValueIndex = 15; const rawValueColumn = XLSX.utils.encode_col(rawValueIndex); const rawEndRow = rawHeaderRow + rawRows.length;
  const rawSheet = XLSX.utils.aoa_to_sheet([["INTELIGÊNCIA ALC · DADOS BRUTOS — GESTÃO DE DESCONTOS"], ["Base técnica do relatório. Preserve esta aba para auditoria e rastreabilidade."], rawHeaders, ...rawRows], { cellDates: true });
  rawSheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: rawHeaders.length - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: rawHeaders.length - 1 } }]; rawSheet["!autofilter"] = { ref: `A${rawHeaderRow}:${XLSX.utils.encode_col(rawHeaders.length - 1)}${rawEndRow}` }; rawSheet["!cols"] = rawHeaders.map((header, index) => ({ wch: index === 0 ? 18 : /Motorista|Base|Responsável|Observação|Origem|Fonte|Arquivo|Aba|Criado/.test(header) ? 28 : /Valor/.test(header) ? 16 : 15 }));
  const workbook = XLSX.utils.book_new();
  (workbook as unknown as { Props?: Record<string, unknown> }).Props = { Title: `ALC - ${reportTitle}`, Subject: "Relatório executivo de Gestão de Descontos gerado pelo Inteligência ALC", Author: "Inteligência ALC", Company: "ALC Pereira Filho & Transportes", CreatedDate: generatedAt };
  (workbook as unknown as { Workbook?: Record<string, unknown> }).Workbook = { CalcPr: { calcMode: "auto", fullCalcOnLoad: true, forceFullCalc: true } };
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumo Executivo"); XLSX.utils.book_append_sheet(workbook, managementSheet, "Leitura Gerencial"); XLSX.utils.book_append_sheet(workbook, detailSheet, "Detalhamento"); XLSX.utils.book_append_sheet(workbook, rawSheet, "Dados Brutos");
  const workbookBytes = XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true, cellDates: true }) as ArrayBuffer;
  const logoResponse = await fetch("/brand/alc-logo.png", { cache: "force-cache" }); if (!logoResponse.ok) throw new Error("Não foi possível carregar a identidade visual ALC para o relatório.");
  const branded = patchDiscountWorkbook(workbookBytes, new Uint8Array(await logoResponse.arrayBuffer()), rows, detailHeaderRow, rawHeaderRow, detailValueColumn, rawValueColumn);
  const periodToken = filters.month === ALL ? "GERAL" : filters.month; const directionToken = filters.direction === ALL ? "TODOS" : filters.direction; const filename = `ALC_GESTAO_DESCONTOS_${fileToken(`${periodToken}_${directionToken}`)}.xlsx`;
  downloadBlob(branded, filename); return filename;
}

function DiscountReportPanel() {
  const [rows, setRows] = useState<DiscountReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [month, setMonth] = useState(ALL);
  const [direction, setDirection] = useState(ALL);
  const [base, setBase] = useState(ALL);
  async function loadRows(showToast = false) {
    setLoading(true);
    try {
      const response = await fetch(API, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { rows?: DiscountReportRow[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Falha ao carregar os dados do relatório.");
      setRows(body.rows ?? []);
      if (showToast) toast.success("Dados do relatório atualizados.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao carregar os dados do relatório."); }
    finally { setLoading(false); }
  }
  useEffect(() => { queueMicrotask(() => void loadRows()); const refresh = () => void loadRows(); window.addEventListener("alc-inteligencia:global-data-sync", refresh); return () => window.removeEventListener("alc-inteligencia:global-data-sync", refresh); }, []);
  const monthOptions = useMemo(() => unique(rows.map((row) => row.discount_month || row.month || "")), [rows]);
  const baseOptions = useMemo(() => unique(rows.map(baseLabel)), [rows]);
  const filtered = useMemo(() => rows.filter((row) => { if (month !== ALL && (row.discount_month || row.month) !== month) return false; if (direction !== ALL && row.direction !== direction) return false; if (base !== ALL && baseLabel(row) !== base) return false; return true; }), [rows, month, direction, base]);
  const totalValue = filtered.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const uniqueIds = new Set(filtered.map((row) => row.shipment_id)).size;
  const directionAnalysis = useMemo(() => groupAnalysis(filtered, (row) => directionLabel(row.direction), totalValue), [filtered, totalValue]);
  const topDirection = directionAnalysis[0];
  async function handleExport() {
    setExporting(true);
    try { const filename = await exportDiscountReport(filtered, { month, direction, base }); toast.success(`${filename} gerado com Resumo Executivo, Leitura Gerencial, Detalhamento e Dados Brutos.`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao gerar o relatório XLSX."); }
    finally { setExporting(false); }
  }
  return (
    <Panel title="Relatório executivo — Gestão de Descontos" subtitle="Mesmo padrão gerencial dos relatórios de pacotes, agora com base branca, identidade ALC em vermelho e sem fundo preto." action={<div style={{ display: "flex", gap: 8, alignItems: "center" }}><button className="secondary-button" type="button" onClick={() => void loadRows(true)} disabled={loading}><RefreshCw size={14} />{loading ? "Atualizando…" : "Atualizar"}</button><button className="primary-button" type="button" onClick={() => void handleExport()} disabled={exporting || !filtered.length}><Download size={16} />{exporting ? "Montando relatório…" : "Baixar relatório ALC"}</button></div>}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <label className="filter-control"><span>Mês do desconto</span><select value={month} onChange={(event) => setMonth(event.target.value)}><option value={ALL}>Todos</option>{monthOptions.map((value) => <option key={value} value={value}>{formatMonth(value)}</option>)}</select></label>
        <label className="filter-control"><span>Direcionamento</span><select value={direction} onChange={(event) => setDirection(event.target.value)}><option value={ALL}>Todos</option>{DISCOUNT_DIRECTIONS.map((value) => <option key={value} value={value}>{directionLabel(value)}</option>)}</select></label>
        <label className="filter-control"><span>Base</span><select value={base} onChange={(event) => setBase(event.target.value)}><option value={ALL}>Todas</option>{baseOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
        <div className="quality-callout" style={{ margin: 0 }}><FileSpreadsheet size={18} /><div><strong>{formatNumber(filtered.length)} lançamentos</strong><p>{formatNumber(uniqueIds)} IDs únicos no recorte.</p></div></div>
        <div className="quality-callout" style={{ margin: 0 }}><BadgeDollarSign size={18} /><div><strong>{formatCurrency(totalValue)}</strong><p>Valor total sob gestão.</p></div></div>
        <div className="quality-callout" style={{ margin: 0 }}><ChartNoAxesCombined size={18} /><div><strong>{topDirection?.label || "Sem concentração"}</strong><p>{topDirection ? `${formatPercent(topDirection.share * 100)} do valor.` : "Sem dados no recorte."}</p></div></div>
        <div className="quality-callout" style={{ margin: 0 }}><Building2 size={18} /><div><strong>4 abas gerenciais</strong><p>Resumo, análise, detalhamento e auditoria.</p></div></div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14, color: "#60636A", fontSize: 12 }}><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Users size={14} />Ranking de motoristas e bases</span><span>•</span><span>Totais dinâmicos na aba Detalhamento</span><span>•</span><span>Logo ALC e rastreabilidade do arquivo de origem</span></div>
    </Panel>
  );
}

export function DiscountManagementViewV4() {
  return <div className="view-stack"><DiscountReportPanel /><DiscountManagementViewV3 /></div>;
}
