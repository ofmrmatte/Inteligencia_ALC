"use client";

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { fortnightFromDate, monthFromFortnight, normalizeFortnight } from "@/lib/competence";
import { normalizeText } from "@/lib/normalize";
import { pnrClassificationFamily, pnrClassificationLabel } from "@/lib/pnr-classification";
import type { DashboardFilters, PnrRecord } from "@/lib/types";

type PnrExportContext = {
  filters: DashboardFilters;
  statusLabel: string;
  idSearch: string;
};

type AnalysisRow = { label: string; count: number; value: number; share: number };

const BRAND = {
  red: "E30613",
  charcoal: "25272B",
  gray700: "60636A",
  gray200: "E8E9EC",
  gray100: "F3F4F6",
  white: "FFFFFF",
  lightRed: "FFF3F4",
  lightGreen: "EDF7F2",
  lightAmber: "FFF7E8",
  altRow: "FAFAFB",
};

function cleanStatus(status: string) {
  return status?.trim() || "Sem status";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value || 0);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value || 0);
}

function rowFortnight(row: PnrRecord) {
  return normalizeFortnight(row.billingPeriod) || fortnightFromDate(row.caseDate);
}

function rowMonth(row: PnrRecord) {
  return monthFromFortnight(rowFortnight(row));
}

function formatMonth(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value || "Todos os meses";
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(Number(match[1]), Number(match[2]) - 1, 1),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatFortnight(value: string) {
  const normalized = normalizeFortnight(value);
  const match = /^(0[12])Q(\d{2})(\d{4})$/.exec(normalized);
  if (!match) return value || "—";
  const month = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(
    new Date(Number(match[3]), Number(match[2]) - 1, 1),
  );
  return `${match[1] === "01" ? "1Q" : "2Q"} · ${month}/${match[3]}`;
}

function baseLabel(row: PnrRecord) {
  return row.originStation || row.baseName || row.sigla || row.baseKey || "Não conciliada";
}

function driverLabel(row: PnrRecord) {
  return row.driverName || row.driverId || "Não identificado";
}

function originLabel(row: PnrRecord) {
  return row.sourceSystem === "case_center" ? "Case Center" : "Histórico ALC";
}

function classificationLabel(row: PnrRecord) {
  return pnrClassificationLabel(row) || "Não classificado";
}

function familyLabel(row: PnrRecord) {
  return pnrClassificationFamily(row) || "Não classificado";
}

function groupAnalysis(rows: PnrRecord[], key: (row: PnrRecord) => string, totalValue: number): AnalysisRow[] {
  const map = new Map<string, { label: string; count: number; value: number }>();
  rows.forEach((row) => {
    const label = key(row) || "Não identificado";
    const current = map.get(label) ?? { label, count: 0, value: 0 };
    current.count += 1;
    current.value += Number(row.purchaseValue || 0);
    map.set(label, current);
  });
  return [...map.values()]
    .map((item) => ({ ...item, share: totalValue ? item.value / totalValue : 0 }))
    .sort((a, b) => b.value - a.value || b.count - a.count);
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
  return xml
    .replace(/<sheetView workbookViewId="0"\s*\/>/, '<sheetView workbookViewId="0" showGridLines="0"/>')
    .replace(/<sheetView workbookViewId="0">/, '<sheetView workbookViewId="0" showGridLines="0">');
}

function freezeRows(xml: string, rows: number) {
  const pane = `<pane ySplit="${rows}" topLeftCell="A${rows + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${rows + 1}" sqref="A${rows + 1}"/>`;
  return xml
    .replace(/<sheetView workbookViewId="0" showGridLines="0"\s*\/>/, `<sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView>`)
    .replace(/<sheetView workbookViewId="0"\s*\/>/, `<sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView>`);
}

function pnrStylesXml() {
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
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="TableStyleMedium2"/>
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

function statusStyleId(status: string | undefined) {
  const normalized = normalizeText(status || "");
  if (/FATUR|PROCEDENTE|APROVADO|CONCLUID/.test(normalized)) return 24;
  if (/ANULAD|CANCELAD|IMPROCEDENTE/.test(normalized)) return 23;
  if (/ANALISE|PENDENTE|REVISAO|COMPROVANTE|PENALIDADE|AGUARDANDO/.test(normalized)) return 25;
  return null;
}

function familyStyleId(family: string | undefined) {
  const normalized = normalizeText(family || "");
  if (normalized === "FATURAMENTO") return 24;
  if (normalized === "ANULACAO") return 23;
  return null;
}

function patchPnrWorkbook(
  workbookBytes: ArrayBuffer,
  logoBytes: Uint8Array,
  rows: PnrRecord[],
  detailHeaderRow: number,
  rawHeaderRow: number,
  detailValueColumn: string,
  rawValueColumn: string,
) {
  const files = unzipSync(new Uint8Array(workbookBytes));
  files["xl/styles.xml"] = strToU8(pnrStylesXml());

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
    if (row >= 18 && row <= 23) {
      const alt = row % 2 === 1;
      if (col === 3) return alt ? 16 : 15;
      if (col === 4) return alt ? 20 : 19;
      return alt ? 14 : 13;
    }
    if (row >= 27 && row <= 33) {
      const alt = row % 2 === 0;
      if ([3, 9].includes(col)) return alt ? 16 : 15;
      if ([4, 10].includes(col)) return alt ? 20 : 19;
      return alt ? 14 : 13;
    }
    if (row >= 36 && row <= 37) return col % 3 === 0 ? 8 : 13;
    if (row === 39) return 26;
    return null;
  }));

  const management = hideGridlines(strFromU8(files["xl/worksheets/sheet2.xml"]));
  files["xl/worksheets/sheet2.xml"] = strToU8(cellStyleXml(management, (column, row) => {
    if (row === 1) return 4;
    if (row === 2) return 5;
    if (row === 3) return 6;
    if ([5, 19].includes(row)) return 7;
    if ([6, 20].includes(row)) return 12;
    if ((row >= 7 && row <= 16) || (row >= 21 && row <= 35)) {
      const alt = row % 2 === 0;
      if (["D", "J"].includes(column)) return alt ? 16 : 15;
      if (["E", "K"].includes(column)) return alt ? 20 : 19;
      return alt ? 14 : 13;
    }
    return null;
  }));

  const detail = freezeRows(hideGridlines(strFromU8(files["xl/worksheets/sheet3.xml"])), detailHeaderRow);
  files["xl/worksheets/sheet3.xml"] = strToU8(cellStyleXml(detail, (column, row) => {
    if (row === 1) return 4;
    if (row === 2) return 6;
    if (row === 3) {
      if (["A", "C", "E"].includes(column)) return 8;
      if (column === "B") return 9;
      if (column === "D") return 10;
      return 13;
    }
    if (row === detailHeaderRow) return 12;
    if (row > detailHeaderRow) {
      const dataIndex = row - detailHeaderRow - 1;
      const alt = dataIndex % 2 === 1;
      if (column === "D") return alt ? 18 : 17;
      if (column === detailValueColumn) return alt ? 16 : 15;
      if (column === "C") return statusStyleId(rows[dataIndex]?.status) ?? (alt ? 14 : 13);
      if (column === "L") return familyStyleId(familyLabel(rows[dataIndex])) ?? (alt ? 14 : 13);
      if (["M", "N", "O"].includes(column)) return alt ? 22 : 21;
      return alt ? 14 : 13;
    }
    return null;
  }));

  const raw = freezeRows(hideGridlines(strFromU8(files["xl/worksheets/sheet4.xml"])), rawHeaderRow);
  files["xl/worksheets/sheet4.xml"] = strToU8(cellStyleXml(raw, (column, row) => {
    if (row === 1) return 4;
    if (row === 2) return 6;
    if (row === rawHeaderRow) return 12;
    if (row > rawHeaderRow) {
      const dataIndex = row - rawHeaderRow - 1;
      const alt = dataIndex % 2 === 1;
      if (column === "D") return alt ? 18 : 17;
      if (column === rawValueColumn) return alt ? 16 : 15;
      if (column === "C") return statusStyleId(rows[dataIndex]?.status) ?? (alt ? 14 : 13);
      if (column === "L") return familyStyleId(familyLabel(rows[dataIndex])) ?? (alt ? 14 : 13);
      if (["M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "AA", "AB", "AC", "AD", "AE"].includes(column)) return alt ? 22 : 21;
      return alt ? 14 : 13;
    }
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

function latestMonthToken(rows: PnrRecord[]) {
  const months = rows.map(rowMonth).filter(Boolean).sort();
  const month = months.at(-1) || new Date().toISOString().slice(0, 7);
  return month.replace("-", "");
}

function reportFilename(rows: PnrRecord[], filters: DashboardFilters) {
  const monthToken = filters.month !== "Todos" ? filters.month.replace("-", "") : latestMonthToken(rows);
  if (filters.month !== "Todos" && (filters.fortnight === "Q1" || filters.fortnight === "Q2")) {
    return `ALC_Casos_PNR_${monthToken}${filters.fortnight}.xlsx`;
  }
  if (filters.month !== "Todos") return `ALC_Casos_PNR_${monthToken}_Completo.xlsx`;
  return `ALC_Casos_PNR_${monthToken}_Geral.xlsx`;
}

function filterBaseLabel(filters: DashboardFilters) {
  if (filters.base !== "Todas" && filters.sigla !== "Todas") return `${filters.sigla} · ${filters.base}`;
  if (filters.base !== "Todas") return filters.base;
  if (filters.sigla !== "Todas") return filters.sigla;
  return "Todas as bases";
}

function filterSummary(filters: DashboardFilters, statusLabel: string, idSearch: string) {
  const parts = [
    filters.month === "Todos" ? "Todos os meses" : formatMonth(filters.month),
    filters.fortnight === "Todas" ? "Todas as quinzenas" : `Quinzena ${filters.fortnight === "Q1" ? "1" : "2"}`,
    filterBaseLabel(filters),
    statusLabel,
  ];
  if (filters.xpt !== "Todos") parts.push(`XPT ${filters.xpt}`);
  if (filters.driver !== "Todos") parts.push(filters.driver);
  if (idSearch) parts.push(`ID contém ${idSearch}`);
  return parts.join(" · ");
}

export async function exportPnrReport(rows: PnrRecord[], context: PnrExportContext) {
  if (!rows.length) throw new Error("Não há casos PNR no recorte atual para exportar.");

  const XLSX = await import("xlsx");
  const generatedAt = new Date();
  const totalValue = rows.reduce((sum, row) => sum + Number(row.purchaseValue || 0), 0);
  const uniqueIds = new Set(rows.map((row) => row.shipmentId)).size;
  const completed = rows.filter((row) => /PROCEDENTE|APROVADO|CONCLUIDO|FATURAMENTO|ANULAD/.test(normalizeText(row.status))).length;
  const bases = new Set(rows.map(baseLabel).filter((value) => value && value !== "Não conciliada"));
  const drivers = new Set(rows.map((row) => row.driverId || row.driverName).filter(Boolean));
  const statusAnalysis = groupAnalysis(rows, (row) => cleanStatus(row.status), totalValue);
  const baseAnalysis = groupAnalysis(rows, baseLabel, totalValue);
  const driverAnalysis = groupAnalysis(rows, driverLabel, totalValue);
  const classificationAnalysis = groupAnalysis(rows, classificationLabel, totalValue);
  const topStatus = statusAnalysis[0];
  const topBase = baseAnalysis[0];
  const filterText = filterSummary(context.filters, context.statusLabel, context.idSearch);
  const reportTitle = "RELATÓRIO EXECUTIVO — CASOS PNR";

  const summaryRows: Array<Array<string | number | Date | null>> = Array.from({ length: 40 }, () => []);
  summaryRows[0][3] = "INTELIGÊNCIA ALC";
  summaryRows[1][3] = reportTitle;
  summaryRows[2][3] = filterText;
  summaryRows[3][3] = `Gerado em ${generatedAt.toLocaleString("pt-BR")} · Inteligência ALC`;
  summaryRows[6][0] = "INDICADORES PRINCIPAIS";

  const cardLabels = ["CASOS ÚNICOS", "ENCERRADOS", "VALOR DE COMPRA", "BASES", "MOTORISTAS", "PRINCIPAL STATUS"];
  const cardValues: Array<string | number> = [uniqueIds, completed, totalValue, bases.size, drivers.size, topStatus?.label || "—"];
  const cardDetails = [
    "IDs de envio consolidados",
    `${formatPercent(completed / Math.max(1, rows.length))} dos casos do recorte`,
    "Soma dos valores de compra",
    "Unidades impactadas",
    "Motoristas identificados",
    topStatus ? `${formatPercent(topStatus.share)} do valor` : "Sem concentração",
  ];
  cardLabels.forEach((label, index) => {
    const col = index * 2;
    summaryRows[7][col] = label;
    summaryRows[8][col] = cardValues[index];
    summaryRows[9][col] = cardDetails[index];
  });

  summaryRows[10][0] = "LEITURA EXECUTIVA";
  summaryRows[11][0] = topStatus
    ? `${topStatus.label} concentra ${formatCurrency(topStatus.value)} em ${formatNumber(topStatus.count)} caso(s), equivalentes a ${formatPercent(topStatus.share)} do valor de compra no recorte.`
    : "Não há concentração suficiente para uma leitura executiva.";
  summaryRows[11][7] = "COMO INTERPRETAR";
  summaryRows[12][7] = topBase
    ? `Comece pelos status com maior impacto financeiro. Em seguida, observe as bases e motoristas com maior exposição. ${topBase.label} lidera o recorte com ${formatCurrency(topBase.value)}. Use a aba Detalhamento para investigar cada caso individualmente.`
    : "Use a aba Detalhamento para investigar os casos. Os totais visíveis se atualizam conforme os filtros aplicados no Excel.";

  summaryRows[15][0] = "DISTRIBUIÇÃO POR STATUS";
  summaryRows[16] = ["#", "Status", "Casos", "Valor", "% do total"];
  statusAnalysis.slice(0, 6).forEach((item, index) => {
    summaryRows[17 + index] = [index + 1, item.label, item.count, item.value, item.share];
  });

  summaryRows[24][0] = "MAIORES IMPACTOS";
  summaryRows[25] = ["#", "Base", "Casos", "Valor", "%", "", "#", "Motorista", "Casos", "Valor", "%"];
  for (let index = 0; index < 7; index += 1) {
    const base = baseAnalysis[index];
    const driver = driverAnalysis[index];
    const row = 26 + index;
    if (base) summaryRows[row].splice(0, 5, index + 1, base.label, base.count, base.value, base.share);
    if (driver) summaryRows[row].splice(6, 5, index + 1, driver.label, driver.count, driver.value, driver.share);
  }

  summaryRows[34][0] = "FILTROS APLICADOS";
  summaryRows[35] = [
    "Mês",
    context.filters.month === "Todos" ? "Todos os meses" : formatMonth(context.filters.month),
    "Quinzena",
    context.filters.fortnight === "Todas" ? "Todas" : context.filters.fortnight,
    "Base",
    filterBaseLabel(context.filters),
  ];
  summaryRows[36] = [
    "Status",
    context.statusLabel,
    "Busca por ID",
    context.idSearch || "Sem filtro",
    "Casos",
    uniqueIds,
  ];
  summaryRows[38][0] = "Relatório gerado pelo Inteligência ALC · uso interno · Casos PNR.";

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet["!merges"] = [
    { s: { r: 0, c: 3 }, e: { r: 0, c: 11 } },
    { s: { r: 1, c: 3 }, e: { r: 1, c: 11 } },
    { s: { r: 2, c: 3 }, e: { r: 2, c: 11 } },
    { s: { r: 3, c: 3 }, e: { r: 3, c: 11 } },
    { s: { r: 6, c: 0 }, e: { r: 6, c: 11 } },
    ...Array.from({ length: 6 }, (_, index) => ({ s: { r: 7, c: index * 2 }, e: { r: 7, c: index * 2 + 1 } })),
    ...Array.from({ length: 6 }, (_, index) => ({ s: { r: 8, c: index * 2 }, e: { r: 8, c: index * 2 + 1 } })),
    ...Array.from({ length: 6 }, (_, index) => ({ s: { r: 9, c: index * 2 }, e: { r: 9, c: index * 2 + 1 } })),
    { s: { r: 10, c: 0 }, e: { r: 10, c: 11 } },
    { s: { r: 11, c: 0 }, e: { r: 12, c: 6 } },
    { s: { r: 11, c: 7 }, e: { r: 11, c: 11 } },
    { s: { r: 12, c: 7 }, e: { r: 13, c: 11 } },
    { s: { r: 15, c: 0 }, e: { r: 15, c: 11 } },
    { s: { r: 24, c: 0 }, e: { r: 24, c: 11 } },
    { s: { r: 34, c: 0 }, e: { r: 34, c: 11 } },
    { s: { r: 38, c: 0 }, e: { r: 38, c: 11 } },
  ];
  summarySheet["!cols"] = Array.from({ length: 12 }, (_, index) => ({ wch: [7, 29, 13, 18, 12, 4, 7, 29, 13, 18, 12, 14][index] }));

  const managementRows: Array<Array<string | number>> = Array.from({ length: 38 }, () => []);
  managementRows[0][0] = "INTELIGÊNCIA ALC · LEITURA GERENCIAL";
  managementRows[1][0] = reportTitle;
  managementRows[2][0] = filterText;
  managementRows[4][0] = "BASES E MOTORISTAS COM MAIOR IMPACTO";
  managementRows[5] = ["#", "Base", "Casos", "Valor", "%", "", "#", "Motorista", "Casos", "Valor", "%"];
  for (let index = 0; index < 10; index += 1) {
    const base = baseAnalysis[index];
    const driver = driverAnalysis[index];
    const row = 6 + index;
    if (base) managementRows[row].splice(0, 5, index + 1, base.label, base.count, base.value, base.share);
    if (driver) managementRows[row].splice(6, 5, index + 1, driver.label, driver.count, driver.value, driver.share);
  }
  managementRows[18][0] = "STATUS E CLASSIFICAÇÕES FINANCEIRAS";
  managementRows[19] = ["#", "Status", "Casos", "Valor", "%", "Concentração", "#", "Classificação", "Casos", "Valor", "%"];
  for (let index = 0; index < 15; index += 1) {
    const status = statusAnalysis[index];
    const classification = classificationAnalysis[index];
    const row = 20 + index;
    if (status) managementRows[row].splice(0, 6, index + 1, status.label, status.count, status.value, status.share, textBar(status.share));
    if (classification) managementRows[row].splice(6, 5, index + 1, classification.label, classification.count, classification.value, classification.share);
  }

  const managementSheet = XLSX.utils.aoa_to_sheet(managementRows);
  managementSheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 10 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 10 } },
    { s: { r: 18, c: 0 }, e: { r: 18, c: 10 } },
  ];
  managementSheet["!cols"] = [
    { wch: 5 }, { wch: 34 }, { wch: 13 }, { wch: 17 }, { wch: 11 }, { wch: 21 },
    { wch: 5 }, { wch: 34 }, { wch: 13 }, { wch: 17 }, { wch: 11 },
  ];

  const detailHeaders = [
    "ID do envio",
    "ID do caso",
    "Status",
    "Data",
    "Competência",
    "Base de origem",
    "XPT",
    "Motorista",
    "ID Motorista",
    "Rota",
    "Valor",
    "Família financeira",
    "Classificação financeira",
    "Origem",
    "Última captura",
  ];
  const detailRows = rows.map((row) => [
    row.shipmentId,
    row.caseId || "—",
    cleanStatus(row.status),
    row.caseDate ? new Date(`${row.caseDate}T12:00:00`) : null,
    formatFortnight(row.billingPeriod || rowFortnight(row)),
    baseLabel(row),
    row.xptCode || "—",
    driverLabel(row),
    row.driverId || "—",
    row.routeId || row.routeCode || "—",
    Number(row.purchaseValue || 0),
    familyLabel(row),
    classificationLabel(row),
    originLabel(row),
    row.lastCapturedAt ? new Date(row.lastCapturedAt).toLocaleString("pt-BR") : "—",
  ]);

  const detailHeaderRow = 6;
  const detailValueIndex = 10;
  const detailValueColumn = XLSX.utils.encode_col(detailValueIndex);
  const detailEndRow = detailHeaderRow + detailRows.length;
  const detailSheet = XLSX.utils.aoa_to_sheet(
    [
      [reportTitle],
      ["Detalhamento operacional · filtre o cabeçalho para investigar IDs, status, bases, motoristas e classificações"],
      ["REGISTROS VISÍVEIS", null, "VALOR VISÍVEL", null, "COMPETÊNCIA", context.filters.month === "Todos" ? "Todos os meses" : formatMonth(context.filters.month)],
      [],
      [],
      detailHeaders,
      ...detailRows,
    ],
    { cellDates: true },
  );
  detailSheet.B3 = { t: "n", f: `SUBTOTAL(103,A${detailHeaderRow + 1}:A${detailEndRow})` };
  detailSheet.D3 = { t: "n", f: `SUBTOTAL(109,${detailValueColumn}${detailHeaderRow + 1}:${detailValueColumn}${detailEndRow})`, z: "R$ #,##0.00" };
  detailSheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: detailHeaders.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: detailHeaders.length - 1 } },
  ];
  detailSheet["!autofilter"] = { ref: `A${detailHeaderRow}:${XLSX.utils.encode_col(detailHeaders.length - 1)}${detailEndRow}` };
  detailSheet["!cols"] = detailHeaders.map((header, index) => ({
    wch: index === 0 ? 18
      : /Motorista|Base|Classificação|Origem/.test(header) ? 28
        : /Status/.test(header) ? 26
          : /Valor/.test(header) ? 16
            : /captura/i.test(header) ? 20
              : 15,
  }));

  const rawHeaders = [
    ...detailHeaders,
    "Produtos",
    "Transportadora",
    "Status principal",
    "Substatus",
    "Revisão",
    "Tipo do caso",
    "Status da rota",
    "Prioridade",
    "Captura do caso",
    "Sincronização detalhes",
    "Arquivo de origem",
    "Aba de origem",
    "Lote",
    "Linha de origem",
    "Primeira captura",
    "Última visualização na fonte",
  ];
  const rawRows = rows.map((row) => [
    row.shipmentId,
    row.caseId || "—",
    cleanStatus(row.status),
    row.caseDate ? new Date(`${row.caseDate}T12:00:00`) : null,
    formatFortnight(row.billingPeriod || rowFortnight(row)),
    baseLabel(row),
    row.xptCode || "—",
    driverLabel(row),
    row.driverId || "—",
    row.routeId || row.routeCode || "—",
    Number(row.purchaseValue || 0),
    familyLabel(row),
    classificationLabel(row),
    originLabel(row),
    row.lastCapturedAt || "—",
    row.products || "—",
    row.carrier || "—",
    row.mainStatus || "—",
    row.subStatus || "—",
    row.reviewedStatus || "—",
    row.caseType || "—",
    row.routeStatus || "—",
    row.priority || "—",
    row.caseCaptureStatus || "—",
    row.detailSyncStatus || "—",
    row.sourceFile || "—",
    row.sourceSheet || "—",
    row.batchId || "—",
    row.rowNumber || "—",
    row.firstCapturedAt || "—",
    row.sourceLastSeenAt || "—",
  ]);

  const rawHeaderRow = 3;
  const rawValueIndex = 10;
  const rawValueColumn = XLSX.utils.encode_col(rawValueIndex);
  const rawEndRow = rawHeaderRow + rawRows.length;
  const rawSheet = XLSX.utils.aoa_to_sheet(
    [
      ["INTELIGÊNCIA ALC · DADOS BRUTOS — CASOS PNR"],
      ["Base técnica do relatório. Preserve esta aba para auditoria e rastreabilidade."],
      rawHeaders,
      ...rawRows,
    ],
    { cellDates: true },
  );
  rawSheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: rawHeaders.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: rawHeaders.length - 1 } },
  ];
  rawSheet["!autofilter"] = { ref: `A${rawHeaderRow}:${XLSX.utils.encode_col(rawHeaders.length - 1)}${rawEndRow}` };
  rawSheet["!cols"] = rawHeaders.map((header, index) => ({
    wch: index === 0 ? 18
      : /Motorista|Base|Classificação|Produtos|Transportadora|Arquivo|Aba|Status principal|Substatus/.test(header) ? 28
        : /Status/.test(header) ? 24
          : /Valor/.test(header) ? 16
            : 15,
  }));

  const workbook = XLSX.utils.book_new();
  (workbook as unknown as { Props?: Record<string, unknown> }).Props = {
    Title: `ALC - ${reportTitle}`,
    Subject: "Relatório executivo de Casos PNR gerado pelo Inteligência ALC",
    Author: "Inteligência ALC",
    Company: "ALC Pereira Filho & Transportes",
    CreatedDate: generatedAt,
  };
  (workbook as unknown as { Workbook?: Record<string, unknown> }).Workbook = {
    CalcPr: { calcMode: "auto", fullCalcOnLoad: true, forceFullCalc: true },
  };

  XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumo Executivo");
  XLSX.utils.book_append_sheet(workbook, managementSheet, "Leitura Gerencial");
  XLSX.utils.book_append_sheet(workbook, detailSheet, "Detalhamento");
  XLSX.utils.book_append_sheet(workbook, rawSheet, "Dados Brutos");

  const workbookBytes = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
    compression: true,
    cellDates: true,
  }) as ArrayBuffer;

  const logoResponse = await fetch("/brand/alc-logo.png", { cache: "force-cache" });
  if (!logoResponse.ok) throw new Error("Não foi possível carregar a identidade visual ALC para o relatório.");

  const branded = patchPnrWorkbook(
    workbookBytes,
    new Uint8Array(await logoResponse.arrayBuffer()),
    rows,
    detailHeaderRow,
    rawHeaderRow,
    detailValueColumn,
    rawValueColumn,
  );

  const filename = reportFilename(rows, context.filters);
  downloadBlob(branded, filename);
  return filename;
}
