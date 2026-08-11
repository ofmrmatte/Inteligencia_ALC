export type PreFaturaRecord = {
  id: string;
  competencia: string | null;
  quinzena: string | null;
  tipo: string | null;
  base: string | null;
  codigo_base: string | null;
  driver: string | null;
  placa: string | null;
  data: string | null;
  id_envio: string | null;
  rota: string | null;
  valor: number | string | null;
  aba_origem: string | null;
  file_id: string;
  created_at: string | null;
};

export type PreFaturaSummaryInput = Pick<PreFaturaRecord, "valor" | "id_envio" | "codigo_base" | "base" | "driver" | "rota">;

export type PreFaturaShipmentRecord = Pick<PreFaturaRecord, "id_envio" | "base" | "codigo_base" | "driver" | "placa" | "data" | "rota" | "valor" | "tipo" | "aba_origem">;

export type PreFaturaCollapseResult<T> = {
  records: T[];
  duplicateRowsCollapsed: number;
  duplicateIdsWithConflicts: string[];
  sourceValidRows: number;
  acceptedRows: number;
};

export type PreFaturaPersistencePlan<T> = {
  duplicateFile: boolean;
  newRecords: T[];
  existingRecords: T[];
  existingIdsSkipped: number;
};

export type PreFaturaFilters = {
  page: number;
  pageSize: number;
  q: string;
  competencia: string;
  quinzena: string;
  tipo: string;
  base: string;
  sort: PreFaturaSortKey;
  dir: "asc" | "desc";
};

export type PreFaturaSortKey = "valor" | "data" | "base" | "driver" | "rota" | "id_envio" | "created_at";

export type PreFaturaSummary = {
  totalRows: number;
  totalValue: number;
  packageIds: number;
  bases: number;
  drivers: number;
  routes: number;
  averageValue: number;
};

export type PreFaturaPageData = {
  rows: PreFaturaRecord[];
  summary: PreFaturaSummary;
  totalRows: number;
  totalPages: number;
  filters: PreFaturaFilters;
  options: {
    competencias: string[];
    quinzenas: string[];
    tipos: string[];
    bases: Array<{ value: string; label: string }>;
  };
  error: string | null;
};

export const PRE_FATURA_SORT_KEYS: PreFaturaSortKey[] = ["valor", "data", "base", "driver", "rota", "id_envio", "created_at"];

function preFaturaConflictFingerprint(row: PreFaturaShipmentRecord) {
  return [
    normalizeIdentity(row.base),
    normalizeIdentity(row.codigo_base),
    normalizeIdentity(row.driver),
    normalizeIdentity(row.placa),
    normalizeIdentity(row.data),
    normalizeIdentity(row.rota),
    normalizeIdentity(row.valor),
    normalizeIdentity(row.tipo),
    normalizeIdentity(row.aba_origem),
  ].join("|");
}

export function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value == null) return 0;

  const raw = String(value)
    .trim()
    .replace(/\s+/g, "")
    .replace(/^R\$/i, "")
    .replace(/[^\d,.\-]/g, "");

  if (!raw || raw === "-") return 0;

  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let normalized = raw;

  if (lastComma >= 0 && lastDot >= 0) {
    // O último separador é o decimal:
    // 1.234,56 -> 1234.56
    // 1,234.56 -> 1234.56
    if (lastComma > lastDot) {
      normalized = raw.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = raw.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    // Padrão brasileiro: 55,95 -> 55.95.
    // Se vier agrupamento inteiro como 1,234,567, remove os milhares.
    normalized = /^-?\d{1,3}(?:,\d{3})+$/.test(raw)
      ? raw.replace(/,/g, "")
      : raw.replace(",", ".");
  } else if (lastDot >= 0) {
    // Mercado Livre usa ponto decimal: 55.95 precisa continuar 55.95.
    // Só tratamos ponto como milhar quando há agrupamento inequívoco:
    // 1.234.567 -> 1234567.
    normalized = /^-?\d{1,3}(?:\.\d{3})+$/.test(raw)
      ? raw.replace(/\./g, "")
      : raw;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeIdentity(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function calculatePreFaturaSummary(rows: PreFaturaSummaryInput[], totalRows = rows.length) {
  const totalValue = rows.reduce((sum, row) => sum + toNumber(row.valor), 0);
  return {
    totalRows,
    totalValue,
    packageIds: new Set(rows.map((row) => normalizeIdentity(row.id_envio)).filter(Boolean)).size,
    bases: new Set(rows.map((row) => normalizeIdentity(row.codigo_base || row.base)).filter(Boolean)).size,
    drivers: new Set(rows.map((row) => normalizeIdentity(row.driver)).filter(Boolean)).size,
    routes: new Set(rows.map((row) => normalizeIdentity(row.rota)).filter(Boolean)).size,
    averageValue: rows.length ? totalValue / rows.length : 0,
  };
}

export function collapsePreFaturaRecordsByShipmentId<T extends PreFaturaShipmentRecord>(records: T[]): PreFaturaCollapseResult<T> {
  const byShipmentId = new Map<string, { record: T; fingerprint: string; conflict: boolean }>();

  records.forEach((record) => {
    const shipmentId = normalizeIdentity(record.id_envio);
    if (!shipmentId) return;
    const fingerprint = preFaturaConflictFingerprint(record);
    const existing = byShipmentId.get(shipmentId);
    if (!existing) {
      byShipmentId.set(shipmentId, { record, fingerprint, conflict: false });
      return;
    }
    if (existing.fingerprint !== fingerprint) {
      existing.conflict = true;
    }
  });

  const collapsed = [...byShipmentId.values()];
  return {
    records: collapsed.map((entry) => entry.record),
    duplicateRowsCollapsed: records.length - collapsed.length,
    duplicateIdsWithConflicts: collapsed
      .filter((entry) => entry.conflict)
      .map((entry) => normalizeIdentity(entry.record.id_envio)),
    sourceValidRows: records.length,
    acceptedRows: collapsed.length,
  };
}

export function splitPreFaturaRecordsByExistingShipmentIds<T extends Pick<PreFaturaRecord, "id_envio">>(
  records: T[],
  existingShipmentIds: Iterable<string>,
) {
  const existing = new Set([...existingShipmentIds].map(normalizeIdentity).filter(Boolean));
  const newRecords: T[] = [];
  const existingRecords: T[] = [];

  records.forEach((record) => {
    if (existing.has(normalizeIdentity(record.id_envio))) {
      existingRecords.push(record);
    } else {
      newRecords.push(record);
    }
  });

  return {
    newRecords,
    existingRecords,
    existingIdsSkipped: existingRecords.length,
  };
}

export function planPreFaturaPersistence<T extends Pick<PreFaturaRecord, "id_envio">>(
  records: T[],
  existingShipmentIds: Iterable<string>,
  alreadyProcessedFile: boolean,
): PreFaturaPersistencePlan<T> {
  if (alreadyProcessedFile) {
    return {
      duplicateFile: true,
      newRecords: [],
      existingRecords: [],
      existingIdsSkipped: 0,
    };
  }

  return {
    duplicateFile: false,
    ...splitPreFaturaRecordsByExistingShipmentIds(records, existingShipmentIds),
  };
}

export function hasPreFaturaPackageIdentity(row: Pick<PreFaturaRecord, "id_envio" | "rota">) {
  return Boolean(normalizeIdentity(row.id_envio) && normalizeIdentity(row.rota));
}

export function isPreFaturaTotalLikeRow(input: Record<string, unknown>) {
  const values = Object.values(input).map((value) => normalizeIdentity(value)).filter(Boolean);
  if (!values.length) return true;
  const joined = values.join(" ");
  return /\bTOTAL(?:\s+GERAL)?\b/.test(joined)
    || /\bSUBTOTAL\b/.test(joined)
    || /\bSOMA\b/.test(joined)
    || values.every((value) => ["TOTAL", "R$", "BRL"].includes(value) || /^[\d.,-]+$/.test(value));
}

export function buildPreFaturaDedupeKey(row: Pick<PreFaturaRecord, "competencia" | "quinzena" | "id_envio" | "codigo_base" | "base" | "driver" | "rota" | "placa" | "data" | "tipo" | "aba_origem" | "valor">) {
  return [
    "pre_fatura",
    normalizeIdentity(row.id_envio),
  ].join("|");
}
