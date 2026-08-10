export type MissingPackageSortKey =
  | "data_fechamento"
  | "base"
  | "driver_nome"
  | "id_envio"
  | "status_caso"
  | "status_contato_meli"
  | "prazo_tratativa";

export type MissingPackageFilters = {
  page: number;
  pageSize: number;
  q: string;
  base: string;
  statusCaso: string;
  statusContato: string;
  prazo: string;
  sort: MissingPackageSortKey;
  dir: "asc" | "desc";
};

export type MissingPackageRecord = {
  id: string;
  data_fechamento: string | null;
  base: string | null;
  tipo_base: string | null;
  driver_nome: string | null;
  id_envio: string | null;
  caso: string | null;
  motivo_original: string | null;
  status_caso: string | null;
  status_contato_meli: string | null;
  prazo_tratativa: string | null;
  situacao_prazo: string | null;
  imported_at: string | null;
  imported_by: string | null;
  source_file_id: string | null;
  file_name: string | null;
  raw_data: Record<string, unknown> | null;
  module_key: string | null;
};

export type MissingPackageSummary = {
  totalRows: number;
  pending: number;
  completed: number;
  expired: number;
  nearDeadline: number;
  bases: number;
  drivers: number;
  topBases: Array<{ label: string; count: number }>;
  statusRows: Array<{ label: string; count: number; share: number }>;
};

export type MissingPackagePageData = {
  rows: MissingPackageRecord[];
  summary: MissingPackageSummary;
  totalRows: number;
  totalPages: number;
  filters: MissingPackageFilters;
  options: {
    bases: string[];
    statusCasos: string[];
    statusContatos: string[];
    prazos: string[];
  };
  error: string | null;
};

export const MISSING_PACKAGE_SORT_KEYS: MissingPackageSortKey[] = [
  "data_fechamento",
  "base",
  "driver_nome",
  "id_envio",
  "status_caso",
  "status_contato_meli",
  "prazo_tratativa",
];

export const MISSING_PACKAGE_CASE_STATUSES = ["Pendente", "Em rota", "Concluído"] as const;
export const MISSING_PACKAGE_CONTACT_STATUSES = ["E-mail Enviado", "Aguardando MELI", "Concluído"] as const;

export function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function deadlineStatus(row: Pick<MissingPackageRecord, "status_caso" | "status_contato_meli" | "prazo_tratativa" | "situacao_prazo">) {
  const status = normalizeText(`${row.status_caso || ""} ${row.status_contato_meli || ""}`);
  if (status.includes("CONCLUID")) return "Concluído";
  if (row.situacao_prazo) return row.situacao_prazo;
  if (!row.prazo_tratativa) return "Sem prazo";
  const due = new Date(row.prazo_tratativa);
  if (Number.isNaN(due.getTime())) return "Sem prazo";
  const now = Date.now();
  if (due.getTime() <= now) return "Vencido";
  if (due.getTime() <= now + 12 * 60 * 60 * 1000) return "Próximo do vencimento";
  return "Dentro do prazo";
}

export function calculateMissingPackageMetrics(rows: MissingPackageRecord[], totalRows = rows.length): MissingPackageSummary {
  const statusMap = new Map<string, number>();
  const baseMap = new Map<string, number>();
  let pending = 0;
  let completed = 0;
  let expired = 0;
  let nearDeadline = 0;

  rows.forEach((row) => {
    const status = row.status_caso || "Indefinido";
    statusMap.set(status, (statusMap.get(status) || 0) + 1);
    const base = row.base || "Sem base";
    baseMap.set(base, (baseMap.get(base) || 0) + 1);

    const prazo = deadlineStatus(row);
    if (normalizeText(status).includes("CONCLUID")) completed += 1;
    else pending += 1;
    if (prazo === "Vencido") expired += 1;
    if (prazo === "Próximo do vencimento") nearDeadline += 1;
  });

  return {
    totalRows,
    pending,
    completed,
    expired,
    nearDeadline,
    bases: new Set(rows.map((row) => row.base).filter(Boolean)).size,
    drivers: new Set(rows.map((row) => row.driver_nome).filter(Boolean)).size,
    topBases: [...baseMap.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    statusRows: [...statusMap.entries()]
      .map(([label, count]) => ({ label, count, share: totalRows ? (count / totalRows) * 100 : 0 }))
      .sort((a, b) => b.count - a.count),
  };
}
