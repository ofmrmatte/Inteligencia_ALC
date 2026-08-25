"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  BadgeDollarSign,
  Boxes,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  Download,
  FileSpreadsheet,
  RotateCcw,
  TrendingUp,
  Users,
} from "lucide-react";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { toast } from "sonner";
import { scopeData } from "@/lib/dashboard-scope";
import { fortnightFromDate, latestPnrByShipment, monthFromFortnight, normalizeFortnight } from "@/lib/metrics";
import { normalizeText } from "@/lib/normalize";
import { useDashboardStore } from "@/lib/store";
import type { ImportEntry, PrefaturaRecord } from "@/lib/types";
import { formatCurrency, formatNumber, formatPercent, KpiCard, Panel, PageIntro, StatusBadge } from "@/components/ui";
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

type AnalysisRow = { label: string; cases: number; value: number; share: number };

const BRAND = {
  red: "E30613",
  redDark: "B8000B",
  black: "090909",
  charcoal: "25272B",
  gray700: "60636A",
  gray500: "8D9097",
  gray300: "D7D9DD",
  gray200: "E8E9EC",
  gray100: "F3F4F6",
  white: "FFFFFF",
  green: "16845B",
  amber: "B76B00",
  blue: "2563A6",
  lightRed: "FFF3F4",
  lightGreen: "EDF7F2",
  lightAmber: "FFF7E8",
  altRow: "FAFAFB",
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

function groupAnalysis(rows: ReportRow[], key: (row: ReportRow) => string, totalValue: number): AnalysisRow[] {
  const map = new Map<string, { label: string; cases: number; value: number }>();
  rows.forEach((row) => {
    const label = key(row) || "Não identificado";
    const current = map.get(label) ?? { label, cases: 0, value: 0 };
    current.cases += 1;
    current.value += row.value;
    map.set(label, current);
  });
  return [...map.values()]
    .map((item) => ({ ...item, share: totalValue ? item.value / totalValue : 0 }))
    .sort((a, b) => b.value - a.value);
}

function textBar(share: number, width = 18) {
  if (!share) return "";
  const filled = Math.max(1, Math.min(width, Math.round(share * width)));
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

function statusStyleId(status: string) {
  const normalized = normalizeText(status);
  if (/PENAL|ANULAD|INDEFER/.test(normalized)) return 32;
  if (/AGUARD|REVISAO|COMPROV|PENDENTE/.test(normalized)) return 33;
  if (/FATUR|PROCEDENTE|APROVAD|CONCLUID/.test(normalized)) return 34;
  return null;
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
  return xml.replace(/<sheetView workbookViewId="0"\s*\/>/, '<sheetView workbookViewId="0" showGridLines="0"/>')
    .replace(/<sheetView workbookViewId="0">/, '<sheetView workbookViewId="0" showGridLines="0">');
}

function freezeRows(xml: string, rows: number) {
  const pane = `<pane ySplit="${rows}" topLeftCell="A${rows + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${rows + 1}" sqref="A${rows + 1}"/>`;
  return xml.replace(/<sheetView workbookViewId="0" showGridLines="0"\s*\/>/, `<sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView>`)
    .replace(/<sheetView workbookViewId="0"\s*\/>/, `<sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView>`);
}

function brandedStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="60" formatCode="R$ #,##0.00"/><numFmt numFmtId="61" formatCode="0.0%"/><numFmt numFmtId="62" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="13">
<font><sz val="11"/><color rgb="${BRAND.charcoal}"/><name val="Poppins"/><family val="2"/></font>
<font><b/><sz val="22"/><color rgb="${BRAND.white}"/><name val="Montserrat"/><family val="2"/></font>
<font><b/><sz val="13"/><color rgb="${BRAND.white}"/><name val="Montserrat"/><family val="2"/></font>
<font><sz val="9"/><color rgb="B7B7B7"/><name val="Poppins"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="${BRAND.red}"/><name val="Montserrat"/><family val="2"/></font>
<font><b/><sz val="9"/><color rgb="${BRAND.gray700}"/><name val="Poppins"/><family val="2"/></font>
<font><b/><sz val="18"/><color rgb="${BRAND.charcoal}"/><name val="Montserrat"/><family val="2"/></font>
<font><b/><sz val="12"/><color rgb="${BRAND.charcoal}"/><name val="Montserrat"/><family val="2"/></font>
<font><b/><sz val="9"/><color rgb="${BRAND.white}"/><name val="Poppins"/><family val="2"/></font>
<font><sz val="10"/><color rgb="${BRAND.charcoal}"/><name val="Poppins"/><family val="2"/></font>
<font><sz val="9"/><color rgb="${BRAND.gray700}"/><name val="Poppins"/><family val="2"/></font>
<font><i/><sz val="9"/><color rgb="${BRAND.gray700}"/><name val="Poppins"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="${BRAND.white}"/><name val="Poppins"/><family val="2"/></font>
</fonts>
<fills count="10">
<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${BRAND.black}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${BRAND.red}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${BRAND.gray100}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${BRAND.white}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${BRAND.lightRed}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${BRAND.lightGreen}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${BRAND.lightAmber}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${BRAND.altRow}"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="5">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="${BRAND.gray200}"/></left><right style="thin"><color rgb="${BRAND.gray200}"/></right><top style="thin"><color rgb="${BRAND.gray200}"/></top><bottom style="thin"><color rgb="${BRAND.gray200}"/></bottom><diagonal/></border>
<border><left/><right/><top/><bottom style="medium"><color rgb="${BRAND.red}"/></bottom><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="${BRAND.gray200}"/></bottom><diagonal/></border>
<border><left style="medium"><color rgb="${BRAND.red}"/></left><right style="thin"><color rgb="${BRAND.gray200}"/></right><top style="thin"><color rgb="${BRAND.gray200}"/></top><bottom style="thin"><color rgb="${BRAND.gray200}"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="36">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="60" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="61" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="62" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/>
<xf numFmtId="0" fontId="4" fillId="4" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="5" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="6" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="60" fontId="6" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="7" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="11" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="8" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="9" fillId="5" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="9" fillId="9" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="60" fontId="9" fillId="5" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="60" fontId="9" fillId="9" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="62" fontId="9" fillId="5" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="62" fontId="9" fillId="9" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="61" fontId="9" fillId="5" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="5" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="9" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="7" fillId="6" borderId="4" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="11" fillId="6" borderId="4" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="9" fillId="5" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="60" fontId="9" fillId="5" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="12" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="5" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="6" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="60" fontId="6" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="9" fillId="6" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="9" fillId="8" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="9" fillId="7" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="10" fillId="5" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
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

  const drawing = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>120000</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>90000</xdr:rowOff></xdr:from><xdr:ext cx="2050000" cy="1050000"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="Logo ALC"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`;
  const drawingRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/alc-logo.png"/></Relationships>`;
  files["xl/drawings/drawing1.xml"] = strToU8(drawing);
  files["xl/drawings/_rels/drawing1.xml.rels"] = strToU8(drawingRels);
  files["xl/media/alc-logo.png"] = logo;

  let contentTypes = strFromU8(files["[Content_Types].xml"]);
  if (!contentTypes.includes('PartName="/xl/drawings/drawing1.xml"')) {
    contentTypes = contentTypes.replace("</Types>", '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
  }
  files["[Content_Types].xml"] = strToU8(contentTypes);
}

function patchWorkbookBranding(
  workbookBytes: ArrayBuffer,
  logoBytes: Uint8Array,
  kind: ReportKind,
  rows: ReportRow[],
  detailHeaderRow: number,
  rawHeaderRow: number,
  detailValueColumn: string,
  rawValueColumn: string,
) {
  const files = unzipSync(new Uint8Array(workbookBytes));
  files["xl/styles.xml"] = strToU8(brandedStylesXml());

  const sheet1 = hideGridlines(strFromU8(files["xl/worksheets/sheet1.xml"]));
  files["xl/worksheets/sheet1.xml"] = strToU8(cellStyleXml(sheet1, (column, row) => {
    const col = columnIndex(column);
    if (row <= 4) return col >= 3 ? (row === 1 ? 4 : row === 2 ? 5 : 6) : 4;
    if (row === 5) return 7;
    if ([7, 11, 16, 29].includes(row)) return 8;
    if (row === 8) return 9;
    if (row === 9) {
      if ([2, 8].includes(col)) return 11;
      if (col === 10) return 12;
      return 10;
    }
    if (row === 10) return 13;
    if (row === 12) return 24;
    if (row === 13 && col >= 6) return 25;
    if (row === 17) return 14;
    if (row >= 18 && row <= 27) {
      const alt = row % 2 === 1;
      if ([3, 9].includes(col)) return alt ? 18 : 17;
      if ([4, 10].includes(col)) return 21;
      return alt ? 16 : 15;
    }
    if (row >= 30 && row <= 32) {
      if ([0, 3, 6, 9].includes(col)) return 22;
      if ([1, 4, 7, 10].includes(col)) return 23;
    }
    if (row === 34) return 35;
    return null;
  }));

  const sheet2 = hideGridlines(strFromU8(files["xl/worksheets/sheet2.xml"]));
  files["xl/worksheets/sheet2.xml"] = strToU8(cellStyleXml(sheet2, (column, row) => {
    if (row <= 3) return row === 1 ? 4 : row === 2 ? 5 : 6;
    if ([5, 24].includes(row)) return 8;
    if ([6, 25].includes(row)) return 14;
    if (row >= 7 && row <= 21) {
      if (["D", "I"].includes(column)) return 17;
      if (["E", "J"].includes(column)) return 21;
      return row % 2 === 0 ? 16 : 15;
    }
    if (row >= 26 && row <= 40) {
      if (column === "D") return 17;
      if (column === "E") return 21;
      return row % 2 === 0 ? 16 : 15;
    }
    return null;
  }));

  let sheet3 = hideGridlines(strFromU8(files["xl/worksheets/sheet3.xml"]));
  sheet3 = freezeRows(sheet3, detailHeaderRow);
  files["xl/worksheets/sheet3.xml"] = strToU8(cellStyleXml(sheet3, (column, row) => {
    if (row === 1) return 4;
    if (row === 2) return 6;
    if (row === 3) return ["A", "C"].includes(column) ? 29 : column === "B" ? 30 : column === "D" ? 31 : 23;
    if (row === detailHeaderRow) return 14;
    if (row > detailHeaderRow) {
      const dataIndex = row - detailHeaderRow - 1;
      const alt = dataIndex % 2 === 1;
      if (column === "B") return alt ? 20 : 19;
      if (column === detailValueColumn) return alt ? 18 : 17;
      if (kind === "PNR" && column === "C") return statusStyleId(rows[dataIndex]?.status || "") ?? (alt ? 16 : 15);
      return alt ? 16 : 15;
    }
    return null;
  }));

  let sheet4 = hideGridlines(strFromU8(files["xl/worksheets/sheet4.xml"]));
  sheet4 = freezeRows(sheet4, rawHeaderRow);
  files["xl/worksheets/sheet4.xml"] = strToU8(cellStyleXml(sheet4, (column, row) => {
    if (row === 1) return 4;
    if (row === 2) return 6;
    if (row === rawHeaderRow) return 14;
    if (row > rawHeaderRow) {
      const alt = (row - rawHeaderRow - 1) % 2 === 1;
      if (column === "B") return alt ? 20 : 19;
      if (column === rawValueColumn) return alt ? 18 : 17;
      if (column === (kind === "PNR" ? "N" : "L")) return 35;
      return alt ? 16 : 15;
    }
    return null;
  }));

  addLogoDrawing(files, logoBytes);
  return zipSync(files, { level: 6 });
}

function downloadBlob(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  const ticketAverage = filtered.length ? totalValue / filtered.length : 0;

  const baseAnalysis = useMemo(() => groupAnalysis(filtered, (row) => row.base, totalValue), [filtered, totalValue]);
  const driverAnalysis = useMemo(() => groupAnalysis(filtered, (row) => row.driverName, totalValue), [filtered, totalValue]);
  const operationAnalysis = useMemo(() => groupAnalysis(filtered, (row) => kind === "PNR" ? row.status : row.operation, totalValue), [filtered, kind, totalValue]);
  const analysis = kind === "PNR" ? operationAnalysis : baseAnalysis;
  const topImpact = analysis[0];
  const topBase = baseAnalysis[0];

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
      const reportTitle = kind === "PNR" ? "RELATÓRIO EXECUTIVO DE PNR" : "RELATÓRIO EXECUTIVO DE PACOTES PERDIDOS";
      const generatedAt = new Date();
      const periodText = [filters.month === "Todos" ? "Todos os meses" : monthLabel(filters.month), filters.fortnight === "Todas" ? "Todas as quinzenas" : filters.fortnight].join(" · ");
      const datesText = dateStart || dateEnd ? `${dateStart ? brDate(dateStart) : "início"} a ${dateEnd ? brDate(dateEnd) : "fim"}` : "Todas as datas";
      const filtersApplied = [
        ["Tipo", kind === "PNR" ? "PNR" : "Pacotes Perdidos"],
        ["Competência", periodText],
        ["Datas", datesText],
        ["Status", kind === "PNR" ? (statusFilter === "TODOS" ? "Todos" : statusFilter) : "Não se aplica"],
        ["Base", filters.base],
        ["XPT", filters.xpt],
        ["Coordenador", filters.coordinator],
        ["Operação", filters.operation],
        ["Supervisor", filters.supervisor],
        ["Motorista", filters.driver],
      ];

      const summaryRows: Array<Array<string | number | Date | null>> = Array.from({ length: 35 }, () => []);
      summaryRows[0][3] = "INTELIGÊNCIA ALC";
      summaryRows[1][3] = reportTitle;
      summaryRows[2][3] = `${periodText} · ${datesText}`;
      summaryRows[3][3] = `Gerado em ${generatedAt.toLocaleString("pt-BR")} · Inteligência ALC`;
      summaryRows[6][0] = "INDICADORES PRINCIPAIS";
      const cardLabels = ["IDs", "VALOR TOTAL", "BASES", "MOTORISTAS", "TICKET MÉDIO", "MAIOR IMPACTO"];
      const cardValues: Array<string | number> = [filtered.length, totalValue, bases.size, drivers.size, ticketAverage, topImpact?.label || "—"];
      const cardDetails = ["Pacotes únicos no recorte", kind === "PNR" ? "Valor de compra" : "Valor de pré-fatura", "Unidades impactadas", "Motoristas identificados", "Valor médio por pacote", topImpact ? `${formatPercent(topImpact.share * 100)} do valor` : "Sem concentração"];
      cardLabels.forEach((label, index) => {
        const col = index * 2;
        summaryRows[7][col] = label;
        summaryRows[8][col] = cardValues[index];
        summaryRows[9][col] = cardDetails[index];
      });
      summaryRows[10][0] = "LEITURA EXECUTIVA";
      summaryRows[11][0] = topImpact ? `${topImpact.label} é o maior impacto do recorte, com ${formatCurrency(topImpact.value)} em ${formatNumber(topImpact.cases)} pacote(s), representando ${formatPercent(topImpact.share * 100)} do valor total.` : "Não há concentração suficiente para uma leitura executiva.";
      summaryRows[11][6] = "COMO INTERPRETAR";
      summaryRows[12][6] = "Comece pelos indicadores. Depois veja os maiores impactos e use a aba Detalhamento para investigar os IDs. Na aba Detalhamento, os totais visíveis mudam automaticamente quando você usa os filtros do Excel.";
      summaryRows[15][0] = kind === "PNR" ? "STATUS COM MAIOR EXPOSIÇÃO" : "BASES COM MAIOR IMPACTO";
      summaryRows[16] = ["#", kind === "PNR" ? "Status" : "Base", "Pacotes", "Valor", "% do total", "", "#", "Motorista", "Pacotes", "Valor", "% do total"];
      for (let index = 0; index < 10; index += 1) {
        const impact = analysis[index];
        const driver = driverAnalysis[index];
        const row = 17 + index;
        if (impact) summaryRows[row].splice(0, 5, index + 1, impact.label, impact.cases, impact.value, impact.share);
        if (driver) summaryRows[row].splice(6, 5, index + 1, driver.label, driver.cases, driver.value, driver.share);
      }
      summaryRows[28][0] = "FILTROS APLICADOS";
      const filterMatrix = [
        [filtersApplied[0], filtersApplied[1], filtersApplied[2], filtersApplied[3]],
        [filtersApplied[4], filtersApplied[5], filtersApplied[6], filtersApplied[7]],
        [filtersApplied[8], filtersApplied[9]],
      ];
      filterMatrix.forEach((groups, rowIndex) => {
        groups.forEach((pair, groupIndex) => {
          const baseCol = groupIndex * 3;
          summaryRows[29 + rowIndex][baseCol] = pair[0];
          summaryRows[29 + rowIndex][baseCol + 1] = pair[1];
        });
      });
      summaryRows[33][0] = "Relatório gerado pelo Inteligência ALC · uso interno · valores consolidados pelo registro mais recente de cada ID.";

      const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
      summarySheet["!merges"] = [
        { s: { r: 0, c: 3 }, e: { r: 0, c: 11 } },
        { s: { r: 1, c: 3 }, e: { r: 1, c: 11 } },
        { s: { r: 2, c: 3 }, e: { r: 2, c: 11 } },
        { s: { r: 3, c: 3 }, e: { r: 3, c: 11 } },
        { s: { r: 4, c: 0 }, e: { r: 4, c: 11 } },
        { s: { r: 6, c: 0 }, e: { r: 6, c: 11 } },
        ...Array.from({ length: 6 }, (_, index) => ({ s: { r: 7, c: index * 2 }, e: { r: 7, c: index * 2 + 1 } })),
        ...Array.from({ length: 6 }, (_, index) => ({ s: { r: 8, c: index * 2 }, e: { r: 8, c: index * 2 + 1 } })),
        ...Array.from({ length: 6 }, (_, index) => ({ s: { r: 9, c: index * 2 }, e: { r: 9, c: index * 2 + 1 } })),
        { s: { r: 10, c: 0 }, e: { r: 10, c: 11 } },
        { s: { r: 11, c: 0 }, e: { r: 13, c: 5 } },
        { s: { r: 11, c: 6 }, e: { r: 11, c: 11 } },
        { s: { r: 12, c: 6 }, e: { r: 13, c: 11 } },
        { s: { r: 15, c: 0 }, e: { r: 15, c: 11 } },
        { s: { r: 28, c: 0 }, e: { r: 28, c: 11 } },
        { s: { r: 33, c: 0 }, e: { r: 33, c: 11 } },
      ];
      summarySheet["!cols"] = Array.from({ length: 12 }, (_, index) => ({ wch: [8, 28, 13, 18, 13, 3, 8, 28, 13, 18, 13, 15][index] }));
      summarySheet["!rows"] = [{ hpt: 30 }, { hpt: 28 }, { hpt: 20 }, { hpt: 18 }, { hpt: 5 }, { hpt: 8 }, { hpt: 22 }, { hpt: 34 }, { hpt: 34 }, { hpt: 34 }, { hpt: 22 }, { hpt: 38 }, { hpt: 36 }, { hpt: 24 }];

      const managementRows: Array<Array<string | number>> = Array.from({ length: 42 }, () => []);
      managementRows[0][0] = "INTELIGÊNCIA ALC · LEITURA GERENCIAL";
      managementRows[1][0] = reportTitle;
      managementRows[2][0] = `${periodText} · ${datesText}`;
      managementRows[4][0] = "BASES COM MAIOR IMPACTO";
      managementRows[5] = ["#", "Base", "Pacotes", "Valor", "%", "", "#", "Motorista", "Pacotes", "Valor", "%"];
      for (let index = 0; index < 15; index += 1) {
        const base = baseAnalysis[index];
        const driver = driverAnalysis[index];
        const row = 6 + index;
        if (base) managementRows[row].splice(0, 5, index + 1, base.label, base.cases, base.value, base.share);
        if (driver) managementRows[row].splice(6, 5, index + 1, driver.label, driver.cases, driver.value, driver.share);
      }
      managementRows[23][0] = kind === "PNR" ? "DISTRIBUIÇÃO POR STATUS" : "DISTRIBUIÇÃO POR OPERAÇÃO";
      managementRows[24] = ["#", kind === "PNR" ? "Status" : "Operação", "Pacotes", "Valor", "%", "Concentração"];
      operationAnalysis.slice(0, 15).forEach((item, index) => {
        managementRows[25 + index] = [index + 1, item.label, item.cases, item.value, item.share, textBar(item.share)];
      });
      const managementSheet = XLSX.utils.aoa_to_sheet(managementRows);
      managementSheet["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 10 } },
        { s: { r: 4, c: 0 }, e: { r: 4, c: 10 } },
        { s: { r: 23, c: 0 }, e: { r: 23, c: 10 } },
      ];
      managementSheet["!cols"] = [{ wch: 5 }, { wch: 35 }, { wch: 12 }, { wch: 17 }, { wch: 11 }, { wch: 22 }, { wch: 5 }, { wch: 34 }, { wch: 12 }, { wch: 17 }, { wch: 11 }];

      const detailHeaders = kind === "PNR"
        ? ["ID de envio", "Data", "Status", "Base", "XPT", "Motorista", "ID Motorista", "Rota", "Valor", "Transportadora", "Origem", "Competência", "Quinzena"]
        : ["ID do pacote", "Data", "Operação", "Base", "XPT", "Motorista", "ID Motorista", "Rota", "Valor", "Competência", "Quinzena"];
      const detailRows = filtered.map((row) => kind === "PNR"
        ? [row.shipmentId, row.date ? new Date(`${row.date}T12:00:00`) : null, row.status, row.base, row.xpt, row.driverName, row.driverId, row.routeId, row.value, row.carrier, row.origin, row.competence ? monthLabel(row.competence) : "—", fortnightLabel(row.fortnight)]
        : [row.shipmentId, row.date ? new Date(`${row.date}T12:00:00`) : null, row.operation, row.base, row.xpt, row.driverName, row.driverId, row.routeId, row.value, row.competence ? monthLabel(row.competence) : "—", fortnightLabel(row.fortnight)]);
      const detailHeaderRow = 6;
      const detailValueIndex = 8;
      const detailValueColumn = XLSX.utils.encode_col(detailValueIndex);
      const detailEndRow = detailHeaderRow + detailRows.length;
      const detailSheet = XLSX.utils.aoa_to_sheet([
        [reportTitle],
        ["Detalhamento operacional · use os filtros do cabeçalho para investigar os registros"],
        ["REGISTROS VISÍVEIS", null, "VALOR VISÍVEL", null, "PERÍODO", periodText, "DATAS", datesText],
        [],
        [],
        detailHeaders,
        ...detailRows,
      ], { cellDates: true });
      detailSheet.B3 = { t: "n", f: `SUBTOTAL(103,A${detailHeaderRow + 1}:A${detailEndRow})` };
      detailSheet.D3 = { t: "n", f: `SUBTOTAL(109,${detailValueColumn}${detailHeaderRow + 1}:${detailValueColumn}${detailEndRow})`, z: "R$ #,##0.00" };
      detailSheet["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: detailHeaders.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: detailHeaders.length - 1 } },
      ];
      detailSheet["!autofilter"] = { ref: `A${detailHeaderRow}:${XLSX.utils.encode_col(detailHeaders.length - 1)}${detailEndRow}` };
      detailSheet["!cols"] = detailHeaders.map((header, index) => ({ wch: index === 0 ? 18 : /Motorista|Base|Transportadora|Origem/.test(header) ? 27 : /Valor/.test(header) ? 16 : 14 }));

      const rawHeaders = [...detailHeaders, "Arquivo de origem"];
      const rawRows = filtered.map((row) => kind === "PNR"
        ? [row.shipmentId, row.date ? new Date(`${row.date}T12:00:00`) : null, row.status, row.base, row.xpt, row.driverName, row.driverId, row.routeId, row.value, row.carrier, row.origin, row.competence ? monthLabel(row.competence) : "—", fortnightLabel(row.fortnight), row.sourceFile]
        : [row.shipmentId, row.date ? new Date(`${row.date}T12:00:00`) : null, row.operation, row.base, row.xpt, row.driverName, row.driverId, row.routeId, row.value, row.competence ? monthLabel(row.competence) : "—", fortnightLabel(row.fortnight), row.sourceFile]);
      const rawHeaderRow = 3;
      const rawValueIndex = 8;
      const rawValueColumn = XLSX.utils.encode_col(rawValueIndex);
      const rawEndRow = rawHeaderRow + rawRows.length;
      const rawSheet = XLSX.utils.aoa_to_sheet([
        ["INTELIGÊNCIA ALC · DADOS BRUTOS"],
        ["Base técnica do relatório. Preserve esta aba para auditoria e rastreabilidade."],
        rawHeaders,
        ...rawRows,
      ], { cellDates: true });
      rawSheet["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: rawHeaders.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: rawHeaders.length - 1 } },
      ];
      rawSheet["!autofilter"] = { ref: `A${rawHeaderRow}:${XLSX.utils.encode_col(rawHeaders.length - 1)}${rawEndRow}` };
      rawSheet["!cols"] = rawHeaders.map((header, index) => ({ wch: index === 0 ? 18 : /Motorista|Base|Transportadora|Origem|Arquivo/.test(header) ? 28 : /Valor/.test(header) ? 16 : 14 }));

      const workbook = XLSX.utils.book_new();
      (workbook as unknown as { Props?: Record<string, unknown>; Workbook?: Record<string, unknown> }).Props = {
        Title: `ALC - ${reportTitle}`,
        Subject: "Relatório executivo gerado pelo Inteligência ALC",
        Author: "Inteligência ALC",
        Company: "ALC Pereira Filho & Transportes",
        CreatedDate: generatedAt,
      };
      (workbook as unknown as { Workbook?: Record<string, unknown> }).Workbook = { CalcPr: { calcMode: "auto", fullCalcOnLoad: true, forceFullCalc: true } };
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumo Executivo");
      XLSX.utils.book_append_sheet(workbook, managementSheet, "Leitura Gerencial");
      XLSX.utils.book_append_sheet(workbook, detailSheet, "Detalhamento");
      XLSX.utils.book_append_sheet(workbook, rawSheet, "Dados Brutos");

      const workbookBytes = XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true, cellDates: true }) as ArrayBuffer;
      const logoResponse = await fetch("/brand/alc-logo.png", { cache: "force-cache" });
      if (!logoResponse.ok) throw new Error("Não foi possível carregar a identidade visual ALC para o relatório.");
      const logoBytes = new Uint8Array(await logoResponse.arrayBuffer());
      const branded = patchWorkbookBranding(workbookBytes, logoBytes, kind, filtered, detailHeaderRow, rawHeaderRow, detailValueColumn, rawValueColumn);

      const datePart = dateStart || dateEnd ? `${dateStart || "INICIO"}_A_${dateEnd || "FIM"}` : filters.month !== "Todos" ? `${filters.fortnight !== "Todas" ? `${filters.fortnight}_` : ""}${filters.month}` : "GERAL";
      const filename = `ALC_${kind === "PNR" ? "RELATORIO_PNR" : "PACOTES_PERDIDOS"}_${fileToken(datePart)}.xlsx`;
      downloadBlob(branded, filename);
      toast.success(`${filename} gerado com identidade ALC, Resumo Executivo, Leitura Gerencial, Detalhamento e Dados Brutos.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao gerar o relatório XLSX.");
    } finally {
      setExporting(false);
    }
  };

  if (!rows.length) return <NoResults title={kind === "PNR" ? "Nenhum caso PNR neste recorte" : "Nenhum pacote perdido neste recorte"} detail="Ajuste os filtros globais de período, base ou motorista." />;

  return (
    <div className="view-stack">
      <PageIntro description="Relatórios executivos ALC para leitura gerencial e auditoria. O arquivo agora separa resumo, análise, detalhamento e dados brutos, com identidade visual ALC e totais dinâmicos no Excel." chips={[globalPeriod, `${formatNumber(filtered.length)} IDs no recorte`, "XLSX executivo ALC"]} />

      <Panel title="Gerador de relatório ALC" subtitle="Escolha PNR ou Pacotes Perdidos e refine a data real antes de gerar o arquivo.">
        <div style={{ display: "grid", gridTemplateColumns: "180px minmax(0, 1fr)", gap: 22, alignItems: "center" }}>
          <div style={{ minHeight: 116, display: "grid", placeItems: "center", padding: 16, background: "#090909", borderRadius: 10 }}>
            <Image src="/brand/alc-logo.png" alt="ALC Pereira Filho & Transportes" width={150} height={88} style={{ width: "100%", height: 82, objectFit: "contain" }} />
          </div>
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
            <button className="secondary-button" type="button" onClick={resetLocal}><RotateCcw size={14} />Limpar</button>
            <div style={{ marginLeft: "auto" }}><button className="primary-button" type="button" onClick={() => void exportXlsx()} disabled={exporting || !filtered.length}><Download size={16} />{exporting ? "Montando relatório..." : "Baixar relatório ALC"}</button></div>
          </div>
        </div>
      </Panel>

      <div className="kpi-grid kpi-grid--six">
        <KpiCard label="IDs" value={formatNumber(filtered.length)} detail="Pacotes únicos" icon={<Boxes size={19} />} />
        <KpiCard label="Valor total" value={formatCurrency(totalValue)} detail={kind === "PNR" ? "Valor de compra" : "Valor de pré-fatura"} icon={<BadgeDollarSign size={19} />} tone="red" />
        <KpiCard label="Bases" value={formatNumber(bases.size)} detail="Unidades impactadas" icon={<Building2 size={19} />} />
        <KpiCard label="Motoristas" value={formatNumber(drivers.size)} detail="Identificados" icon={<Users size={19} />} />
        <KpiCard label="Ticket médio" value={formatCurrency(ticketAverage)} detail="Valor médio por ID" icon={<TrendingUp size={19} />} />
        <KpiCard label="Maior impacto" value={topImpact ? formatCurrency(topImpact.value) : "—"} detail={topImpact?.label || "Sem dados"} icon={<ChartNoAxesCombined size={19} />} tone="amber" />
      </div>

      <div className="content-grid content-grid--wide">
        <Panel title={kind === "PNR" ? "Onde está a maior exposição" : "Bases com maior impacto"} subtitle="Ranking financeiro do recorte" className="panel--chart">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analysis.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 24, top: 4 }}>
              <CartesianGrid stroke="#ECEDEF" horizontal={false} />
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#73767d" }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
              <YAxis type="category" dataKey="label" width={150} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#333" }} />
              <Tooltip content={<ChartTooltip currency />} />
              <Bar dataKey="value" name="Valor" fill="#E30613" radius={[0, 4, 4, 0]} maxBarSize={23} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Como interpretar" subtitle="Leitura sugerida antes de baixar" className="panel--chart">
          <div style={{ display: "grid", gap: 10 }}>
            <div className="quality-callout" style={{ margin: 0 }}><TrendingUp size={18} /><div><strong>1. Veja a concentração</strong><p>{topImpact ? `${topImpact.label} concentra ${formatPercent(topImpact.share * 100)} do valor do recorte.` : "Não há concentração relevante no recorte."}</p></div></div>
            <div className="quality-callout" style={{ margin: 0 }}><Building2 size={18} /><div><strong>2. Identifique a origem</strong><p>{topBase ? `${topBase.label} é a base com maior impacto financeiro: ${formatCurrency(topBase.value)}.` : "As bases serão apresentadas no arquivo."}</p></div></div>
            <div className="quality-callout" style={{ margin: 0 }}><FileSpreadsheet size={18} /><div><strong>3. Investigue os IDs</strong><p>Na aba Detalhamento do Excel, filtre Base, Motorista, Status ou Operação. Os totais visíveis mudam automaticamente.</p></div></div>
          </div>
        </Panel>
      </div>

      <div className="content-grid content-grid--wide">
        <Panel title="Bases com maior impacto" subtitle="Top 8 por valor">
          <div className="rank-list">{baseAnalysis.slice(0, 8).map((row, index) => <div key={row.label}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{row.label}</strong><small>{formatNumber(row.cases)} pacotes · {formatPercent(row.share * 100)}</small></div><b>{formatCurrency(row.value)}</b></div>)}</div>
        </Panel>
        <Panel title="Motoristas com maior impacto" subtitle="Top 8 por valor">
          <div className="rank-list">{driverAnalysis.slice(0, 8).map((row, index) => <div key={row.label}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{row.label}</strong><small>{formatNumber(row.cases)} pacotes · {formatPercent(row.share * 100)}</small></div><b>{formatCurrency(row.value)}</b></div>)}</div>
        </Panel>
      </div>

      <Panel title="O que será baixado" subtitle="Estrutura do novo relatório executivo ALC">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
          <div className="quality-callout" style={{ margin: 0 }}><FileSpreadsheet size={18} /><div><strong>Resumo Executivo</strong><p>Logo ALC, indicadores, leitura do cenário, rankings e filtros aplicados.</p></div></div>
          <div className="quality-callout" style={{ margin: 0 }}><ChartNoAxesCombined size={18} /><div><strong>Leitura Gerencial</strong><p>Top bases, top motoristas e distribuição financeira com participação percentual.</p></div></div>
          <div className="quality-callout" style={{ margin: 0 }}><CalendarDays size={18} /><div><strong>Detalhamento</strong><p>Tabela operacional limpa com filtros do Excel e totais dinâmicos por linhas visíveis.</p></div></div>
          <div className="quality-callout" style={{ margin: 0 }}><Download size={18} /><div><strong>Dados Brutos</strong><p>Base completa para auditoria, incluindo arquivo de origem e rastreabilidade.</p></div></div>
        </div>
      </Panel>

      <Panel title="Prévia do detalhamento" subtitle="Primeiros 50 registros que entrarão no arquivo" action={<StatusBadge tone="neutral">{filtered.length} IDs</StatusBadge>}>
        <TableWrap>
          <thead><tr><th>ID</th><th>Data</th>{kind === "PNR" ? <th>Status</th> : <th>Operação</th>}<th>Base</th><th>XPT</th><th>Motorista</th><th>Rota</th><th className="align-right">Valor</th></tr></thead>
          <tbody>{filtered.slice(0, 50).map((row) => <tr key={`${row.shipmentId}-${row.sourceFile}`}><td><strong className="mono">{row.shipmentId}</strong></td><td>{brDate(row.date)}</td><td>{kind === "PNR" ? <StatusBadge tone={/penal|anulad/i.test(row.status) ? "red" : /aguard|revis|comprov/i.test(row.status) ? "amber" : /fatur|proced|aprov/i.test(row.status) ? "green" : "neutral"}>{row.status}</StatusBadge> : row.operation}</td><td><strong>{row.base}</strong></td><td className="mono">{row.xpt}</td><td>{row.driverName}</td><td className="mono">{row.routeId}</td><td className="align-right"><strong>{formatCurrency(row.value)}</strong></td></tr>)}</tbody>
        </TableWrap>
        {!filtered.length ? <div style={{ padding: 20 }}><NoResults title="Nenhum registro corresponde às datas selecionadas" detail="Limpe o intervalo de datas ou ajuste os filtros globais." /></div> : null}
      </Panel>
    </div>
  );
}
