import * as XLSX from "xlsx";
import { dateSchema } from "./validators";
import { SECULLUM_FIELDS, type ColumnMapping, type SecullumPreview, type SecullumField, type AttendanceInput } from "./types";

const normalized = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const ALIASES: Record<SecullumField, string[]> = {
  employee_code: ["matricula", "codigo", "codigo funcionario", "codigo empregado", "employee_code"],
  date: ["data", "dia", "data jornada", "date"], worked_minutes: ["trabalhadas", "horas trabalhadas", "total trabalhado", "worked_minutes"],
  expected_minutes: ["previstas", "horas previstas", "expected_minutes"], first_entry: ["entrada", "primeira entrada", "first_entry"],
  last_exit: ["saida", "ultima saida", "last_exit"], late_minutes: ["atraso", "atrasos", "late_minutes"],
  extra_minutes: ["extras", "horas extras", "extra_minutes"], absence: ["falta", "ausencia", "absence"], divergence: ["divergencia", "inconsistencia", "divergence"],
};
export function parseSecullum(buffer: ArrayBuffer, filename: string, mapping?: ColumnMapping): SecullumPreview {
  if (!/\.(csv|xlsx)$/i.test(filename) || !buffer.byteLength || buffer.byteLength > 5 * 1024 * 1024) throw new Error("Selecione um CSV ou XLSX de até 5 MB.");
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(buffer, { type: "array", cellDates: false, raw: true }); } catch { throw new Error("Arquivo Secullum ilegível."); }
  if (workbook.SheetNames.length !== 1) throw new Error("Selecione um arquivo com uma única aba de jornada diária.");
  const cells = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: false });
  if (cells.length < 2 || cells.length > 10001) throw new Error("O arquivo deve conter cabeçalho e entre 1 e 10.000 linhas.");
  const columns = cells[0].map((v) => String(v ?? "").trim());
  if (columns.some((v) => !v || v.length > 160) || new Set(columns.map(normalized)).size !== columns.length) throw new Error("Cabeçalhos vazios, repetidos ou inválidos.");
  const selected: ColumnMapping = {};
  for (const field of SECULLUM_FIELDS) {
    const matches = columns.filter((c) => ALIASES[field].map(normalized).includes(normalized(c)));
    if (mapping?.[field]) {
      if (!columns.includes(mapping[field]!)) throw new Error("Coluna mapeada não encontrada.");
      selected[field] = mapping[field];
    } else if (matches.length === 1) selected[field] = matches[0];
  }
  if (new Set(Object.values(selected)).size !== Object.values(selected).length) throw new Error("Uma coluna não pode representar dois campos.");
  const missing = ["employee_code", "date", "worked_minutes"].filter((f) => !selected[f as SecullumField]);
  const rows = cells.slice(1).map((cells, index) => {
    const raw = Object.fromEntries(columns.map((col, i) => [col, typeof cells[i] === "number" || typeof cells[i] === "boolean" ? cells[i] : cells[i] == null ? null : String(cells[i]).slice(0, 4000)]));
    const get = (f: SecullumField) => selected[f] ? raw[selected[f]!] : null;
    try {
      if (missing.length) throw new Error(`Mapeie os campos obrigatórios: ${missing.join(", ")}.`);
      const code = String(get("employee_code") ?? "").trim();
      if (!code || code.length > 80) throw new Error("Matrícula inválida.");
      const absence = booleanCell(get("absence"));
      const worked = get("worked_minutes");
      const entry: AttendanceInput = {
        employee_code: code, attendance_date: dateCell(get("date")),
        first_entry: timeCell(get("first_entry")), last_exit: timeCell(get("last_exit")),
        worked_minutes: worked == null && absence ? 0 : minutesCell(worked, true),
        expected_minutes: get("expected_minutes") == null ? null : minutesCell(get("expected_minutes")),
        late_minutes: minutesCell(get("late_minutes")), extra_minutes: minutesCell(get("extra_minutes")),
        absence, divergence: booleanCell(get("divergence")),
      };
      if (entry.absence && entry.worked_minutes > 0) throw new Error("Falta incompatível com minutos trabalhados.");
      return { rowNumber: index + 2, raw, entry, error: null as string | null };
    } catch (error) { return { rowNumber: index + 2, raw, entry: null, error: error instanceof Error ? error.message : "Linha inválida." }; }
  });
  const seen = new Map<string, typeof rows[number]>();
  for (const row of rows) if (row.entry) {
    const key = `${row.entry.employee_code}:${row.entry.attendance_date}`;
    const previous = seen.get(key);
    if (previous) { previous.error = row.error = "Matrícula/data repetida no arquivo; consolide o espelho diário antes de importar."; }
    else seen.set(key, row);
  }
  return { columns, mapping: selected, missing, rows };
}
function booleanCell(v: unknown) {
  if (v == null || v === "") return false;
  const text = normalized(String(v));
  if (["sim", "true", "1", "s", "yes"].includes(text)) return true;
  if (["nao", "false", "0", "n", "no"].includes(text)) return false;
  throw new Error("Indicador deve ser Sim/Não ou 1/0.");
}
function minutesCell(v: unknown, required = false) {
  if (v == null || v === "") { if (required) throw new Error("Horas trabalhadas ausentes."); return 0; }
  const value = String(v).trim();
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value);
  const minutes = match ? Number(match[1]) * 60 + Number(match[2]) : /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) throw new Error("Duração inválida; use minutos inteiros ou HH:MM.");
  return minutes;
}
function dateCell(v: unknown) {
  let value = String(v ?? "").trim();
  if (typeof v === "number") {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (!parsed) throw new Error("Data inválida.");
    value = `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (br) value = `${br[3]}-${br[2]}-${br[1]}`;
  if (!dateSchema.safeParse(value).success) throw new Error("Data inválida; use DD/MM/AAAA ou AAAA-MM-DD.");
  return value;
}
function timeCell(v: unknown) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && v >= 0 && v < 1) {
    const minutes = Math.round(v * 1440);
    if (minutes >= 1440) throw new Error("Horário inválido.");
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
  const value = String(v).trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)) throw new Error("Horário inválido; use HH:MM.");
  return value;
}
